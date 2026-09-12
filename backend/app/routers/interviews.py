"""Interview Kit API router — get, generate, and update interview kits."""

import datetime as dt
import json
import logging
import re
import sqlite3
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..clients.gemini import get_gemini_client
from ..db.database import get_db
from ..engines.feedback.cache_refresher import refresh_insights_cache
from ..engines.interviews.kit_generator import generate_interview_kit

router = APIRouter(prefix="", tags=["interviews"])
logger = logging.getLogger(__name__)


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _safe_json_parse(raw: Any, fallback: Any) -> Any:
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def _ensure_str(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned:
            return cleaned
    return fallback


def _ensure_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if isinstance(v, str) and str(v).strip()]


def _fallback_company_profile(company: str, role_title: str) -> dict[str, Any]:
    clean_company = _ensure_str(company, "Unknown Company")
    clean_role = _ensure_str(role_title, "Unknown Role")
    return {
        "company_name": clean_company,
        "role_title": clean_role,
        "company_summary": f"{clean_company} appears to operate in areas relevant to the {clean_role} role.",
        "company_website": "",
        "sources_note": "Generated from available application context.",
    }


def _is_requires_review_text(value: str) -> bool:
    return "[REQUIRES_REVIEW" in (value or "")


def _normalise_company_profile(raw: Any, company: str, role_title: str) -> dict[str, Any]:
    fallback = _fallback_company_profile(company, role_title)
    if not isinstance(raw, dict):
        return fallback
    legacy_company = _ensure_str(raw.get("company"), "")
    legacy_title = _ensure_str(raw.get("title"), "")
    summary = _ensure_str(raw.get("company_summary"), fallback["company_summary"])
    if _is_requires_review_text(summary):
        summary = fallback["company_summary"]
    return {
        "company_name": _ensure_str(raw.get("company_name"), legacy_company or fallback["company_name"]),
        "role_title": _ensure_str(raw.get("role_title"), legacy_title or fallback["role_title"]),
        "company_summary": summary,
        "company_website": _ensure_str(raw.get("company_website"), fallback["company_website"]),
        "sources_note": _ensure_str(raw.get("sources_note"), fallback["sources_note"]),
    }


def _normalise_question(item: Any, category: str, index: int) -> dict[str, Any]:
    if not isinstance(item, dict):
        item = {"question": str(item)}
    cat = _ensure_str(item.get("category"), category).lower()
    if cat == "company_specific":
        cat = "company"
    if cat not in {"behavioral", "technical", "company"}:
        cat = category

    difficulty = _ensure_str(item.get("difficulty"), "medium").lower()
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"

    return {
        "id": _ensure_str(item.get("id"), f"q-{cat}-{index}"),
        "category": cat,
        "difficulty": difficulty,
        "question": _ensure_str(item.get("question") or item.get("text"), "[REQUIRES_REVIEW: missing question text]"),
        "rationale": _ensure_str(item.get("rationale") or item.get("contextNotes"), "[REQUIRES_REVIEW: missing rationale]"),
        "tags": _ensure_str_list(item.get("tags") or item.get("skills")),
        "star_guidance": item.get("star_guidance") if isinstance(item.get("star_guidance"), dict) else {},
    }


def _normalise_question_bank(raw: Any) -> dict[str, list[dict[str, Any]]]:
    fallback = {
        "behavioral_questions": [],
        "technical_questions": [],
        "company_questions": [],
    }
    if isinstance(raw, list):
        for idx, item in enumerate(raw, start=1):
            q = _normalise_question(item, "technical", idx)
            if q["category"] == "behavioral":
                fallback["behavioral_questions"].append(q)
            elif q["category"] == "company":
                fallback["company_questions"].append(q)
            else:
                fallback["technical_questions"].append(q)
        if not fallback["company_questions"]:
            fallback["company_questions"] = [
                _normalise_question(
                    {
                        "id": "q-company-fallback",
                        "category": "company",
                        "difficulty": "medium",
                        "question": "[REQUIRES_REVIEW: add company-specific question for this role]",
                        "rationale": "Ensures every interview kit has at least one company-specific prompt.",
                        "tags": ["company-context"],
                    },
                    "company",
                    1,
                )
            ]
        return fallback

    if not isinstance(raw, dict):
        return fallback

    result = {
        "behavioral_questions": [
            _normalise_question(q, "behavioral", i)
            for i, q in enumerate(raw.get("behavioral_questions") if isinstance(raw.get("behavioral_questions"), list) else [], start=1)
        ],
        "technical_questions": [
            _normalise_question(q, "technical", i)
            for i, q in enumerate(raw.get("technical_questions") if isinstance(raw.get("technical_questions"), list) else [], start=1)
        ],
        "company_questions": [
            _normalise_question(q, "company", i)
            for i, q in enumerate(raw.get("company_questions") if isinstance(raw.get("company_questions"), list) else [], start=1)
        ],
    }
    if not result["company_questions"]:
        result["company_questions"] = [
            _normalise_question(
                {
                    "id": "q-company-fallback",
                    "category": "company",
                    "difficulty": "medium",
                    "question": "[REQUIRES_REVIEW: add company-specific question for this role]",
                    "rationale": "Ensures every interview kit has at least one company-specific prompt.",
                    "tags": ["company-context"],
                },
                "company",
                1,
            )
        ]
    return result


def _flatten_question_bank(question_bank: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    flat: list[dict[str, Any]] = []
    for key in ("company_questions", "behavioral_questions", "technical_questions"):
        for item in question_bank.get(key, []):
            flat.append({
                "id": item.get("id"),
                "category": "company_specific" if item.get("category") == "company" else item.get("category"),
                "difficulty": item.get("difficulty", "medium"),
                "text": item.get("question", "[REQUIRES_REVIEW: missing question text]"),
                "contextNotes": item.get("rationale", ""),
                "skills": item.get("tags", []),
                "star_guidance": item.get("star_guidance", {}),
            })
    return flat


def _scope_question_to_company(question: str, company: str) -> str:
    text = _ensure_str(question, "")
    company_name = _ensure_str(company, "")
    if not text or not company_name:
        return text
    lower = text.lower()
    if company_name.lower() in lower:
        return text
    if text.endswith("?"):
        return text[:-1] + f" at {company_name}?"
    return f"{text} at {company_name}"


def _scope_question_bank_to_company(question_bank: dict[str, list[dict[str, Any]]], company: str) -> dict[str, list[dict[str, Any]]]:
    scoped: dict[str, list[dict[str, Any]]] = {}
    for key, items in question_bank.items():
        scoped[key] = []
        for item in items:
            q = dict(item)
            q["question"] = _scope_question_to_company(_ensure_str(q.get("question"), ""), company)
            scoped[key].append(q)
    return scoped


def _row_to_kit(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a DB row into a client-friendly dict with parsed JSON."""
    kit = dict(row)
    company = _ensure_str(kit.get("company"), "")
    role_title = _ensure_str(kit.get("job_title"), "")
    company_profile_raw = _safe_json_parse(kit.get("company_profile_json"), {})
    question_bank_raw = _safe_json_parse(kit.get("question_bank_json"), {})
    answer_drafts = _safe_json_parse(kit.get("answer_drafts_json"), [])
    mock_scores = _safe_json_parse(kit.get("mock_scores_json"), [])

    company_profile = _normalise_company_profile(company_profile_raw, company, role_title)
    question_bank = _normalise_question_bank(question_bank_raw)
    question_bank = _scope_question_bank_to_company(question_bank, company_profile.get("company_name", ""))
    flat_questions = _flatten_question_bank(question_bank)

    kit["company_profile_json"] = company_profile
    kit["question_bank_json"] = question_bank
    kit["answer_drafts_json"] = answer_drafts if isinstance(answer_drafts, list) else []
    kit["mock_scores_json"] = mock_scores if isinstance(mock_scores, list) else []

    # Frontend-friendly aliases
    kit["applicationId"] = kit.get("application_id")
    kit["interviewType"] = kit.get("interview_type")
    kit["createdAt"] = kit.get("created_at")
    kit["jobTitle"] = _ensure_str(kit.get("job_title"), company_profile.get("role_title", ""))
    kit["company"] = _ensure_str(kit.get("company"), company_profile.get("company_name", ""))
    kit["companyProfile"] = company_profile
    kit["questionBank"] = question_bank
    kit["questions"] = flat_questions
    kit["answerDrafts"] = kit["answer_drafts_json"]
    kit["mockScores"] = kit["mock_scores_json"]
    return kit


class PatchAnswersBody(BaseModel):
    answers: list[dict[str, Any]]


class MockScoreBody(BaseModel):
    question_id: str
    question: str
    answer: str
    category: str = "behavioral"
    difficulty: str = "medium"


def _clamp_score(value: Any) -> int:
    try:
        as_int = int(round(float(value)))
    except (TypeError, ValueError):
        return 3
    return max(1, min(5, as_int))


def _extract_json_object(raw: str) -> str:
    text = raw.strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    match = re.search(r"\{[\s\S]*\}", text)
    return match.group(0) if match else text


def _fallback_score(answer: str, question_id: str) -> dict[str, Any]:
    words = [w for w in answer.strip().split() if w]
    word_count = len(words)
    has_numbers = bool(re.search(r"\d", answer))
    has_actions = bool(re.search(r"\b(designed|implemented|built|optimized|debugged|led|owned|measured)\b", answer.lower()))
    has_result = bool(re.search(r"\b(result|impact|improved|reduced|increased|faster|latency|reliability)\b", answer.lower()))

    structure = 2 + int(word_count >= 80) + int(word_count >= 150)
    relevance = 2 + int(has_actions) + int(word_count >= 60)
    depth = 2 + int(word_count >= 120) + int(has_numbers)
    specificity = 2 + int(has_numbers) + int(has_result)
    clarity = 2 + int(word_count >= 70) + int(not bool(re.search(r"\b(um|uh)\b", answer.lower())))

    dims = [_clamp_score(v) for v in [structure, relevance, depth, specificity, clarity]]
    final_score = int(round((sum(dims) / (5 * 5)) * 100))

    suggestions: list[str] = []
    if structure < 4:
        suggestions.append("Use a clear STAR flow: context, responsibility, actions, outcome, reflection.")
    if specificity < 4:
        suggestions.append("Add concrete details such as scope, constraints, and measurable outcomes.")
    if depth < 4:
        suggestions.append("Explain one key technical decision and why it was chosen.")
    if not suggestions:
        suggestions.append("Strong answer. Next step: tighten wording to improve clarity and pacing.")

    return {
        "sessionId": str(uuid.uuid4()),
        "questionId": question_id,
        "structureScore": dims[0],
        "relevanceScore": dims[1],
        "technicalDepth": dims[2],
        "specificity": dims[3],
        "clarity": dims[4],
        "finalScore": max(1, min(100, final_score)),
        "suggestions": suggestions[:3],
        "createdAt": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }


async def _gemini_score(
    *,
    question: str,
    answer: str,
    category: str,
    difficulty: str,
    company: str,
    role_title: str,
    question_id: str,
) -> dict[str, Any] | None:
    client = get_gemini_client()
    if client is None:
        return None

    prompt = (
        "You are an interview answer evaluator.\n"
        "Rules:\n"
        "- Return JSON only.\n"
        "- Do not fabricate facts; evaluate only the provided answer text.\n"
        "- Scores must be integers 1-5.\n"
        "- suggestions must be 1-3 concise actionable bullets as plain strings.\n\n"
        f"Company: {company}\n"
        f"Role: {role_title}\n"
        f"Question category: {category}\n"
        f"Question difficulty: {difficulty}\n"
        f"Question: {question}\n"
        f"Candidate answer: {answer}\n\n"
        "Return this JSON shape exactly:\n"
        "{"
        "\"structureScore\": 1,"
        "\"relevanceScore\": 1,"
        "\"technicalDepth\": 1,"
        "\"specificity\": 1,"
        "\"clarity\": 1,"
        "\"suggestions\": [\"...\"]"
        "}"
    )

    try:
        response = await client.generate_content_async(prompt)
        raw = getattr(response, "text", "") or ""
        parsed = json.loads(_extract_json_object(str(raw)))
        if not isinstance(parsed, dict):
            return None
        score = _fallback_score(answer, question_id)
        score["structureScore"] = _clamp_score(parsed.get("structureScore"))
        score["relevanceScore"] = _clamp_score(parsed.get("relevanceScore"))
        score["technicalDepth"] = _clamp_score(parsed.get("technicalDepth"))
        score["specificity"] = _clamp_score(parsed.get("specificity"))
        score["clarity"] = _clamp_score(parsed.get("clarity"))
        suggestions_raw = parsed.get("suggestions")
        if isinstance(suggestions_raw, list):
            clean = [str(s).strip() for s in suggestions_raw if isinstance(s, str) and str(s).strip()]
            if clean:
                score["suggestions"] = clean[:3]
        dims = [
            score["structureScore"],
            score["relevanceScore"],
            score["technicalDepth"],
            score["specificity"],
            score["clarity"],
        ]
        score["finalScore"] = int(round((sum(dims) / (5 * 5)) * 100))
        return score
    except Exception:
        logger.exception("Mock scoring via Gemini failed; using fallback scoring")
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/interviews/{application_id}")
def get_interview_kit(
    application_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Return the interview kit for a given application."""
    row = db.execute(
        "SELECT * FROM interview_kits WHERE application_id = ? ORDER BY created_at DESC LIMIT 1",
        (application_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Interview kit not found")
    return _row_to_kit(row)


@router.get("/interviews")
def get_interview_kits(
    db: sqlite3.Connection = Depends(db_conn),
):
    """Return the latest interview kit per application."""
    rows = db.execute(
        """
        SELECT
            k.*,
            j.title AS job_title,
            j.company AS company
        FROM interview_kits k
        INNER JOIN (
            SELECT application_id, MAX(created_at) AS latest_created_at
            FROM interview_kits
            GROUP BY application_id
        ) latest
            ON latest.application_id = k.application_id
           AND latest.latest_created_at = k.created_at
        LEFT JOIN application_drafts a ON a.id = k.application_id
        LEFT JOIN jobs j ON j.id = a.job_id
        ORDER BY k.created_at DESC
        """
    ).fetchall()
    return [_row_to_kit(row) for row in rows]


@router.post("/interviews/{application_id}/generate")
async def trigger_kit_generation(
    application_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Manually trigger interview kit generation for an application."""
    try:
        kit = await generate_interview_kit(application_id, db)
        return kit
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/interviews/{kit_id}/answers")
def update_answers(
    kit_id: str,
    body: PatchAnswersBody,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Update the answer drafts for an existing interview kit."""
    row = db.execute(
        "SELECT id FROM interview_kits WHERE id = ?",
        (kit_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Interview kit not found")

    db.execute(
        "UPDATE interview_kits SET answer_drafts_json = ? WHERE id = ?",
        (json.dumps(body.answers), kit_id),
    )
    db.commit()
    return {"ok": True, "kit_id": kit_id, "answers_count": len(body.answers)}


@router.post("/interviews/{kit_id}/mock-score")
async def score_mock_answer(
    kit_id: str,
    body: MockScoreBody,
    db: sqlite3.Connection = Depends(db_conn),
):
    row = db.execute(
        """
        SELECT
            k.id,
            k.mock_scores_json,
            j.company AS company,
            j.title AS job_title
        FROM interview_kits k
        LEFT JOIN application_drafts a ON a.id = k.application_id
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE k.id = ?
        """,
        (kit_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Interview kit not found")

    answer_text = _ensure_str(body.answer, "")
    if not answer_text:
        raise HTTPException(status_code=400, detail="Answer is required")

    company = _ensure_str(row["company"], "the company")
    role_title = _ensure_str(row["job_title"], "the role")
    used_ai = False
    score = await _gemini_score(
        question=_ensure_str(body.question, "[REQUIRES_REVIEW: missing question]"),
        answer=answer_text,
        category=_ensure_str(body.category, "behavioral"),
        difficulty=_ensure_str(body.difficulty, "medium"),
        company=company,
        role_title=role_title,
        question_id=_ensure_str(body.question_id, "q-unknown"),
    )
    if score is None:
        score = _fallback_score(answer_text, _ensure_str(body.question_id, "q-unknown"))
    else:
        used_ai = True

    existing = _safe_json_parse(row["mock_scores_json"], [])
    if not isinstance(existing, list):
        existing = []
    existing.append(score)

    db.execute(
        "UPDATE interview_kits SET mock_scores_json = ? WHERE id = ?",
        (json.dumps(existing), kit_id),
    )
    db.commit()
    try:
        await refresh_insights_cache(db)
    except Exception:
        logger.exception("Failed to refresh insights cache after mock scoring")
    return {"score": score, "used_ai": used_ai}

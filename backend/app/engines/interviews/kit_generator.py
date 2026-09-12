"""Interview Kit Generator — schema-safe interview prep content.

Dev notes:
- JSON schema source of truth:
  - company_profile_json follows CompanyProfile
  - question_bank_json follows QuestionBank (behavioral/technical/company groups)
- Fallback behavior:
  - If Gemini is unavailable or returns invalid/malformed JSON, we store deterministic
    placeholder-safe objects instead of failing generation.
- Prompt rules:
  - Model is instructed to return JSON only, never fabricate facts, and emit
    explicit [REQUIRES_REVIEW: ...] placeholders for unknown values.
"""

import hashlib
import json
import logging
import re
import sqlite3
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from typing import Any

from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)


# ── Interview type classification ─────────────────────────────────────────

_TYPE_KEYWORDS: dict[str, list[str]] = {
    "technical_coding": ["algorithm", "leetcode", "coding", "data structure", "whiteboard"],
    "system_design": ["architecture", "scalability", "distributed", "system design", "high availability"],
    "behavioral": ["stakeholder", "collaboration", "leadership", "teamwork", "conflict"],
}


def classify_interview_type(description: str) -> str:
    """Return the most likely interview type based on keyword matching."""
    text_lower = str(description or "").lower()
    scores: dict[str, int] = {}
    for itype, keywords in _TYPE_KEYWORDS.items():
        scores[itype] = sum(1 for kw in keywords if kw in text_lower)

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    if scores[best] == 0:
        return "mixed"
    return best


# ── Helpers ───────────────────────────────────────────────────────────────


def _safe_json_parse(raw: Any, fallback: Any) -> Any:
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def _normalise_skill_names(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    names: list[str] = []
    for value in values:
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                names.append(cleaned)
            continue
        if isinstance(value, dict):
            name = value.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _ensure_str(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned:
            return cleaned
    return fallback


def _ensure_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                result.append(cleaned)
    return result


def _question_id(seed: str, category: str, index: int) -> str:
    digest = hashlib.sha256(f"{seed}:{category}:{index}".encode()).hexdigest()[:10]
    return f"q-{digest}"


def _as_company_paragraph(company: str, summary: str, vision: str) -> str:
    cleaned_summary = " ".join((summary or "").split()).strip()
    cleaned_vision = " ".join((vision or "").split()).strip()
    if not cleaned_summary:
        return f"{company} appears to build software and platform capabilities relevant to this role."

    if cleaned_vision:
        if cleaned_vision[-1] not in ".!?":
            cleaned_vision += "."
    else:
        cleaned_vision = "Public pages reviewed do not clearly state a standalone vision statement."

    if len(cleaned_summary) >= 60 and cleaned_summary[-1] in ".!?":
        return f"{cleaned_summary} {cleaned_vision}".strip()
    if len(cleaned_summary) >= 60:
        return f"{cleaned_summary}. {cleaned_vision}".strip()

    prefix = f"{company} appears to focus on {cleaned_summary}"
    if prefix[-1] not in ".!?":
        prefix += "."
    return f"{prefix} {cleaned_vision}".strip()


def _is_requires_review_text(value: str) -> bool:
    return "[REQUIRES_REVIEW" in (value or "")


def _extract_job_context_summary(job_description: str, company: str) -> str:
    plain = " ".join(re.sub(r"<[^>]+>", " ", str(job_description or "")).split())
    if not plain:
        return f"{company} appears to build software and platform capabilities relevant to this role."
    # Keep short ATS-friendly summary from role context.
    parts = re.split(r"(?<=[.!?])\s+", plain)
    selected: list[str] = []
    for part in parts:
        cleaned = " ".join(part.split()).strip()
        if len(cleaned) < 35:
            continue
        if any(token in cleaned.lower() for token in ("equal opportunity", "accommodation", "privacy notice", "apply now")):
            continue
        selected.append(cleaned)
        if len(selected) >= 2:
            break
    if not selected:
        fallback = plain[:220].strip()
        if fallback and fallback[-1] not in ".!?":
            fallback += "."
        return fallback or f"{company} appears to build software and platform capabilities relevant to this role."
    return " ".join(selected)[:420]


def _normalise_question(item: Any, category: str, index: int, seed: str) -> dict[str, Any]:
    placeholder = "[REQUIRES_REVIEW: missing question text]"
    if not isinstance(item, dict):
        return {
            "id": _question_id(seed, category, index),
            "category": category,
            "question": _ensure_str(item, placeholder),
            "difficulty": "medium",
            "rationale": "[REQUIRES_REVIEW: missing rationale]",
            "tags": [],
            "star_guidance": {},
        }

    raw_category = _ensure_str(item.get("category"), category).lower()
    if raw_category == "company_specific":
        raw_category = "company"
    if raw_category not in {"behavioral", "technical", "company"}:
        raw_category = category

    question_text = _ensure_str(
        item.get("question") or item.get("text"),
        placeholder,
    )
    difficulty = _ensure_str(item.get("difficulty"), "medium").lower()
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"

    star_guidance_raw = item.get("star_guidance")
    star_guidance: dict[str, str] = {}
    if isinstance(star_guidance_raw, dict):
        for key in (
            "situation_hint",
            "task_hint",
            "action_hint",
            "result_hint",
            "reflection_hint",
        ):
            if isinstance(star_guidance_raw.get(key), str) and star_guidance_raw.get(key).strip():
                star_guidance[key] = star_guidance_raw.get(key).strip()

    return {
        "id": _ensure_str(item.get("id"), _question_id(seed, raw_category, index)),
        "category": raw_category,
        "difficulty": difficulty,
        "question": question_text,
        "rationale": _ensure_str(item.get("rationale"), "[REQUIRES_REVIEW: missing rationale]"),
        "tags": _ensure_str_list(item.get("tags") or item.get("skills") or []),
        "star_guidance": star_guidance,
    }


def _extract_role_level(job_title: str) -> str:
    title = (job_title or "").lower()
    if "intern" in title:
        return "intern"
    if "senior" in title or "staff" in title or "principal" in title:
        return "senior"
    if "junior" in title or "new grad" in title or "entry" in title:
        return "junior"
    return "mid"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        text = " ".join(data.split())
        if text:
            self._chunks.append(text)

    def get_text(self) -> str:
        return " ".join(self._chunks)


def _to_sentences(text: str) -> list[str]:
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text)
    result: list[str] = []
    noisy_markers = (
        "skip to main content",
        "skip to footer",
        "cookie",
        "privacy policy",
        "all rights reserved",
        "sign in",
        "log in",
        "learn more",
        "show all",
    )
    for part in parts:
        cleaned = " ".join(part.split()).strip()
        if len(cleaned) < 25:
            continue
        if len(cleaned) > 260:
            continue
        lower = cleaned.lower()
        if lower.startswith(("cookie", "privacy", "terms", "copyright")):
            continue
        if "linkedin" in lower or "courses" in lower:
            continue
        if any(marker in lower for marker in noisy_markers):
            continue
        # Filter nav/menu-like sentences with many short UI words.
        words = cleaned.split()
        if len(words) >= 10:
            short_ratio = sum(1 for w in words if len(w) <= 3) / len(words)
            if short_ratio > 0.55:
                continue
        if cleaned.count("  ") > 0:
            continue
        result.append(cleaned)
    return result


def _pick_sentences(sentences: list[str], keywords: list[str], max_count: int = 2) -> list[str]:
    selected: list[str] = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(kw in lower for kw in keywords):
            selected.append(sentence)
        if len(selected) >= max_count:
            break
    return selected


def _root_company_url(source_url: str) -> str | None:
    try:
        parsed = urlparse(source_url)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _company_domain_guess(company_name: str) -> list[str]:
    slug = re.sub(r"[^a-z0-9]", "", (company_name or "").lower())
    if not slug:
        return []
    return [f"https://{slug}.com", f"https://www.{slug}.com"]


def _fetch_page_text(url: str, max_bytes: int = 180_000) -> str:
    try:
        request = Request(url, headers={"User-Agent": "OnFile/0.1 (+interview-kit)"})
        with urlopen(request, timeout=4) as response:
            payload = response.read(max_bytes).decode("utf-8", errors="ignore")
    except Exception:
        return ""

    parser = _TextExtractor()
    try:
        parser.feed(payload)
        text = parser.get_text()
    except Exception:
        text = payload
    return " ".join(text.split())


def _collect_company_research(job: dict[str, Any]) -> dict[str, Any]:
    source_url = _ensure_str(job.get("source_url"), "")
    company_name = _ensure_str(job.get("company"), "")
    job_desc = _ensure_str(job.get("description"), "")
    urls: list[str] = []
    urls.extend(_company_domain_guess(company_name))
    root = _root_company_url(source_url) if source_url else None
    source_domain = ""
    if source_url:
        try:
            source_domain = (urlparse(source_url).netloc or "").lower()
        except Exception:
            source_domain = ""
    is_noisy_source = "linkedin.com" in source_domain

    if root and not is_noisy_source:
        urls.append(root)
    if source_url and not is_noisy_source:
        urls.append(source_url)

    seen: set[str] = set()
    fetched_sentences: list[str] = []
    used_urls: list[str] = []
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        text = _fetch_page_text(url)
        if not text:
            continue
        used_urls.append(url)
        fetched_sentences.extend(_to_sentences(text[:12_000]))

    summary_candidates = _pick_sentences(
        fetched_sentences,
        ["build", "platform", "software", "helps", "provides", "offers", "company", "product", "erp", "api"],
        max_count=2,
    )
    vision_candidates = _pick_sentences(
        fetched_sentences,
        ["vision", "mission", "goal", "aim", "enable", "empower", "future"],
        max_count=1,
    )
    products_candidates = _pick_sentences(
        fetched_sentences,
        ["product", "platform", "service", "suite", "erp", "automation", "api"],
        max_count=3,
    )

    summary = " ".join(summary_candidates).strip()
    if not summary or _is_requires_review_text(summary):
        summary = _extract_job_context_summary(job_desc, company_name)

    vision = vision_candidates[0].strip() if vision_candidates else ""
    if not vision:
        vision = "The role emphasizes ownership, reliability, and high-quality execution."

    products = products_candidates[:3]
    if not products:
        products = ["Core platform capabilities aligned with the posted role."]

    excerpt = " ".join(fetched_sentences[:8])
    sources_note = (
        f"Summarized from public website text: {', '.join(used_urls)}"
        if used_urls else
        "Generated from provided job and profile context only."
    )

    return {
        "summary": summary,
        "vision": vision,
        "products": products,
        "sources_note": sources_note,
        "research_excerpt": excerpt[:1800],
        "research_sources": used_urls,
    }


def _fallback_company_profile(job: dict[str, Any], research: dict[str, Any] | None = None) -> dict[str, Any]:
    company = _ensure_str(job.get("company"), "Unknown Company")
    role = _ensure_str(job.get("title"), "Unknown Role")
    research = research or {}
    research_summary = _ensure_str(research.get("summary"), "")
    research_vision = _ensure_str(research.get("vision"), "")
    research_products = _ensure_str_list(research.get("products"))
    sources_note = _ensure_str(research.get("sources_note"), "Generated from provided job and profile context only.")
    website = ""
    sources = _ensure_str_list(research.get("research_sources"))
    if sources:
        website = sources[0]
    if not website:
        website = _root_company_url(_ensure_str(job.get("source_url"), "")) or ""
    if not research_summary or _is_requires_review_text(research_summary):
        research_summary = _extract_job_context_summary(_ensure_str(job.get("description"), ""), company)
    vision_value = research_vision or "Public materials emphasize product quality, execution, and customer impact."
    products_value = research_products or ["Core platform capabilities relevant to the role."]
    return {
        "company_name": company,
        "role_title": role,
        "company_summary": _as_company_paragraph(company, research_summary, vision_value),
        "company_website": website,
        "vision": vision_value,
        "products": products_value,
        "culture_signals": ["Collaborative execution", "Ownership mindset", "Product quality focus"],
        "recent_news": ["Review the latest company updates on the official website and newsroom."],
        "interview_focus": ["Reliability and ownership based on role responsibilities"],
        "sources_note": sources_note,
    }


def _fallback_question_bank(job: dict[str, Any], seed: str) -> dict[str, list[dict[str, Any]]]:
    role = _ensure_str(job.get("title"), "this role")
    company = _ensure_str(job.get("company"), "the company")

    behavioral = [
        {
            "id": _question_id(seed, "behavioral", 1),
            "category": "behavioral",
            "difficulty": "medium",
            "question": f"Tell me about a time you took ownership of a backend service issue that would matter in a {role} role at {company}.",
            "rationale": "Tests ownership, accountability, and communication under pressure.",
            "tags": ["ownership", "incident-response"],
            "star_guidance": {
                "situation_hint": "Describe the service context and the user/business impact.",
                "task_hint": "Define your responsibility in resolving or preventing the issue.",
                "action_hint": "Explain concrete debugging, coordination, and mitigation steps.",
                "result_hint": "Share measurable or directional improvement without inventing numbers.",
                "reflection_hint": "State what you changed in process or design afterward.",
            },
        },
        {
            "id": _question_id(seed, "behavioral", 2),
            "category": "behavioral",
            "difficulty": "medium",
            "question": "Describe a time you balanced speed and reliability when shipping an API feature.",
            "rationale": "Evaluates tradeoff judgment and execution discipline.",
            "tags": ["api", "tradeoffs", "delivery"],
            "star_guidance": {
                "situation_hint": "Set context for timeline pressure and quality requirements.",
                "task_hint": "Clarify the delivery objective and constraints.",
                "action_hint": "Cover prioritization, testing, and risk controls.",
                "result_hint": "Explain release outcome and stakeholder response.",
                "reflection_hint": "Highlight what you would improve next time.",
            },
        },
        {
            "id": _question_id(seed, "behavioral", 3),
            "category": "behavioral",
            "difficulty": "medium",
            "question": "Share an example of resolving a disagreement on a technical design decision.",
            "rationale": "Assesses collaboration and engineering communication.",
            "tags": ["collaboration", "design-review"],
            "star_guidance": {
                "situation_hint": "Explain the design context and disagreement.",
                "task_hint": "State what decision had to be made.",
                "action_hint": "Show how you used evidence and communication.",
                "result_hint": "Summarize the final decision and its impact.",
                "reflection_hint": "Mention what you learned about influencing peers.",
            },
        },
        {
            "id": _question_id(seed, "behavioral", 4),
            "category": "behavioral",
            "difficulty": "medium",
            "question": "Tell me about a time you improved reliability or observability in a production system.",
            "rationale": "Targets operational excellence expected in backend roles.",
            "tags": ["reliability", "observability"],
            "star_guidance": {
                "situation_hint": "Describe recurring incidents or blind spots you observed.",
                "task_hint": "State reliability objective and constraints.",
                "action_hint": "Detail instrumentation, alerting, or runbook changes.",
                "result_hint": "Explain how incidents or detection improved.",
                "reflection_hint": "Capture follow-up improvements.",
            },
        },
        {
            "id": _question_id(seed, "behavioral", 5),
            "category": "behavioral",
            "difficulty": "medium",
            "question": "Describe a project where you had to quickly learn a missing skill to deliver results.",
            "rationale": "Evaluates learning velocity and honest gap handling.",
            "tags": ["learning", "adaptability"],
            "star_guidance": {
                "situation_hint": "Describe the skill gap and project stakes.",
                "task_hint": "Define deliverable and timeline.",
                "action_hint": "Explain your learning plan and execution steps.",
                "result_hint": "Share what shipped and quality outcomes.",
                "reflection_hint": "Show how the new skill is now applied.",
            },
        },
    ]

    technical = [
        {
            "id": _question_id(seed, "technical", 1),
            "category": "technical",
            "difficulty": "medium",
            "question": f"How would you design and maintain a highly available backend service for core workflows at {company}?",
            "rationale": "Tests service design under reliability constraints.",
            "tags": ["backend", "high-availability", "system-design"],
        },
        {
            "id": _question_id(seed, "technical", 2),
            "category": "technical",
            "difficulty": "medium",
            "question": "What approach would you use to improve API reliability and error handling in production?",
            "rationale": "Assesses API robustness and operational thinking.",
            "tags": ["api", "reliability", "error-handling"],
        },
        {
            "id": _question_id(seed, "technical", 3),
            "category": "technical",
            "difficulty": "hard",
            "question": "How would you debug and mitigate elevated latency in a critical transaction path?",
            "rationale": "Checks performance triage and incident response depth.",
            "tags": ["performance", "incident-response", "latency"],
        },
        {
            "id": _question_id(seed, "technical", 4),
            "category": "technical",
            "difficulty": "medium",
            "question": "How do you structure on-call runbooks and alerts for backend systems?",
            "rationale": "Measures production-readiness mindset.",
            "tags": ["on-call", "observability", "operations"],
        },
    ]

    company = [
        {
            "id": _question_id(seed, "company", 1),
            "category": "company",
            "difficulty": "medium",
            "question": f"For {company}, which company principle in this role resonates most with your engineering approach, and why?",
            "rationale": "Validates alignment with company culture language from the job context.",
            "tags": ["culture", "values"],
        },
        {
            "id": _question_id(seed, "company", 2),
            "category": "company",
            "difficulty": "medium",
            "question": f"How would you prioritize reliability vs. feature velocity for {company}'s core product workflows in this role?",
            "rationale": "Tests role-specific tradeoff judgment.",
            "tags": ["tradeoffs", "prioritization", "product-workflows"],
        },
    ]

    return {
        "behavioral_questions": behavioral,
        "technical_questions": technical,
        "company_questions": company,
    }


def _ensure_company_profile_shape(data: Any, job: dict[str, Any], research: dict[str, Any] | None = None) -> dict[str, Any]:
    fallback = _fallback_company_profile(job, research)
    if not isinstance(data, dict):
        return fallback
    company_name = _ensure_str(data.get("company_name"), fallback["company_name"])
    vision = _ensure_str(data.get("vision"), fallback["vision"])
    summary = _ensure_str(data.get("company_summary"), fallback["company_summary"])
    if _is_requires_review_text(summary):
        summary = fallback["company_summary"]
    if _is_requires_review_text(vision):
        vision = fallback["vision"]
    if "[REQUIRES_REVIEW" not in summary:
        summary = _as_company_paragraph(company_name, summary, vision)

    result = {
        "company_name": company_name,
        "role_title": _ensure_str(data.get("role_title"), fallback["role_title"]),
        "company_summary": summary,
        "company_website": _ensure_str(data.get("company_website"), fallback.get("company_website", "")),
        "vision": vision,
        "products": [item for item in _ensure_str_list(data.get("products")) if not _is_requires_review_text(item)] or fallback["products"],
        "culture_signals": [item for item in _ensure_str_list(data.get("culture_signals")) if not _is_requires_review_text(item)] or fallback["culture_signals"],
        "recent_news": [item for item in _ensure_str_list(data.get("recent_news")) if not _is_requires_review_text(item)] or fallback["recent_news"],
        "interview_focus": _ensure_str_list(data.get("interview_focus")) or fallback["interview_focus"],
        "sources_note": _ensure_str(data.get("sources_note"), fallback["sources_note"]),
    }
    return result


def _ensure_question_bank_shape(data: Any, job: dict[str, Any], seed: str) -> dict[str, list[dict[str, Any]]]:
    fallback = _fallback_question_bank(job, seed)

    # Legacy: flat questions array
    if isinstance(data, list):
        grouped: dict[str, list[dict[str, Any]]] = {
            "behavioral_questions": [],
            "technical_questions": [],
            "company_questions": [],
        }
        for i, item in enumerate(data, start=1):
            normalised = _normalise_question(item, "technical", i, seed)
            cat = normalised.get("category", "technical")
            if cat == "behavioral":
                grouped["behavioral_questions"].append(normalised)
            elif cat == "company":
                grouped["company_questions"].append(normalised)
            else:
                grouped["technical_questions"].append(normalised)
        return {
            "behavioral_questions": grouped["behavioral_questions"] or fallback["behavioral_questions"],
            "technical_questions": grouped["technical_questions"] or fallback["technical_questions"],
            "company_questions": grouped["company_questions"] or fallback["company_questions"],
        }

    if not isinstance(data, dict):
        return fallback

    behavioral_raw = data.get("behavioral_questions")
    technical_raw = data.get("technical_questions")
    company_raw = data.get("company_questions")

    behavioral = [
        _normalise_question(item, "behavioral", i, seed)
        for i, item in enumerate(behavioral_raw if isinstance(behavioral_raw, list) else [], start=1)
    ]
    technical = [
        _normalise_question(item, "technical", i, seed)
        for i, item in enumerate(technical_raw if isinstance(technical_raw, list) else [], start=1)
    ]
    company = [
        _normalise_question(item, "company", i, seed)
        for i, item in enumerate(company_raw if isinstance(company_raw, list) else [], start=1)
    ]

    return {
        "behavioral_questions": behavioral or fallback["behavioral_questions"],
        "technical_questions": technical or fallback["technical_questions"],
        "company_questions": company or fallback["company_questions"],
    }


def _flatten_question_bank(question_bank: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for key in ("company_questions", "behavioral_questions", "technical_questions"):
        for item in question_bank.get(key, []):
            q = dict(item)
            if q.get("category") == "company":
                q["category"] = "company_specific"
            q["text"] = _ensure_str(q.get("question") or q.get("text"), "[REQUIRES_REVIEW: missing question text]")
            q["skills"] = _ensure_str_list(q.get("tags") or q.get("skills") or [])
            q["contextNotes"] = _ensure_str(q.get("rationale"), "")
            if q.get("difficulty") not in {"easy", "medium", "hard"}:
                q["difficulty"] = "medium"
            flattened.append(q)
    return flattened


def _scope_question_to_company(question: str, company: str) -> str:
    text = " ".join((question or "").split()).strip()
    if not text or not company:
        return text
    lower = text.lower()
    company_lower = company.lower()
    if company_lower in lower:
        return text
    if "company" in lower or "this role" in lower:
        return text.replace("this role", f"this role at {company}").replace("company", company, 1)
    if text.endswith("?"):
        return text[:-1] + f" at {company}?"
    return f"{text} at {company}"


def _apply_company_scope_to_question_bank(question_bank: dict[str, list[dict[str, Any]]], company: str) -> dict[str, list[dict[str, Any]]]:
    if not company:
        return question_bank
    scoped: dict[str, list[dict[str, Any]]] = {}
    for key, questions in question_bank.items():
        scoped[key] = []
        for item in questions:
            q = dict(item)
            q["question"] = _scope_question_to_company(_ensure_str(q.get("question"), ""), company)
            scoped[key].append(q)
    return scoped


# ── Question + profile generation ─────────────────────────────────────────

_PROMPT_TEMPLATE = """
Top rules (non-negotiable):
1) Return valid JSON only. No markdown, no comments.
2) Do not fabricate facts, metrics, dates, products, or company details.
3) If information is unknown, use placeholders like: [REQUIRES_REVIEW: missing company info].
4) Tailor behavioral questions to company/role context from the provided job description.
5) Tailor technical questions to role responsibilities and required skills from the job description.
6) Keep the output schema exactly as requested.

Context:
company_name: {company_name}
role_title: {role_title}
role_level_hint: {role_level}
job_description:\n{job_description}
public_research_sources: {research_sources}
public_research_excerpt:\n{research_excerpt}
profile_skills: {profile_skills}
recent_experience: {recent_experience}
project_highlights: {project_highlights}

Required output JSON schema:
{{
  "company_profile": {{
    "company_name": "string",
    "role_title": "string",
    "company_summary": "string",
    "vision": "string",
    "products": ["string"],
    "culture_signals": ["string"],
    "recent_news": ["string"],
    "interview_focus": ["string"],
    "sources_note": "string"
  }},
  "question_bank": {{
    "behavioral_questions": [
      {{
        "id": "string",
        "category": "behavioral",
        "difficulty": "easy|medium|hard",
        "question": "string",
        "rationale": "string",
        "tags": ["string"],
        "star_guidance": {{
          "situation_hint": "string",
          "task_hint": "string",
          "action_hint": "string",
          "result_hint": "string",
          "reflection_hint": "string"
        }}
      }}
    ],
    "technical_questions": [
      {{
        "id": "string",
        "category": "technical",
        "difficulty": "easy|medium|hard",
        "question": "string",
        "rationale": "string",
        "tags": ["string"]
      }}
    ],
    "company_questions": [
      {{
        "id": "string",
        "category": "company",
        "difficulty": "easy|medium|hard",
        "question": "string",
        "rationale": "string",
        "tags": ["string"]
      }}
    ]
  }}
}}

Generate 5 behavioral questions, 4 technical questions, and 2 company questions.
Return JSON only.
"""


async def _generate_company_research_and_questions(
    application_id: str,
    job: dict[str, Any],
    profile: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    seed = _ensure_str(application_id, f"seed-{_ensure_str(job.get('title'), 'role')}")
    research = _collect_company_research(job)
    fallback_company = _fallback_company_profile(job, research)
    fallback_bank = _fallback_question_bank(job, seed)

    client = get_gemini_client()
    if client is None:
        return fallback_company, fallback_bank

    experience = profile.get("experience_json") if isinstance(profile.get("experience_json"), list) else []
    projects = profile.get("projects_json") if isinstance(profile.get("projects_json"), list) else []
    recent_experience = []
    for entry in experience[:2]:
        if isinstance(entry, dict):
            role = _ensure_str(entry.get("role"), "")
            company = _ensure_str(entry.get("company"), "")
            if role or company:
                recent_experience.append(f"{role} @ {company}".strip(" @"))

    project_highlights = []
    for entry in projects[:2]:
        if isinstance(entry, dict):
            name = _ensure_str(entry.get("name"), "")
            desc = _ensure_str(entry.get("description"), "")
            if name or desc:
                project_highlights.append(f"{name}: {desc}".strip())

    prompt = _PROMPT_TEMPLATE.format(
        company_name=_ensure_str(job.get("company"), "[REQUIRES_REVIEW: missing company name]"),
        role_title=_ensure_str(job.get("title"), "[REQUIRES_REVIEW: missing role title]"),
        role_level=_extract_role_level(_ensure_str(job.get("title"), "")),
        job_description=str(job.get("description", ""))[:3500],
        research_sources=", ".join(_ensure_str_list(research.get("research_sources"))) or "[REQUIRES_REVIEW: no public source available]",
        research_excerpt=_ensure_str(research.get("research_excerpt"), "[REQUIRES_REVIEW: no public company text retrieved]"),
        profile_skills=", ".join(_normalise_skill_names(profile.get("skills_json"))[:20]),
        recent_experience=", ".join(recent_experience) or "[REQUIRES_REVIEW: missing experience context]",
        project_highlights="; ".join(project_highlights) or "[REQUIRES_REVIEW: missing project context]",
    )

    try:
        response = await client.generate_content_async(prompt)
        raw = (response.text or "").strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]
        parsed = _safe_json_parse(raw, {})
        if not isinstance(parsed, dict):
            return fallback_company, fallback_bank

        company_profile = _ensure_company_profile_shape(parsed.get("company_profile"), job, research)
        question_bank = _ensure_question_bank_shape(parsed.get("question_bank"), job, seed)
        return company_profile, question_bank
    except Exception:
        logger.exception("Gemini company/question generation failed — using fallback")
        return fallback_company, fallback_bank


# ── STAR answer drafts ────────────────────────────────────────────────────

_STAR_PROMPT = (
    "Generate a STAR-format answer draft for this interview question, "
    "using the candidate's background.\n\n"
    "Question: {question}\n\n"
    "Candidate background:\n"
    "- Skills: {skills}\n"
    "- Recent role: {recent_role}\n\n"
    "Return ONLY valid JSON with keys: situation, task, action, result, reflection.\n"
    "Each value should be 1-2 sentences. Do NOT invent facts — use generic phrasing "
    "that the candidate can customise.\n"
    "Return ONLY the JSON object, no markdown."
)


async def _generate_star_drafts(
    question_bank: dict[str, list[dict[str, Any]]],
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    """Generate STAR drafts for the top 3 behavioral questions."""
    behavioral = question_bank.get("behavioral_questions", [])[:3]
    if not behavioral:
        return []

    client = get_gemini_client()
    drafts: list[dict[str, Any]] = []

    skills_str = ", ".join(_normalise_skill_names(profile.get("skills_json"))[:15])
    experience = profile.get("experience_json") if isinstance(profile.get("experience_json"), list) else []
    recent_role = ""
    if experience:
        first = experience[0]
        if isinstance(first, dict):
            role = _ensure_str(first.get("role"), "")
            company = _ensure_str(first.get("company"), "")
            if role and company:
                recent_role = f"{role} at {company}"
            else:
                recent_role = role or company

    for q in behavioral:
        qid = _ensure_str(q.get("id"), _question_id("fallback", "behavioral", len(drafts) + 1))
        qtext = _ensure_str(q.get("question") or q.get("text"), "[REQUIRES_REVIEW: missing question text]")

        draft: dict[str, Any] = {
            "questionId": qid,
            "situation": "Describe the context and setting.",
            "task": "Explain what you needed to accomplish.",
            "action": "Detail the specific steps you took.",
            "result": "Share the measurable outcome.",
            "reflection": "What did you learn from this experience?",
        }

        if client is not None:
            try:
                prompt = _STAR_PROMPT.format(
                    question=qtext,
                    skills=skills_str,
                    recent_role=recent_role,
                )
                response = await client.generate_content_async(prompt)
                raw = (response.text or "").strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1]
                    raw = raw.rsplit("```", 1)[0]
                parsed = _safe_json_parse(raw, {})
                if isinstance(parsed, dict):
                    draft = {
                        "questionId": qid,
                        "situation": _ensure_str(parsed.get("situation"), draft["situation"]),
                        "task": _ensure_str(parsed.get("task"), draft["task"]),
                        "action": _ensure_str(parsed.get("action"), draft["action"]),
                        "result": _ensure_str(parsed.get("result"), draft["result"]),
                        "reflection": _ensure_str(parsed.get("reflection"), draft["reflection"]),
                    }
            except Exception:
                logger.exception("STAR draft generation failed for q=%s", qid)

        drafts.append(draft)

    return drafts


# ── Public API ────────────────────────────────────────────────────────────

async def generate_interview_kit(
    application_id: str,
    db: sqlite3.Connection,
) -> dict[str, Any]:
    """Generate a full interview kit for an application.

    Expects the application to reference a valid job. Inserts the kit
    into ``interview_kits`` and returns a frontend-friendly payload.
    """
    # Load application
    app_row = db.execute(
        "SELECT * FROM application_drafts WHERE id = ?",
        (application_id,),
    ).fetchone()
    if app_row is None:
        raise ValueError(f"Application {application_id!r} not found")
    application = dict(app_row)

    # Load job
    job_id = application.get("job_id")
    job_row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job_row is None:
        raise ValueError(f"Job {job_id!r} not found for application")
    job = dict(job_row)

    # Load user profile
    profile_row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    profile: dict[str, Any] = {}
    if profile_row:
        profile = dict(profile_row)
        for col in ("skills_json", "experience_json", "projects_json"):
            profile[col] = _safe_json_parse(profile.get(col), [])

    # Classify interview type
    interview_type = classify_interview_type(job.get("description", ""))

    # Generate company profile + grouped question bank
    company_profile, question_bank = await _generate_company_research_and_questions(
        application_id=application_id,
        job=job,
        profile=profile,
    )
    company_name = _ensure_str(company_profile.get("company_name"), _ensure_str(job.get("company"), ""))
    question_bank = _apply_company_scope_to_question_bank(question_bank, company_name)

    # Generate STAR drafts
    answer_drafts = await _generate_star_drafts(question_bank, profile)

    # Keep legacy flat question list for existing UI/consumers
    questions = _flatten_question_bank(question_bank)

    # Build kit ID
    now = datetime.utcnow().isoformat()
    kit_id = "kit-" + hashlib.sha256(f"{application_id}{now}".encode()).hexdigest()[:8]

    # INSERT into interview_kits
    db.execute(
        """INSERT INTO interview_kits
           (id, application_id, interview_type, company_profile_json,
            question_bank_json, answer_drafts_json, mock_scores_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            kit_id,
            application_id,
            interview_type,
            json.dumps(company_profile),
            json.dumps(question_bank),
            json.dumps(answer_drafts),
            json.dumps([]),
            now,
        ),
    )
    db.commit()

    logger.info(
        "Created interview kit %s (type=%s, total_questions=%d)",
        kit_id,
        interview_type,
        len(questions),
    )

    return {
        "id": kit_id,
        "applicationId": application_id,
        "jobTitle": job.get("title", ""),
        "company": job.get("company", ""),
        "interviewType": interview_type,
        "companyProfile": company_profile,
        "questionBank": question_bank,
        "questions": questions,
        "answerDrafts": answer_drafts,
        "mockScores": [],
        "createdAt": now,
    }

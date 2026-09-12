"""Job Description Analyzer — extracts structured requirements from raw JD text.

Phase 1: Rule-based extraction (regex + skill_taxonomy matching).
Phase 2: LLM-assisted extraction via Gemini (merged with Phase 1).
Falls back to Phase 1 only when Gemini is unavailable or returns an error.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any

from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)

# ── Load skill taxonomy once at import time ────────────────────────────────
_TAXONOMY_PATH = Path(__file__).resolve().parents[2] / "data" / "skill_taxonomy.json"

_SKILLS: list[str] = []
if _TAXONOMY_PATH.exists():
    with open(_TAXONOMY_PATH, encoding="utf-8") as f:
        _SKILLS = json.load(f)
else:
    logger.warning("skill_taxonomy.json not found at %s", _TAXONOMY_PATH)

# Pre-compile lowercase lookup for case-insensitive matching
_SKILLS_LOWER = {s.lower(): s for s in _SKILLS}


# ── Phase 1: Rule-based analysis ──────────────────────────────────────────

_YEARS_RE = re.compile(r"(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience", re.IGNORECASE)


def _extract_experience_years(text: str) -> int:
    """Return the maximum 'X years of experience' value found, or 0."""
    matches = _YEARS_RE.findall(text)
    return max((int(m) for m in matches), default=0)


def _extract_skills(text: str) -> list[str]:
    """Return taxonomy skills found in *text* (case-insensitive)."""
    text_lower = text.lower()
    found: list[str] = []
    for skill_lower, skill_canonical in _SKILLS_LOWER.items():
        # Word-boundary check to avoid partial matches (e.g. "Go" inside "Google")
        pattern = rf"\b{re.escape(skill_lower)}\b"
        if re.search(pattern, text_lower):
            found.append(skill_canonical)
    return found


def _guess_domain(text: str) -> str:
    """Return a coarse domain label based on keyword heuristics."""
    text_lower = text.lower()
    domain_keywords: dict[str, list[str]] = {
        "machine learning": ["machine learning", "deep learning", "ml ", "ai ", "data science"],
        "data engineering": ["data pipeline", "etl", "data engineer", "airflow", "spark"],
        "frontend": ["frontend", "react", "vue", "angular", "css", "ui engineer"],
        "backend": ["backend", "server-side", "api engineer", "microservice"],
        "devops": ["devops", "sre", "infrastructure", "terraform", "kubernetes"],
        "full stack": ["full stack", "fullstack"],
    }
    for domain, keywords in domain_keywords.items():
        if any(kw in text_lower for kw in keywords):
            return domain
    return "software engineering"


def _rule_based_analysis(text: str) -> dict[str, Any]:
    """Phase 1 — pure rule-based extraction."""
    skills = _extract_skills(text)
    return {
        "required_skills": skills,
        "preferred_skills": [],
        "experience_years": _extract_experience_years(text),
        "domain": _guess_domain(text),
        "keywords": skills[:10],
    }


# ── Phase 2: LLM-assisted analysis ───────────────────────────────────────

_GEMINI_PROMPT = (
    "Extract structured requirements from this job description as JSON with keys: "
    "required_skills (list of strings), preferred_skills (list of strings), "
    "experience_years (int), domain (string), keywords (list of strings). "
    "Return ONLY valid JSON, no markdown, no explanation.\n\n"
    "Job description:\n{text}"
)


def _merge_analyses(rule: dict[str, Any], llm: dict[str, Any]) -> dict[str, Any]:
    """Merge rule-based and LLM results — union skills, max experience."""
    def _unique_list(*lists: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for lst in lists:
            for item in lst:
                key = item.lower()
                if key not in seen:
                    seen.add(key)
                    out.append(item)
        return out

    return {
        "required_skills": _unique_list(
            rule.get("required_skills", []),
            llm.get("required_skills", []),
        ),
        "preferred_skills": _unique_list(
            rule.get("preferred_skills", []),
            llm.get("preferred_skills", []),
        ),
        "experience_years": max(
            rule.get("experience_years", 0),
            llm.get("experience_years", 0),
        ),
        "domain": llm.get("domain") or rule.get("domain", "software engineering"),
        "keywords": _unique_list(
            rule.get("keywords", []),
            llm.get("keywords", []),
        ),
    }


# ── Public API ────────────────────────────────────────────────────────────

async def analyze_job_description(text: str) -> dict[str, Any]:
    """Analyse a raw job description and return structured requirements.

    Returns a dict with keys:
    - ``required_skills``  – list[str]
    - ``preferred_skills`` – list[str]
    - ``experience_years`` – int
    - ``domain``           – str
    - ``keywords``         – list[str]
    """
    # Phase 1 — always runs
    rule_result = _rule_based_analysis(text)

    # Phase 2 — attempt Gemini extraction
    client = get_gemini_client()
    if client is None:
        logger.info("Gemini unavailable — returning rule-based analysis only")
        return rule_result

    try:
        prompt = _GEMINI_PROMPT.format(text=text[:6000])  # cap input length
        response = await client.generate_content_async(prompt)
        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]

        llm_result: dict[str, Any] = json.loads(raw)
        return _merge_analyses(rule_result, llm_result)
    except Exception:
        logger.exception("Gemini JD analysis failed — falling back to rule-based")
        return rule_result

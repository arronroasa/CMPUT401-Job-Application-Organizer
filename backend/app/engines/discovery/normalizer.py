import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .adapters.base import RawJobData

_SKILL_TAXONOMY_PATH = Path(__file__).resolve().parents[2] / "data" / "skill_taxonomy.json"


def _load_skill_taxonomy() -> list[str]:
    if not _SKILL_TAXONOMY_PATH.exists():
        return []
    with open(_SKILL_TAXONOMY_PATH, encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        return []
    return [str(item).strip() for item in payload if str(item).strip()]


SKILL_TAXONOMY = _load_skill_taxonomy()


def _extract_skills(description: str) -> list[dict[str, Any]]:
    description_lower = description.lower()
    found: list[dict[str, Any]] = []
    for skill in SKILL_TAXONOMY:
        pattern = rf"\b{re.escape(skill.lower())}\b"
        if re.search(pattern, description_lower):
            found.append({"name": skill, "required": True, "userHas": False})
    return found


def normalize_job(raw: RawJobData) -> dict[str, Any]:
    source_url = str(raw.source_url or "").strip().lower()
    if source_url:
        job_id_source = f"{source_url}|{raw.title}|{raw.company}|{raw.location}".strip().lower()
    else:
        job_id_source = f"{raw.title}|{raw.company}|{raw.location}".strip().lower()
    job_id = hashlib.sha256(job_id_source.encode("utf-8")).hexdigest()[:16]
    now = datetime.utcnow().isoformat()
    is_remote = "remote" in raw.location.lower() or "remote" in raw.description.lower()
    skills = _extract_skills(raw.description)

    return {
        "id": job_id,
        "title": raw.title,
        "company": raw.company,
        "location": raw.location,
        "remote": 1 if is_remote else 0,
        "description": raw.description,
        "skills_required_json": json.dumps(skills),
        "source": raw.source,
        "source_url": raw.source_url,
        "match_score": 0.0,
        "match_tier": "low",
        "posted_date": raw.posted_date,
        "discovered_at": now,
        "is_archived": 0,
    }


def normalize_jobs(raw_jobs: list[RawJobData]) -> list[dict[str, Any]]:
    return [normalize_job(raw) for raw in raw_jobs]

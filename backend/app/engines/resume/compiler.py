"""Resume Compiler — orchestrates the full resume generation pipeline.

Pipeline:
1.  Load job from DB
2.  Load user profile from DB
3.  Analyse job description          (jd_analyzer)
4.  Select relevant fragments        (fragment_selector)
5.  Rewrite bullets via Gemini       (bullet_rewriter — uses rules.md + tailoring_strategy.md)
6.  Compute strength_score
7.  Generate resume_version_id
8.  INSERT into resume_versions      (single Jake-style row)
9.  Return one complete resume version dict

Call compile_resume_all()  →  list[dict]   (single-item list for backwards compatibility)
Call compile_resume()      →  dict          (single version, backwards-compat)
"""

import hashlib
import json
import logging
import sqlite3
from datetime import datetime
from typing import Any

from .jd_analyzer import analyze_job_description
from .fragment_selector import select_fragments
from .bullet_rewriter import rewrite_bullet
from .agent_loader import RULES_MD, TAILORING_MD

logger = logging.getLogger(__name__)

# Human-readable template labels shown in the UI sidebar.
_TEMPLATE_LABELS = {
    "classic-serif": "Jake ATS",
}
_PRIMARY_TEMPLATE_ID = "classic-serif"


def _normalise_skill_names(values: list[Any]) -> list[str]:
    names: list[str] = []
    for value in values:
        if isinstance(value, str):
            if value.strip():
                names.append(value.strip())
            continue
        if isinstance(value, dict):
            name = value.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _load_job(job_id: str, db: sqlite3.Connection) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    job = dict(row)
    if isinstance(job.get("skills_required_json"), str):
        try:
            job["skills_required_json"] = json.loads(job["skills_required_json"])
        except json.JSONDecodeError:
            job["skills_required_json"] = []
    return job


def _load_profile(db: sqlite3.Connection) -> dict[str, Any] | None:
    active_profile_id = "local"
    try:
        settings_row = db.execute(
            "SELECT active_profile_id FROM settings WHERE id = 1"
        ).fetchone()
        if settings_row is not None:
            candidate = str(settings_row[0] or "").strip()
            if candidate:
                active_profile_id = candidate
    except sqlite3.Error:
        active_profile_id = "local"

    row = db.execute(
        "SELECT * FROM user_profile WHERE id = ?",
        (active_profile_id,),
    ).fetchone()
    if row is None and active_profile_id != "local":
        row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if row is None:
        return None
    profile = dict(row)
    for col in ("skills_json", "experience_json", "projects_json",
                "certifications_json", "education_json", "role_interests_json"):
        raw = profile.get(col)
        if isinstance(raw, str):
            try:
                profile[col] = json.loads(raw)
            except json.JSONDecodeError:
                profile[col] = []
    return profile


def _compute_strength(jd_analysis: dict, resume_skills: list[Any]) -> float:
    """strength_score = |required ∩ resume| / |required|."""
    required = {s.lower() for s in jd_analysis.get("required_skills", [])}
    if not required:
        return 0.0
    present = {s.lower() for s in _normalise_skill_names(resume_skills)}
    return round(len(required & present) / len(required), 4)


def _version_id(job_id: str, template_id: str) -> str:
    # Keep a stable ID per (job, template) so re-generation updates the same
    # tailored resume instead of stacking duplicates in Resume Studio.
    raw = f"{job_id}{template_id}"
    return "rv-" + hashlib.sha256(raw.encode()).hexdigest()[:8]


async def _compile_single(
    job: dict[str, Any],
    profile: dict[str, Any],
    jd_analysis: dict[str, Any],
    fragments: dict[str, list[dict[str, Any]]],
    rewritten_experience: list[dict[str, Any]],
    all_resume_skills: list[str],
    template_id: str,
    now: str,
    db: sqlite3.Connection,
) -> dict[str, Any]:
    """Insert one resume_version row for the given template and return its dict."""
    strength_score = _compute_strength(jd_analysis, all_resume_skills)

    version_id = _version_id(job["id"], template_id)

    # Build a clean ordered skills list: JD-matched skills first, then rest
    required_lower = {s.lower() for s in jd_analysis.get("required_skills", [])}
    matched_skills = [s for s in all_resume_skills if s.lower() in required_lower]
    other_skills = [s for s in all_resume_skills if s.lower() not in required_lower]
    ordered_skills = list(dict.fromkeys(matched_skills + other_skills))  # dedup, order preserved

    # Education — from dedicated education_json column (falls back to resume_parsed_json)
    education = profile.get("education_json", [])
    if not isinstance(education, list):
        education = []
    if not education:
        # Fallback: try resume_parsed_json
        raw_parsed = profile.get("resume_parsed_json")
        if isinstance(raw_parsed, str):
            try:
                parsed_resume = json.loads(raw_parsed)
                education = parsed_resume.get("education", [])
                if not isinstance(education, list):
                    education = []
            except json.JSONDecodeError:
                pass

    # Certifications
    certifications = profile.get("certifications_json", [])
    if not isinstance(certifications, list):
        certifications = []

    # Build experience date lookup: { "company::role" -> {startDate, endDate, current} }
    exp_date_lookup: dict[str, dict[str, Any]] = {}
    for exp_entry in profile.get("experience_json", []):
        if not isinstance(exp_entry, dict):
            continue
        company = str(exp_entry.get("company", "")).strip()
        role = str(exp_entry.get("role", "")).strip()
        key = f"{company}::{role}"
        exp_date_lookup[key] = {
            "startDate": exp_entry.get("startDate") or exp_entry.get("start_date") or "",
            "endDate": exp_entry.get("endDate") or exp_entry.get("end_date") or "",
            "current": bool(exp_entry.get("current")),
        }

    content = {
        "profile_id": profile.get("id", "local"),
        "profile_name": profile.get("name", ""),
        "profile_email": profile.get("email", ""),
        "profile_phone": profile.get("phone", ""),
        "profile_location": profile.get("location", ""),
        "profile_linkedin": profile.get("linkedin_url", ""),
        "profile_github": profile.get("github_url", ""),
        "profile_portfolio": profile.get("portfolio_url", ""),
        "summary": profile.get("summary", ""),
        "fragments": {
            "experience": rewritten_experience,
            "projects": fragments.get("projects", []),
        },
        "exp_date_lookup": exp_date_lookup,
        "skills": ordered_skills,
        "education": education,
        "certifications": certifications,
        "jd_analysis": jd_analysis,
        "template_id": template_id,
    }

    template_label = _TEMPLATE_LABELS.get(template_id, template_id)
    label = f"{job.get('title', 'Unknown')} @ {job.get('company', 'Unknown')} [{template_label}]"

    db.execute(
        """INSERT OR REPLACE INTO resume_versions
           (id, label, type, job_id, template_id, content_json,
            strength_score, keyword_coverage, skill_alignment, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            version_id,
            label,
            "tailored",
            job["id"],
            template_id,
            json.dumps(content),
            strength_score,
            strength_score,
            strength_score,
            now,
        ),
    )

    logger.info(
        "Created resume version %s template=%s strength=%.0f%%",
        version_id, template_id, strength_score * 100,
    )

    return {
        "id": version_id,
        "label": label,
        "type": "tailored",
        "job_id": job["id"],
        "template_id": template_id,
        "content": content,
        "strength_score": strength_score,
        "created_at": now,
    }


async def compile_resume_all(
    job_id: str,
    db: sqlite3.Connection,
) -> list[dict[str, Any]]:
    """Generate one tailored resume version for the given job.

    Returns a single-item list of dicts, each matching a resume_versions row plus
    ``content`` and ``jd_analysis`` for transparency.
    Raises ValueError if the job or profile is not found.
    """
    # 1. Load job
    job = _load_job(job_id, db)
    if job is None:
        raise ValueError(f"Job {job_id!r} not found")

    # 2. Load profile
    profile = _load_profile(db)
    if profile is None:
        raise ValueError("No user profile found — create one first")

    # 3. Analyse JD
    jd_analysis = await analyze_job_description(job.get("description", ""))
    if not _normalise_skill_names(jd_analysis.get("required_skills", [])):
        jd_analysis["required_skills"] = _normalise_skill_names(
            job.get("skills_required_json", [])
        )

    # 4. Select fragments
    fragments = select_fragments(jd_analysis, profile)

    # 5. Rewrite bullets once (rules.md + tailoring_strategy.md injected into prompt)
    domain = jd_analysis.get("domain", "software engineering")
    required_skills = jd_analysis.get("required_skills", [])
    rewritten_experience: list[dict[str, Any]] = []
    for frag in fragments.get("experience", []):
        original = frag.get("text", "")
        rewritten = await rewrite_bullet(original, required_skills, domain)
        rewritten_experience.append({**frag, "rewritten_text": rewritten})

    # 6. Collect all skills for strength scoring
    all_resume_skills: list[str] = []
    for frag in rewritten_experience:
        all_resume_skills.extend(_normalise_skill_names(frag.get("skills", [])))
    for frag in fragments.get("projects", []):
        all_resume_skills.extend(_normalise_skill_names(frag.get("skills", [])))
    all_resume_skills.extend(_normalise_skill_names(profile.get("skills_json", [])))

    now = datetime.utcnow().isoformat()

    # 7–8. Generate one Jake-style version
    version = await _compile_single(
        job=job,
        profile=profile,
        jd_analysis=jd_analysis,
        fragments=fragments,
        rewritten_experience=rewritten_experience,
        all_resume_skills=all_resume_skills,
        template_id=_PRIMARY_TEMPLATE_ID,
        now=now,
        db=db,
    )

    db.commit()
    return [version]


async def compile_resume(
    job_id: str,
    db: sqlite3.Connection,
) -> dict[str, Any]:
    """Single-version compile in Jake/classic format."""
    versions = await compile_resume_all(job_id, db)
    return versions[0]

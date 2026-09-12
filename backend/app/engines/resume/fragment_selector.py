"""Fragment Selector — picks the most relevant experience and project bullets.

Given a JD analysis and user profile, each bullet/project is scored and the
top fragments are returned along with a human-readable ``selection_reason``.
"""

import logging
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)


# ── Scoring helpers ───────────────────────────────────────────────────────

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


def _normalise_bullet(bullet: Any, default_skills: list[str]) -> dict[str, Any]:
    if isinstance(bullet, str):
        return {"text": bullet.strip(), "skills": default_skills}
    if isinstance(bullet, dict):
        text = bullet.get("text")
        if not isinstance(text, str):
            text = bullet.get("description") or bullet.get("bullet") or ""
        return {
            "text": str(text).strip(),
            "skills": _normalise_skill_names(bullet.get("skills", default_skills)),
        }
    return {"text": "", "skills": default_skills}


def _skill_overlap(item_skills: list[Any], target_skills: list[Any]) -> float:
    """Fraction of *target_skills* covered by *item_skills* (0.0–1.0)."""
    item = _normalise_skill_names(item_skills)
    target = _normalise_skill_names(target_skills)
    if not target:
        return 0.0
    item_set = {s.lower() for s in item}
    target_set = {s.lower() for s in target}
    overlap = item_set & target_set
    return len(overlap) / len(target_set)


def _impact_score(bullet: dict[str, Any]) -> float:
    """Heuristic impact score based on presence of quantitative metrics.

    Returns a float 0.0–1.0. Bullets containing numbers/percentages score
    higher because they demonstrate measurable impact.
    """
    text: str = bullet.get("text", "")
    score = 0.0

    # Contains a number or percentage → likely quantified impact
    import re
    if re.search(r"\d+%", text):
        score += 0.5
    if re.search(r"\b\d{2,}\b", text):
        score += 0.3

    # Contains strong action verbs
    strong_verbs = {"led", "built", "designed", "architected", "reduced",
                    "increased", "improved", "launched", "migrated", "optimised",
                    "optimized", "scaled", "automated", "delivered"}
    first_word = text.split()[0].lower() if text else ""
    if first_word in strong_verbs:
        score += 0.2

    return min(score, 1.0)


def _recency_score(end_date_str: str | None) -> float:
    """Score 0.0–1.0 based on how recent the experience is.

    ``None`` or ``'present'`` → 1.0 (current role).
    """
    if not end_date_str or end_date_str.lower() == "present":
        return 1.0

    try:
        end = datetime.fromisoformat(end_date_str).date()
    except (ValueError, TypeError):
        return 0.5  # can't parse → mid-range default

    days_ago = (date.today() - end).days
    if days_ago <= 365:
        return 0.9
    if days_ago <= 730:
        return 0.7
    if days_ago <= 1460:
        return 0.4
    return 0.2


def _score_bullet(
    bullet: dict[str, Any],
    required_skills: list[str],
    end_date: str | None,
) -> float:
    """Composite score: skill_overlap×0.6 + impact×0.3 + recency×0.1."""
    bullet_skills = _normalise_skill_names(bullet.get("skills", []))
    return (
        _skill_overlap(bullet_skills, required_skills) * 0.6
        + _impact_score(bullet) * 0.3
        + _recency_score(end_date) * 0.1
    )


def _build_reason(
    bullet: dict[str, Any],
    required_skills: list[str],
    score: float,
) -> str:
    """Generate a short human-readable reason for selecting this fragment."""
    required_lower = {r.lower() for r in _normalise_skill_names(required_skills)}
    matched = {
        s for s in _normalise_skill_names(bullet.get("skills", []))
        if s.lower() in required_lower
    }
    parts: list[str] = []
    if matched:
        parts.append(f"matches skills: {', '.join(sorted(matched))}")
    parts.append(f"relevance score {score:.0%}")
    return "; ".join(parts) if parts else "general relevance"


# ── Public API ────────────────────────────────────────────────────────────

def select_fragments(
    jd_analysis: dict[str, Any],
    user_profile: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """Return the most relevant experience bullets and projects.

    Parameters
    ----------
    jd_analysis : dict
        Output of ``analyze_job_description`` — must contain
        ``required_skills``.
    user_profile : dict
        User profile dict — expected keys ``experience_json`` (list of
        experience entries, each with ``bullets`` list, ``end_date``) and
        ``projects_json`` (list of project entries, each with ``skills``).

    Returns
    -------
    dict with keys ``experience`` and ``projects``, each a list of selected
    fragment dicts augmented with ``selection_reason`` and ``score``.
    """
    required_skills: list[str] = _normalise_skill_names(jd_analysis.get("required_skills", []))
    experience_entries = user_profile.get("experience_json")
    if not isinstance(experience_entries, list):
        experience_entries = []
    project_entries = user_profile.get("projects_json")
    if not isinstance(project_entries, list):
        project_entries = []

    # ── Score & select experience bullets ──────────────────────────────
    scored_experience: list[dict[str, Any]] = []
    for entry in experience_entries:
        if not isinstance(entry, dict):
            continue

        end_date = entry.get("end_date") or entry.get("endDate")
        entry_skills = _normalise_skill_names(entry.get("skills", []))
        bullets = entry.get("bullets", [])
        if isinstance(bullets, str):
            bullets = [bullets]
        if not isinstance(bullets, list):
            bullets = []
        if not bullets:
            description = entry.get("description")
            if isinstance(description, str) and description.strip():
                bullets = [description.strip()]

        for bullet in bullets:
            normalised = _normalise_bullet(bullet, entry_skills)
            if not normalised["text"]:
                continue

            score = _score_bullet(normalised, required_skills, end_date)
            scored_experience.append({
                **(bullet if isinstance(bullet, dict) else {}),
                **normalised,
                "company": entry.get("company", ""),
                "role": entry.get("role", ""),
                "startDate": entry.get("startDate") or entry.get("start_date") or "",
                "endDate": entry.get("endDate") or entry.get("end_date") or "",
                "current": bool(entry.get("current")),
                "score": round(score, 4),
                "selection_reason": _build_reason(normalised, required_skills, score),
            })

    scored_experience.sort(key=lambda b: b["score"], reverse=True)
    selected_experience = scored_experience[:4]  # top 3–4

    # ── Score & select projects ────────────────────────────────────────
    scored_projects: list[dict[str, Any]] = []
    for project in project_entries:
        if not isinstance(project, dict):
            continue
        proj_skills = _normalise_skill_names(project.get("skills", []))
        if not proj_skills:
            proj_skills = _normalise_skill_names(
                project.get("techStack", project.get("tech_stack", []))
            )
        score = _skill_overlap(proj_skills, required_skills)
        scored_projects.append({
            **project,
            "skills": proj_skills,
            "score": round(score, 4),
            "selection_reason": _build_reason(
                {**project, "skills": proj_skills},
                required_skills,
                score,
            ),
        })

    scored_projects.sort(key=lambda p: p["score"], reverse=True)
    selected_projects = scored_projects[:3]  # top 2–3

    logger.info(
        "Selected %d experience bullets and %d projects",
        len(selected_experience),
        len(selected_projects),
    )

    return {
        "experience": selected_experience,
        "projects": selected_projects,
    }

"""Job ranking — computes match_score, experience_match, and role_match.

Scoring model
─────────────
skill_match      – What fraction of user's skills appear in the job description,
                   penalised for skills in the job description that the user is
                   missing.  Range 0-1.

experience_match – How well the user's total years of experience aligns with
                   what the job requires.  Range 0-1.

role_match       – How closely the job's title/domain matches the user's stated
                   role interests.  Range 0-1.

overall          – Weighted average: 50% skill + 30% role + 20% experience.
"""

import json
import re
from typing import Any

# ── helpers ────────────────────────────────────────────────────────────────

def _parse_json_array(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _to_skill_names(values: list[Any]) -> set[str]:
    names: set[str] = set()
    for value in values:
        if isinstance(value, str) and value.strip():
            names.add(value.strip().lower())
            continue
        if isinstance(value, dict):
            candidate = value.get("name")
            if isinstance(candidate, str) and candidate.strip():
                names.add(candidate.strip().lower())
    return names


_NON_WORD_RE = re.compile(r"[^a-z0-9+#]+")
_YEARS_RE = re.compile(r"(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience", re.IGNORECASE)


def _skill_search_patterns(name: str) -> list[str]:
    """Return all regex patterns to look for a skill in text.

    Handles:
      - Original lowercase name  (e.g. "node.js", "c++", "ci/cd")
      - Spaces-collapsed form    (e.g. "nodejs", "c++", "cicd")
      - Common aliases
    """
    aliases: dict[str, list[str]] = {
        "node.js": ["node.js", "nodejs", "node js"],
        "nodejs": ["node.js", "nodejs", "node js"],
        "react.js": ["react.js", "reactjs", "react"],
        "reactjs": ["react.js", "reactjs", "react"],
        "vue.js": ["vue.js", "vuejs", "vue"],
        "vuejs": ["vue.js", "vuejs", "vue"],
        "next.js": ["next.js", "nextjs"],
        "nextjs": ["next.js", "nextjs"],
        "nuxt.js": ["nuxt.js", "nuxtjs"],
        "nuxtjs": ["nuxt.js", "nuxtjs"],
        "postgresql": ["postgresql", "postgres"],
        "postgres": ["postgresql", "postgres"],
        "kubernetes": ["kubernetes", "k8s"],
        "k8s": ["kubernetes", "k8s"],
        "javascript": ["javascript", "js"],
        "typescript": ["typescript", "ts"],
        "python": ["python", "py"],
        "ci/cd": ["ci/cd", "cicd", "ci cd"],
        "cicd": ["ci/cd", "cicd", "ci cd"],
        "github actions": ["github actions", "githubactions"],
        "gitlab ci": ["gitlab ci", "gitlabci", "gitlab-ci"],
        "system design": ["system design", "systems design"],
        "google cloud": ["google cloud", "gcp"],
        "gcp": ["google cloud", "gcp"],
        "microsoft azure": ["microsoft azure", "azure"],
        "machine learning": ["machine learning", "ml"],
        "natural language processing": ["natural language processing", "nlp"],
        "object-oriented programming": ["object-oriented", "oop", "object oriented"],
        "oop": ["object-oriented", "oop", "object oriented"],
        "rest api": ["rest api", "restful", "rest"],
        "large language model": ["large language model", "llm", "llms"],
        "llm": ["large language model", "llm", "llms"],
    }

    name_lower = name.lower().strip()
    if name_lower in aliases:
        return aliases[name_lower]

    # Default: use the name as-is plus a spaces-removed variant
    variants = [name_lower]
    no_space = re.sub(r"\s+", "", name_lower)
    if no_space != name_lower:
        variants.append(no_space)
    return variants


def _skill_in_text(skill: str, text_lower: str) -> bool:
    """Return True if any pattern for *skill* matches in *text_lower*."""
    for pattern in _skill_search_patterns(skill):
        # Escape special regex chars (handles C++, C#, .NET, etc.)
        escaped = re.escape(pattern)
        # Use word boundary only if pattern ends/starts with a word char
        prefix = r"\b" if re.match(r"\w", pattern) else r"(?<![a-z0-9])"
        suffix = r"\b" if re.search(r"\w$", pattern) else r"(?![a-z0-9])"
        if re.search(f"{prefix}{escaped}{suffix}", text_lower):
            return True
    return False


def _skills_overlap(set_a: set[str], set_b: set[str]) -> int:
    """Count how many skills from set_a are present in set_b (normalised)."""
    # Build a combined text from set_b to use _skill_in_text for matching
    text_b = " " + " ".join(set_b).lower() + " "
    return sum(1 for s in set_a if _skill_in_text(s, text_b))


# ── skill match ────────────────────────────────────────────────────────────

def _compute_skill_match(
    job_description: str,
    job_skills_extracted: set[str],
    user_skills: set[str],
) -> float:
    """
    Score = (job required skills the user has) / (total job required skills).

    We use the taxonomy-extracted job skills as the denominator so the score
    reflects "what fraction of what this job needs do I have", then boost
    slightly if the user has additional skills that appear in the description
    even though they weren't in the extracted set.

    Falls back to a description-scan approach when no job skills were extracted.
    """
    if not user_skills:
        return 0.5  # No profile skills — can't measure

    desc_lower = job_description.lower()

    if job_skills_extracted:
        # Primary: job_skills ∩ user_skills / job_skills
        matched = sum(1 for js in job_skills_extracted if _skill_in_text(js, " ".join(user_skills).lower()))
        score = matched / len(job_skills_extracted)

        # Bonus: user skills that appear in the description but weren't in the
        # extracted set (catches skills missed by the taxonomy extractor)
        extra_matched = sum(
            1 for us in user_skills
            if us not in job_skills_extracted and _skill_in_text(us, desc_lower)
        )
        bonus = min(0.15, extra_matched * 0.03)
        return min(1.0, score + bonus)
    else:
        # Fallback: scan description for user skills directly
        matched = sum(1 for us in user_skills if _skill_in_text(us, desc_lower))
        return min(1.0, matched / max(len(user_skills), 1))


# ── experience match ────────────────────────────────────────────────────────

def _total_user_experience_years(experience_json: Any) -> float:
    """Sum years across all experience entries."""
    entries = _parse_json_array(experience_json)
    total = 0.0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        years = entry.get("years") or entry.get("duration_years")
        if years is not None:
            try:
                total += float(years)
                continue
            except (TypeError, ValueError):
                pass
        # Try to derive from start/end dates
        start = str(entry.get("start_date") or entry.get("startDate") or "")
        end = str(entry.get("end_date") or entry.get("endDate") or "present")
        start_m = re.search(r"(\d{4})", start)
        end_m = re.search(r"(\d{4})", end) if "present" not in end.lower() else None
        if start_m:
            start_y = int(start_m.group(1))
            import datetime
            end_y = int(end_m.group(1)) if end_m else datetime.datetime.utcnow().year
            total += max(0.0, float(end_y - start_y))
    return total


def _compute_experience_match(
    job_description: str,
    user_experience_years: float,
) -> float:
    """Return 0-1 based on how user's years matches the job's requirement."""
    # Extract the maximum required years from the job description
    matches = _YEARS_RE.findall(job_description)
    if not matches:
        # No explicit requirement — neutral score
        return 0.75

    required = max(int(m) for m in matches)
    if required == 0:
        return 1.0

    if user_experience_years >= required:
        # Meets or exceeds — full marks
        return 1.0
    elif user_experience_years >= required * 0.6:
        # Within 40% of requirement — partial credit
        return 0.6 + 0.4 * (user_experience_years / required)
    else:
        # Significantly under-qualified
        return max(0.1, user_experience_years / required)


# ── role match ─────────────────────────────────────────────────────────────

def _compute_role_match(
    job_title: str,
    job_description: str,
    role_interests: list[dict[str, Any]],
) -> float:
    """Return 0-1 based on how the job aligns with the user's target roles."""
    if not role_interests:
        return 0.5  # neutral — no preferences set

    job_lower = (job_title + " " + job_description[:500]).lower()

    best = 0.0
    for role in role_interests:
        title = str(role.get("title") or "").lower()
        if not title:
            continue

        score = 0.0

        # Title word overlap
        title_words = set(re.findall(r"\b\w{3,}\b", title))
        job_words = set(re.findall(r"\b\w{3,}\b", job_lower))
        if title_words:
            overlap = len(title_words & job_words) / len(title_words)
            score = max(score, overlap)

        # Seniority alignment
        seniority = str(role.get("seniority") or "").lower()
        seniority_map = {
            "intern": ["intern", "internship", "co-op", "coop"],
            "entry": ["junior", "entry", "new grad", "graduate", "jr"],
            "mid": ["mid", "intermediate", "ii"],
            "senior": ["senior", "lead", "staff", "principal", "sr"],
        }
        if seniority in seniority_map:
            seniority_kws = seniority_map[seniority]
            if any(kw in job_lower for kw in seniority_kws):
                score = min(1.0, score + 0.25)
            elif any(kw in job_lower for kw in ["senior", "lead", "staff", "principal"]
                     if kw not in seniority_kws):
                # Seniority mismatch penalty
                score = max(0.0, score - 0.2)

        best = max(best, score)

    return min(1.0, best)


# ── public API ─────────────────────────────────────────────────────────────

def rank_job(job: dict[str, Any], user_profile: dict[str, Any]) -> tuple[float, str]:
    """Compute overall score + tier.  Returns (score_0_to_1, tier_str)."""
    scores = compute_all_scores(job, user_profile)
    score = scores["overall"]
    if score >= 0.7:
        tier = "high"
    elif score >= 0.4:
        tier = "medium"
    else:
        tier = "low"
    return round(score, 4), tier


def compute_all_scores(job: dict[str, Any], user_profile: dict[str, Any]) -> dict[str, float]:
    """Return all three sub-scores plus overall (all 0-1 floats)."""
    description = str(job.get("description") or "")
    job_title = str(job.get("title") or "")

    # Extracted skills from job (taxonomy-based)
    job_skills = _to_skill_names(_parse_json_array(job.get("skills_required_json")))

    # User profile data
    user_skills = _to_skill_names(_parse_json_array(user_profile.get("skills_json")))
    experience_json = user_profile.get("experience_json")
    user_years = _total_user_experience_years(experience_json)
    role_interests = _parse_json_array(user_profile.get("role_interests_json"))

    skill_match = _compute_skill_match(description, job_skills, user_skills)
    experience_match = _compute_experience_match(description, user_years)
    role_match = _compute_role_match(job_title, description, role_interests)

    # Weighted overall: 50% skill, 30% role, 20% experience
    overall = round(0.5 * skill_match + 0.3 * role_match + 0.2 * experience_match, 4)

    return {
        "overall": overall,
        "skill_match": round(skill_match, 4),
        "experience_match": round(experience_match, 4),
        "role_match": round(role_match, 4),
    }


def apply_ranking(job: dict[str, Any], user_profile: dict[str, Any]) -> dict[str, Any]:
    scores = compute_all_scores(job, user_profile)
    overall = scores["overall"]
    if overall >= 0.7:
        tier = "high"
    elif overall >= 0.4:
        tier = "medium"
    else:
        tier = "low"

    ranked = dict(job)
    ranked["match_score"] = overall
    ranked["match_tier"] = tier
    ranked["experience_match"] = scores["experience_match"]
    ranked["role_match"] = scores["role_match"]
    ranked["skill_match"] = scores["skill_match"]
    return ranked

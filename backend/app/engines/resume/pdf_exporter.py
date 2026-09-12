import asyncio
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from ...clients.gemini import get_gemini_client
from .agent_loader import JAKES_RESUME_REFERENCE_TEX

APP_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
logger = logging.getLogger(__name__)


class ResumePdfExportError(RuntimeError):
    """Raised when resume PDF export fails."""


def _parse_json(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    if value is None:
        return fallback
    return value


def _escape_latex(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"\s+", " ", text).strip()
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in text)


def _normalise_skill_names(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    names: list[str] = []
    for value in values:
        if isinstance(value, str) and value.strip():
            names.append(value.strip())
            continue
        if isinstance(value, dict):
            name = value.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _pick_first_text(item: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str):
            cleaned = _clean_text_value(value)
            if cleaned:
                return cleaned
    return ""


def _clean_text_value(value: Any) -> str:
    text = str(value or "")
    # Drop markdown fence leftovers that occasionally leak into model output.
    text = text.replace("```latex", "").replace("```", "")
    # Drop naked triple-quote artifacts.
    text = text.replace('"""', "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _is_generic_project_name(name: str) -> bool:
    lowered = name.strip().lower()
    return lowered in {"", "project", "project name", "untitled", "untitled project", "n/a", "na"}


def _token_set(value: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9+#./-]+", value.lower())
    return {token for token in tokens if len(token) >= 3}


def _normalise_match_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _normalise_projects_for_export(
    raw_projects: Any,
    profile_projects: Any,
) -> list[dict[str, Any]]:
    profile_pool: list[dict[str, Any]] = []
    for item in _as_list(profile_projects):
        if not isinstance(item, dict):
            continue
        profile_pool.append(
            {
                "name": _pick_first_text(item, "name", "title", "project_name", "projectName", "project_title"),
                "description": _pick_first_text(item, "description", "summary", "text"),
            }
        )

    next_profile_name_index = 0
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for idx, item in enumerate(_as_list(raw_projects)):
        if isinstance(item, str):
            item = {"description": item}
        if not isinstance(item, dict):
            continue

        name = _pick_first_text(item, "name", "title", "project_name", "projectName", "project_title")
        description = _pick_first_text(item, "description", "summary", "text", "bullet")
        impact = _pick_first_text(item, "impact_statement", "impactStatement", "impact")
        start_date = _pick_first_text(item, "start_date", "startDate", "start")
        end_date = _pick_first_text(item, "end_date", "endDate", "end")
        skills = _normalise_skill_names(item.get("skills") or item.get("techStack") or item.get("tech_stack") or [])

        if _is_generic_project_name(name):
            best_match_name = ""
            best_score = -1
            desc_tokens = _token_set(description)
            for profile_project in profile_pool:
                candidate_name = profile_project["name"]
                if _is_generic_project_name(candidate_name):
                    continue
                score = 0
                if desc_tokens and profile_project["description"]:
                    score = len(desc_tokens & _token_set(profile_project["description"]))
                if score > best_score:
                    best_score = score
                    best_match_name = candidate_name
            if best_match_name:
                name = best_match_name

        if _is_generic_project_name(name):
            while next_profile_name_index < len(profile_pool):
                candidate = profile_pool[next_profile_name_index]["name"]
                next_profile_name_index += 1
                if not _is_generic_project_name(candidate):
                    name = candidate
                    break

        if _is_generic_project_name(name) and description:
            words = re.findall(r"[A-Za-z0-9+#./-]+", description)
            if words:
                name = " ".join(words[:5]).strip()

        if _is_generic_project_name(name):
            name = f"Project {idx + 1}"

        dedupe_key = f"{name.lower()}|{description[:140].lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        output.append(
            {
                "name": name,
                "description": description,
                "impact_statement": impact,
                "skills": skills,
                "start_date": start_date,
                "end_date": end_date,
            }
        )
    return output[:8]


def _normalise_education_for_export(raw_education: Any) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in _as_list(raw_education):
        if not isinstance(item, dict):
            continue
        institution = _pick_first_text(item, "institution", "school", "university", "college")
        degree = _pick_first_text(item, "degree", "qualification", "credential")
        field = _pick_first_text(item, "field", "fieldOfStudy", "field_of_study", "major", "program")
        location = _pick_first_text(item, "location", "city", "region")
        start_date = _pick_first_text(item, "startDate", "start_date", "start")
        end_date = _pick_first_text(item, "endDate", "end_date", "graduationDate", "graduation", "end")
        current = bool(item.get("current")) or str(end_date).strip().lower() in {"present", "current", "now"}
        gpa = _pick_first_text(item, "gpa", "grade")
        if not institution and not degree:
            continue
        dedupe_key = f"{institution.lower()}|{degree.lower()}|{field.lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(
            {
                "institution": institution,
                "degree": degree,
                "field": field,
                "location": location,
                "start_date": start_date,
                "end_date": "" if current else end_date,
                "current": current,
                "gpa": gpa,
            }
        )
    return output[:8]


def _normalise_experience_for_export(raw_experience: Any) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in _as_list(raw_experience):
        if not isinstance(item, dict):
            continue
        base_entry = {
            "company": _pick_first_text(item, "company", "employer", "organization"),
            "role": _pick_first_text(item, "role", "title", "position"),
            "location": _pick_first_text(item, "location", "city", "region"),
            "start_date": _pick_first_text(item, "startDate", "start_date", "start"),
            "end_date": _pick_first_text(item, "endDate", "end_date", "end"),
            "current": bool(item.get("current")),
            "skills": _normalise_skill_names(item.get("skills") or []),
        }

        bullets_added = 0
        for bullet in _as_list(item.get("bullets")):
            bullet_text = ""
            bullet_skills = list(base_entry["skills"])
            if isinstance(bullet, str):
                bullet_text = _clean_text_value(bullet)
            elif isinstance(bullet, dict):
                bullet_text = _pick_first_text(bullet, "text", "description", "bullet")
                bullet_skills = _normalise_skill_names(bullet.get("skills") or bullet_skills)
            if not bullet_text:
                continue
            bullets_added += 1
            output.append(
                {
                    **base_entry,
                    "text": bullet_text,
                    "skills": bullet_skills,
                }
            )

        if bullets_added:
            continue

        fallback_text = _pick_first_text(item, "rewritten_text", "text", "description", "summary", "bullet")
        if fallback_text:
            output.append(
                {
                    **base_entry,
                    "text": fallback_text,
                }
            )
    return output[:24]


def _build_profile_experience_pool(raw_profile_experience: Any) -> list[dict[str, Any]]:
    pool: list[dict[str, Any]] = []
    for item in _as_list(raw_profile_experience):
        if not isinstance(item, dict):
            continue
        company = _pick_first_text(item, "company", "employer", "organization")
        role = _pick_first_text(item, "role", "title", "position")
        location = _pick_first_text(item, "location", "city", "region")
        start_date = _pick_first_text(item, "startDate", "start_date", "start")
        end_date = _pick_first_text(item, "endDate", "end_date", "end")
        current = bool(item.get("current")) or end_date.lower() in {"present", "current", "now"}

        bullet_texts: list[str] = []
        for bullet in _as_list(item.get("bullets")):
            if isinstance(bullet, str):
                cleaned = _clean_text_value(bullet)
                if cleaned:
                    bullet_texts.append(cleaned)
                continue
            if isinstance(bullet, dict):
                cleaned = _pick_first_text(bullet, "text", "description", "bullet")
                if cleaned:
                    bullet_texts.append(cleaned)

        description = _pick_first_text(item, "description", "summary", "text")
        if description:
            bullet_texts.append(description)

        combined_text = " ".join(bullet_texts).strip()
        if not (company or role or combined_text):
            continue

        pool.append(
            {
                "company": company,
                "role": role,
                "location": location,
                "start_date": start_date,
                "end_date": end_date,
                "current": current,
                "combined_text": combined_text,
            }
        )
    return pool


def _backfill_experience_metadata(
    experience: list[dict[str, Any]],
    raw_profile_experience: Any,
) -> list[dict[str, Any]]:
    if not experience:
        return experience
    pool = _build_profile_experience_pool(raw_profile_experience)
    if not pool:
        return experience

    next_pool_idx = 0
    for item in experience:
        if item.get("company") or item.get("role"):
            continue

        text_tokens = _token_set(str(item.get("text") or ""))
        best_match: dict[str, Any] | None = None
        best_score = 0
        if text_tokens:
            for candidate in pool:
                overlap = len(text_tokens & _token_set(candidate.get("combined_text", "")))
                if overlap > best_score:
                    best_score = overlap
                    best_match = candidate

        if best_match is None:
            best_match = pool[next_pool_idx % len(pool)]
            next_pool_idx += 1

        item["company"] = item.get("company") or best_match.get("company") or ""
        item["role"] = item.get("role") or best_match.get("role") or ""
        item["location"] = item.get("location") or best_match.get("location") or ""
        item["start_date"] = item.get("start_date") or best_match.get("start_date") or ""
        item["end_date"] = item.get("end_date") or best_match.get("end_date") or ""
        item["current"] = bool(item.get("current")) or bool(best_match.get("current"))
    return experience


_MONTHS = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
    "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}


def _format_resume_date(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""
    lowered = cleaned.lower()
    if lowered in {"present", "current", "now"}:
        return "Present"
    month_match = re.match(r"^(\d{4})[-/](0[1-9]|1[0-2])$", cleaned)
    if month_match:
        year = month_match.group(1)
        month = _MONTHS.get(month_match.group(2), "")
        return f"{month} {year}".strip()
    year_match = re.match(r"^(19|20)\d{2}$", cleaned)
    if year_match:
        return cleaned
    return cleaned


def _format_resume_date_range(start: str, end: str, current: bool = False) -> str:
    left = _format_resume_date(start)
    if current:
        right = "Present"
    else:
        right = _format_resume_date(end)
    if left and right:
        return f"{left} -- {right}"
    if left:
        return left
    if right:
        return right
    return ""


def _safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return cleaned[:80] or "resume"


def _resolve_export_dir(raw_path: str | None) -> Path:
    configured = (raw_path or "").strip() or "~/Downloads"
    expanded = os.path.expandvars(os.path.expanduser(configured))
    export_dir = Path(expanded)
    if not export_dir.is_absolute():
        export_dir = (APP_DATA_DIR / export_dir).resolve()
    try:
        export_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ResumePdfExportError(
            f"Unable to create export directory: {export_dir}"
        ) from exc
    return export_dir


def _determine_engine() -> tuple[str, list[str]]:
    xelatex = shutil.which("xelatex")
    if xelatex:
        return xelatex, ["-interaction=nonstopmode", "-halt-on-error"]
    pdflatex = shutil.which("pdflatex")
    if pdflatex:
        return pdflatex, ["-interaction=nonstopmode", "-halt-on-error"]
    raise ResumePdfExportError(
        "LaTeX engine not found. Install xelatex or pdflatex in backend runtime."
    )


def _href(url: str, label: str | None = None) -> str:
    clean_url = str(url or "").strip()
    if not clean_url:
        return ""
    display = _escape_latex(label if label is not None else clean_url)
    return rf"\href{{\detokenize{{{clean_url}}}}}{{{display}}}"


def _contact_line(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    if payload.get("location"):
        chunks.append(_escape_latex(payload["location"]))
    if payload.get("email"):
        chunks.append(_href(f"mailto:{payload['email']}", payload["email"]))
    if payload.get("phone"):
        chunks.append(_escape_latex(payload["phone"]))
    if payload.get("linkedin"):
        chunks.append(_href(payload["linkedin"], "LinkedIn"))
    if payload.get("github"):
        chunks.append(_href(payload["github"], "GitHub"))
    if payload.get("portfolio"):
        chunks.append(_href(payload["portfolio"], "Portfolio"))
    return " \\textbar{} ".join(item for item in chunks if item)


def _render_summary_block(summary: str) -> str:
    if not summary:
        return ""
    return (
        "\\section*{Summary}\n"
        f"{_escape_latex(summary)}\n"
    )


def _render_skills_block(skills: list[str]) -> str:
    cleaned = [_escape_latex(skill) for skill in skills if skill]
    if not cleaned:
        return ""
    joined = " \\textbullet{} ".join(cleaned)
    return (
        "\\section*{Technical Skills}\n"
        f"{joined}\n"
    )


def _render_education_block(education: list[dict[str, Any]]) -> str:
    if not education:
        return ""
    rows: list[str] = ["\\section*{Education}"]
    for item in education:
        institution = _escape_latex(item.get("institution") or "")
        degree = _escape_latex(item.get("degree") or "")
        field = _escape_latex(item.get("field") or "")
        line = institution
        details = ", ".join(part for part in [degree, field] if part)
        if details:
            line = f"{line} --- {details}" if line else details
        if line:
            rows.append(rf"\textbf{{{line}}}")
        date_range = _format_resume_date_range(
            str(item.get("start_date") or item.get("startDate") or ""),
            str(item.get("end_date") or item.get("endDate") or ""),
            bool(item.get("current")),
        )
        location = _escape_latex(item.get("location") or "")
        if date_range or location:
            meta = " \\textbar{} ".join(part for part in [date_range, location] if part)
            rows.append(meta)
        gpa = _escape_latex(item.get("gpa") or "")
        if gpa:
            rows.append(rf"\textit{{GPA:}} {gpa}")
    return "\n".join(rows)


def _render_experience_block(experience: list[dict[str, Any]]) -> str:
    if not experience:
        return ""

    entries: list[str] = ["\\section*{Experience}"]
    for item in experience:
        role = _escape_latex(item.get("role") or "Professional Experience")
        company = _escape_latex(item.get("company") or "")
        text = _escape_latex(item.get("rewritten_text") or item.get("text") or "")
        if not text:
            continue
        header = role
        if company:
            header += f" \\textbar{{}} {company}"
        entries.append(rf"\textbf{{{header}}}")
        entries.append("\\begin{itemize}[leftmargin=*,itemsep=2pt,topsep=2pt]")
        entries.append(rf"\item {text}")
        entries.append("\\end{itemize}")
    return "\n".join(entries)


def _render_projects_block(projects: list[dict[str, Any]]) -> str:
    if not projects:
        return ""

    entries: list[str] = ["\\section*{Projects}"]
    for item in projects:
        name = _escape_latex(item.get("name") or item.get("title") or "Project")
        desc = _escape_latex(item.get("description") or item.get("text") or "")
        impact = _escape_latex(item.get("impact_statement") or "")
        skills = _normalise_skill_names(item.get("skills") or item.get("techStack") or item.get("tech_stack"))
        entries.append(rf"\textbf{{{name}}}")
        entries.append("\\begin{itemize}[leftmargin=*,itemsep=2pt,topsep=2pt]")
        if desc:
            entries.append(rf"\item {desc}")
        if impact:
            entries.append(rf"\item {impact}")
        if skills:
            entries.append(rf"\item \textit{{Tech:}} {_escape_latex(', '.join(skills))}")
        entries.append("\\end{itemize}")
    return "\n".join(entries)


def _render_certifications_block(certifications: list[dict[str, Any]]) -> str:
    if not certifications:
        return ""
    rows = ["\\section*{Certifications}", "\\begin{itemize}[leftmargin=*,itemsep=1pt,topsep=2pt]"]
    for cert in certifications:
        name = _escape_latex(cert.get("name") or "Certification")
        issuer = _escape_latex(cert.get("issuer") or "")
        date_val = _escape_latex(cert.get("dateObtained") or cert.get("date_obtained") or "")
        details = " ".join(part for part in [issuer, date_val] if part)
        if details:
            rows.append(rf"\item \textbf{{{name}}} --- {details}")
        else:
            rows.append(rf"\item \textbf{{{name}}}")
    rows.append("\\end{itemize}")
    return "\n".join(rows)


def _build_common_sections(payload: dict[str, Any]) -> str:
    sections = [
        _render_summary_block(payload.get("summary", "")),
        _render_education_block(payload.get("education", [])),
        _render_skills_block(payload.get("skills", [])),
        _render_experience_block(payload.get("experience", [])),
        _render_projects_block(payload.get("projects", [])),
        _render_certifications_block(payload.get("certifications", [])),
    ]
    return "\n\n".join(section for section in sections if section)


def _display_url(url: str) -> str:
    cleaned = str(url or "").strip()
    if not cleaned:
        return ""
    cleaned = re.sub(r"^https?://", "", cleaned, flags=re.IGNORECASE)
    return cleaned.rstrip("/")


def _render_jakes_header(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    parts: list[str] = []
    if payload.get("phone"):
        parts.append(_escape_latex(payload["phone"]))
    if payload.get("email"):
        parts.append(_href(f"mailto:{payload['email']}", payload["email"]))
    if payload.get("location"):
        parts.append(_escape_latex(payload["location"]))
    if payload.get("linkedin"):
        parts.append(_href(payload["linkedin"], _display_url(payload["linkedin"]) or "LinkedIn"))
    if payload.get("github"):
        parts.append(_href(payload["github"], _display_url(payload["github"]) or "GitHub"))
    if payload.get("portfolio"):
        parts.append(_href(payload["portfolio"], _display_url(payload["portfolio"]) or "Portfolio"))
    contact_line = " $|$ ".join(part for part in parts if part)
    return (
        "\\begin{center}\n"
        f"\\textbf{{\\Huge \\scshape {name}}} \\\\ \\vspace{{1pt}}\n"
        f"\\small {contact_line}\n"
        "\\end{center}"
    )


def _render_jakes_education_section(
    education: list[dict[str, Any]],
    fallback_location: str,
) -> str:
    if not education:
        return ""
    rows: list[str] = ["\\section{Education}", "\\resumeSubHeadingListStart"]
    for item in education:
        institution = _escape_latex(item.get("institution") or "Education")
        location = _escape_latex(item.get("location") or fallback_location or "")
        degree = _escape_latex(item.get("degree") or "")
        field = _escape_latex(item.get("field") or "")
        degree_line = ", ".join(part for part in [degree, field] if part) or "Relevant Education"
        dates = _escape_latex(
            _format_resume_date_range(
                str(item.get("start_date") or item.get("startDate") or ""),
                str(item.get("end_date") or item.get("endDate") or ""),
                bool(item.get("current")),
            )
        )
        rows.append(
            f"\\resumeSubheading{{{institution}}}{{{location}}}{{{degree_line}}}{{{dates}}}"
        )
        gpa = _escape_latex(item.get("gpa") or "")
        if gpa:
            rows.extend(
                [
                    "\\resumeItemListStart",
                    f"\\resumeItem{{GPA: {gpa}}}",
                    "\\resumeItemListEnd",
                ]
            )
    rows.append("\\resumeSubHeadingListEnd")
    return "\n".join(rows)


def _render_jakes_experience_section(
    experience: list[dict[str, Any]],
    fallback_location: str,
) -> str:
    grouped: list[dict[str, Any]] = []
    index_by_key: dict[str, int] = {}
    for item in experience:
        company = str(item.get("company") or "").strip()
        role = str(item.get("role") or "").strip()
        location = str(item.get("location") or fallback_location or "").strip()
        start_date = str(item.get("start_date") or item.get("startDate") or "").strip()
        end_date = str(item.get("end_date") or item.get("endDate") or "").strip()
        current = bool(item.get("current")) or end_date.lower() in {"present", "current", "now"}
        bullet = str(item.get("text") or item.get("rewritten_text") or item.get("description") or "").strip()
        if not bullet:
            continue
        key = "|".join([company.lower(), role.lower(), start_date.lower(), end_date.lower(), str(current)])
        existing_index = index_by_key.get(key)
        if existing_index is None:
            grouped.append(
                {
                    "company": company,
                    "role": role,
                    "location": location,
                    "start_date": start_date,
                    "end_date": end_date,
                    "current": current,
                    "bullets": [bullet],
                }
            )
            index_by_key[key] = len(grouped) - 1
        else:
            bullets = grouped[existing_index]["bullets"]
            if bullet not in bullets:
                bullets.append(bullet)

    if not grouped:
        return ""

    rows: list[str] = ["\\section{Experience}", "\\resumeSubHeadingListStart"]
    for entry in grouped:
        role_or_title = _escape_latex(entry["role"] or "Experience")
        company = _escape_latex(entry["company"] or "")
        location = _escape_latex(entry["location"] or "")
        dates = _escape_latex(
            _format_resume_date_range(
                entry.get("start_date", ""),
                entry.get("end_date", ""),
                bool(entry.get("current")),
            )
        )
        rows.append(
            f"\\resumeSubheading{{{role_or_title}}}{{{dates}}}{{{company}}}{{{location}}}"
        )
        rows.append("\\resumeItemListStart")
        for bullet in entry.get("bullets", [])[:6]:
            rows.append(f"\\resumeItem{{{_escape_latex(bullet)}}}")
        rows.append("\\resumeItemListEnd")
    rows.append("\\resumeSubHeadingListEnd")
    return "\n".join(rows)


def _render_jakes_projects_section(projects: list[dict[str, Any]]) -> str:
    if not projects:
        return ""
    rows: list[str] = ["\\section{Projects}", "\\resumeSubHeadingListStart"]
    for project in projects:
        name = _escape_latex(project.get("name") or "Project")
        skills = _normalise_skill_names(project.get("skills") or [])
        tech = _escape_latex(", ".join(skills[:8]))
        date_range = _escape_latex(
            _format_resume_date_range(
                str(project.get("start_date") or project.get("startDate") or ""),
                str(project.get("end_date") or project.get("endDate") or ""),
                False,
            )
        )
        heading_left = rf"\textbf{{{name}}}"
        if tech:
            heading_left = f"{heading_left} $|$ \\emph{{{tech}}}"
        rows.append(f"\\resumeProjectHeading{{{heading_left}}}{{{date_range}}}")
        rows.append("\\resumeItemListStart")
        description = _escape_latex(project.get("description") or "")
        impact = _escape_latex(project.get("impact_statement") or project.get("impactStatement") or "")
        if description:
            rows.append(f"\\resumeItem{{{description}}}")
        if impact and impact != description:
            rows.append(f"\\resumeItem{{{impact}}}")
        rows.append("\\resumeItemListEnd")
    rows.append("\\resumeSubHeadingListEnd")
    return "\n".join(rows)


def _render_jakes_skills_section(skills: list[str]) -> str:
    cleaned = [_escape_latex(skill) for skill in skills if str(skill).strip()]
    if not cleaned:
        return ""
    joined = ", ".join(cleaned[:36])
    return (
        "\\section{Technical Skills}\n"
        "\\begin{itemize}[leftmargin=0.15in, label={}]\n"
        "\\small{\\item{\n"
        f"\\textbf{{Skills}}{{: {joined}}}\n"
        "}}\n"
        "\\end{itemize}"
    )


def _render_jakes_certifications_section(certifications: list[dict[str, Any]]) -> str:
    if not certifications:
        return ""
    rows: list[str] = ["\\section{Certifications}", "\\resumeSubHeadingListStart"]
    for cert in certifications:
        name = _escape_latex(cert.get("name") or "Certification")
        issuer = _escape_latex(cert.get("issuer") or "")
        date_val = _escape_latex(
            cert.get("date_obtained") or cert.get("dateObtained") or ""
        )
        rows.append(f"\\resumeSubheading{{{name}}}{{{date_val}}}{{{issuer}}}{{}}")
    rows.append("\\resumeSubHeadingListEnd")
    return "\n".join(rows)


def _render_jakes_template(payload: dict[str, Any]) -> str:
    header = _render_jakes_header(payload)
    education = _render_jakes_education_section(
        payload.get("education", []),
        str(payload.get("location") or ""),
    )
    experience = _render_jakes_experience_section(
        payload.get("experience", []),
        str(payload.get("location") or ""),
    )
    projects = _render_jakes_projects_section(payload.get("projects", []))
    skills = _render_jakes_skills_section(payload.get("skills", []))
    certifications = _render_jakes_certifications_section(payload.get("certifications", []))
    sections = "\n\n".join(
        section for section in [education, experience, projects, skills, certifications] if section
    )
    return rf"""
\documentclass[a4paper,11pt]{{article}}
\usepackage{{latexsym}}
\usepackage[a4paper,margin=0.5in,top=0.5in,bottom=0.5in]{{geometry}}
\usepackage{{titlesec}}
\usepackage{{marvosym}}
\usepackage[usenames,dvipsnames]{{color}}
\usepackage{{verbatim}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{fancyhdr}}
\usepackage[english]{{babel}}
\usepackage{{tabularx}}
\usepackage{{ifxetex}}
\ifxetex\else\input{{glyphtounicode}}\fi
\usepackage{{enumitem}}

\pagestyle{{fancy}}
\fancyhf{{}}
\fancyfoot{{}}
\renewcommand{{\headrulewidth}}{{0pt}}
\renewcommand{{\footrulewidth}}{{0pt}}

\urlstyle{{same}}
\flushbottom
\raggedright
\setlength{{\tabcolsep}}{{0in}}

\titleformat{{\section}}{{\vspace{{-2pt}}\scshape\raggedright\large}}{{}}{{0em}}{{}}[\color{{black}}\titlerule \vspace{{-2pt}}]
\ifxetex\else\pdfgentounicode=1\fi

\newcommand{{\resumeItem}}[1]{{\item\small{{#1}}}}
\newcommand{{\resumeSubheading}}[4]{{
  \vspace{{-2pt}}\item
    \begin{{tabular*}}{{0.97\textwidth}}[t]{{l@{{\extracolsep{{\fill}}}}r}}
      \textbf{{#1}} & #2 \\
      \textit{{\small#3}} & \textit{{\small #4}} \\
    \end{{tabular*}}\vspace{{-3pt}}
}}
\newcommand{{\resumeProjectHeading}}[2]{{
    \item
    \begin{{tabular*}}{{0.97\textwidth}}{{l@{{\extracolsep{{\fill}}}}r}}
      \small#1 & #2 \\
    \end{{tabular*}}\vspace{{-3pt}}
}}
\newcommand{{\resumeSubHeadingListStart}}{{\begin{{itemize}}[leftmargin=0.15in, label={{}}]}}
\newcommand{{\resumeSubHeadingListEnd}}{{\end{{itemize}}}}
\newcommand{{\resumeItemListStart}}{{\begin{{itemize}}}}
\newcommand{{\resumeItemListEnd}}{{\end{{itemize}}\vspace{{-1pt}}}}

\begin{{document}}

{header}

{sections}

\end{{document}}
""".strip()


def _render_minimal_template(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    contact = _contact_line(payload)
    sections = _build_common_sections(payload)
    return rf"""
\documentclass[10pt]{{article}}
\usepackage[a4paper,margin=0.7in]{{geometry}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage{{xcolor}}
\usepackage{{titlesec}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{3pt}}
\pagestyle{{empty}}
\titleformat{{\section}}{{\normalsize\bfseries\color{{black}}}}{{}}{{0em}}{{}}[\titlerule]
\begin{{document}}

{{\Large \textbf{{{name}}}}}\\[-1pt]
{{\small {contact}}}

{sections}

\end{{document}}
""".strip()


def _render_modern_template(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    contact = _contact_line(payload)
    sections = _build_common_sections(payload)
    return rf"""
\documentclass[11pt]{{article}}
\usepackage[a4paper,margin=0.7in]{{geometry}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage{{xcolor}}
\usepackage{{titlesec}}
\definecolor{{AccentBlue}}{{HTML}}{{1F4F8C}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{4pt}}
\pagestyle{{empty}}
\titleformat{{\section}}{{\large\bfseries\color{{AccentBlue}}\raggedright}}{{}}{{0em}}{{}}[\color{{AccentBlue}}\titlerule]
\begin{{document}}

{{\LARGE \textbf{{{name}}}}}\\[2pt]
{{\small {contact}}}

\vspace{{2pt}}
\color{{AccentBlue}}\rule{{\linewidth}}{{0.8pt}}\color{{black}}

{sections}

\end{{document}}
""".strip()


_LATEX_GEN_PROMPT = """You are an expert ATS resume editor for LaTeX.
Generate ONE complete, compilable, ATS-friendly LaTeX resume by editing the reference template below.

=== REFERENCE TEMPLATE (AUTHORITATIVE) ===
{template_reference}

=== TARGET TEMPLATE ===
{template_id}
Use Jake-style structure and macro usage.

=== CANDIDATE DATA ===
Name: {name}
Email: {email}
Phone: {phone}
Location: {location}
LinkedIn: {linkedin}
GitHub: {github}
Portfolio: {portfolio}
Summary: {summary}
Skills: {skills}

Experience entries (role/company/dates/bullets):
{experience}

Projects (MUST keep exact project names; do not replace with "Project"):
{projects}

Education:
{education}

=== HARD REQUIREMENTS ===
- Keep the same documentclass, package stack, macro definitions, and section architecture as the reference.
- Reuse the reference command style: \\resumeSubheading, \\resumeProjectHeading, \\resumeItem.
- ATS-friendly output only: plain text content, no icons, no images, no text boxes, no multi-column layout.
- Keep each role entry in proper structure: role + company + date + bullet list.
- Keep each project entry in proper structure: exact project name + tech + bullet list.
- Never output generic placeholders such as "Project", "Company", "Role", or "Lorem ipsum".
- Populate with provided data only; do NOT fabricate achievements.
- Escape special characters in injected text (&, %, $, #, _, {{, }}, ~, ^, \\).
- Output ONLY raw LaTeX source (no markdown fences, no commentary).
- First non-whitespace token must be \\documentclass.
"""


def _format_experience_for_prompt(experience: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, exp in enumerate(experience, 1):
        company = exp.get("company", "")
        role = exp.get("role", "")
        text = exp.get("rewritten_text") or exp.get("text", "")
        skills = ", ".join(_normalise_skill_names(exp.get("skills", [])))
        lines.append(f"{i}. {role} at {company}")
        if skills:
            lines.append(f"   Skills: {skills}")
        lines.append(f"   Bullet: {text}")
    return "\n".join(lines) if lines else "(none)"


def _format_projects_for_prompt(projects: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, proj in enumerate(projects, 1):
        name = proj.get("name") or proj.get("title", "Project")
        desc = proj.get("description") or proj.get("text", "")
        impact = proj.get("impact_statement") or proj.get("impactStatement", "")
        skills = ", ".join(_normalise_skill_names(
            proj.get("skills") or proj.get("techStack") or proj.get("tech_stack") or []
        ))
        lines.append(f"{i}. {name}")
        if skills:
            lines.append(f"   Tech: {skills}")
        if desc:
            lines.append(f"   Description: {desc}")
        if impact:
            lines.append(f"   Impact: {impact}")
    return "\n".join(lines) if lines else "(none)"


def _format_education_for_prompt(education: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, edu in enumerate(education, 1):
        institution = edu.get("institution") or edu.get("school") or ""
        degree = edu.get("degree") or ""
        field = edu.get("field") or edu.get("fieldOfStudy") or ""
        location = edu.get("location") or ""
        start_date = edu.get("start_date") or edu.get("startDate") or ""
        end_date = edu.get("end_date") or edu.get("endDate") or ""
        current = bool(edu.get("current"))
        dates = _format_resume_date_range(str(start_date), str(end_date), current)
        gpa = edu.get("gpa") or ""
        lines.append(f"{i}. {institution}")
        details = ", ".join(part for part in [degree, field] if part)
        if details:
            lines.append(f"   Degree: {details}")
        if location:
            lines.append(f"   Location: {location}")
        if dates:
            lines.append(f"   Dates: {dates}")
        if gpa:
            lines.append(f"   GPA: {gpa}")
    return "\n".join(lines) if lines else "(none)"


def _extract_gemini_text(response: Any) -> str:
    direct = getattr(response, "text", None)
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    candidates = getattr(response, "candidates", None)
    if not isinstance(candidates, list):
        return ""
    chunks: list[str] = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None)
        if not isinstance(parts, list):
            continue
        for part in parts:
            text = getattr(part, "text", None)
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
    return "\n".join(chunks).strip()


def _contains_value(latex_source: str, value: str) -> bool:
    needle = _normalise_match_text(value)
    if not needle:
        return False
    haystack = _normalise_match_text(latex_source)
    return needle in haystack


def _validate_ai_latex_output(latex_source: str, payload: dict[str, Any]) -> tuple[bool, str]:
    raw = str(latex_source or "")
    lowered = raw.lower()

    required_sections = ["\\section{experience}", "\\section{projects}", "\\section{technical skills}"]
    for section in required_sections:
        if section not in lowered:
            return False, f"missing required section: {section}"

    if '"""' in raw or "```" in raw:
        return False, "contains markdown or triple-quote artifacts"

    # Must include at least one concrete company/role from provided experience.
    experience = payload.get("experience", [])
    company_candidates = [
        _clean_text_value(item.get("company", ""))
        for item in _as_list(experience)
        if isinstance(item, dict)
    ]
    role_candidates = [
        _clean_text_value(item.get("role", ""))
        for item in _as_list(experience)
        if isinstance(item, dict)
    ]
    has_company = any(_contains_value(raw, company) for company in company_candidates if company)
    has_role = any(_contains_value(raw, role) for role in role_candidates if role)
    if (company_candidates and not has_company) or (role_candidates and not has_role):
        return False, "missing concrete experience role/company names"

    # Must include at least one non-generic project name from payload.
    project_names = []
    for item in _as_list(payload.get("projects")):
        if not isinstance(item, dict):
            continue
        name = _clean_text_value(item.get("name", ""))
        if name and not _is_generic_project_name(name):
            project_names.append(name)
    if project_names and not any(_contains_value(raw, name) for name in project_names):
        return False, "missing concrete project names"

    # Reject clearly generic project placeholders.
    if re.search(r"\\textbf\{Project(?:\s+\d+)?\}", raw, flags=re.IGNORECASE):
        return False, "contains generic project placeholders"

    return True, ""


async def _generate_latex_via_gemini(
    payload: dict[str, Any],
    template_id: str,
) -> str | None:
    """Ask Gemini to generate LaTeX source from the Jake's template reference.

    Returns the raw LaTeX string on success, or None on failure.
    Falls back to None so the caller can use the Python renderers instead.
    """
    client = get_gemini_client()
    if client is None:
        return None
    if not JAKES_RESUME_REFERENCE_TEX:
        logger.warning("jakes_resume_reference.tex not found — skipping Gemini LaTeX generation")
        return None

    experience = payload.get("experience", [])
    projects = payload.get("projects", [])
    education = payload.get("education", [])

    prompt = _LATEX_GEN_PROMPT.format(
        template_reference=JAKES_RESUME_REFERENCE_TEX[:12000],  # cap to stay within token budget
        name=payload.get("name", ""),
        email=payload.get("email", ""),
        phone=payload.get("phone", ""),
        location=payload.get("location", ""),
        linkedin=payload.get("linkedin", ""),
        github=payload.get("github", ""),
        portfolio=payload.get("portfolio", ""),
        summary=payload.get("summary", ""),
        template_id=template_id,
        skills=", ".join(payload.get("skills", [])[:24]),
        experience=_format_experience_for_prompt(experience),
        projects=_format_projects_for_prompt(projects),
        education=_format_education_for_prompt(education),
    )

    try:
        response = await asyncio.to_thread(client.generate_content, prompt)
        raw = _extract_gemini_text(response)
        if not raw:
            logger.warning("Gemini LaTeX response was empty — discarding")
            return None

        # Strip markdown code fences if the model wraps them anyway
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw, count=1)
            raw = re.sub(r"\n?```$", "", raw)
            raw = raw.strip()

        # Basic sanity: must start with \documentclass
        if not raw.startswith("\\documentclass"):
            logger.warning("Gemini LaTeX output didn't start with \\documentclass — discarding")
            return None
        has_heading_macro = "\\resumeSubheading" in raw or "\\resumeProjectHeading" in raw
        if "\\resumeItem" not in raw or not has_heading_macro:
            logger.warning("Gemini LaTeX output missing required Jake macro usage — discarding")
            return None

        is_valid, reason = _validate_ai_latex_output(raw, payload)
        if not is_valid:
            logger.warning("Gemini LaTeX output failed validation: %s — discarding", reason)
            return None

        return raw
    except Exception:
        logger.exception("Gemini LaTeX generation failed — falling back to Python renderer")
        return None


def _render_latex(template: str, payload: dict[str, Any]) -> str:
    if template == "minimal":
        return _render_minimal_template(payload)
    if template == "modern":
        return _render_modern_template(payload)
    return _render_jakes_template(payload)


def _build_resume_payload(
    resume: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    content = _parse_json(resume.get("content_json"), {})
    fragments = content.get("fragments") if isinstance(content, dict) else {}
    fragments = fragments if isinstance(fragments, dict) else {}

    raw_skills = content.get("skills", []) if isinstance(content, dict) else []
    profile_skills = _parse_json(profile.get("skills_json"), [])
    merged_skills = _normalise_skill_names(raw_skills) + _normalise_skill_names(profile_skills)
    deduped_skills: list[str] = []
    seen: set[str] = set()
    for skill in merged_skills:
        key = skill.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped_skills.append(skill)

    raw_experience = fragments.get("experience", []) if isinstance(fragments, dict) else []
    raw_projects = fragments.get("projects", []) if isinstance(fragments, dict) else []
    profile_experience = _parse_json(profile.get("experience_json"), [])
    profile_projects = _parse_json(profile.get("projects_json"), [])
    experience = _normalise_experience_for_export(raw_experience)
    if not experience:
        experience = _normalise_experience_for_export(profile_experience)
    experience = _backfill_experience_metadata(experience, profile_experience)

    projects_source = raw_projects if _as_list(raw_projects) else profile_projects
    projects = _normalise_projects_for_export(projects_source, profile_projects)

    raw_education = content.get("education", []) if isinstance(content, dict) else []
    if not _as_list(raw_education):
        raw_education = _parse_json(profile.get("education_json"), [])
    if not _as_list(raw_education):
        parsed_resume = _parse_json(profile.get("resume_parsed_json"), {})
        raw_education = parsed_resume.get("education", []) if isinstance(parsed_resume, dict) else []
    education = _normalise_education_for_export(raw_education)

    certifications_raw = _parse_json(profile.get("certifications_json"), [])
    certifications = _as_list(certifications_raw)

    return {
        "name": content.get("profile_name") or profile.get("name") or "",
        "email": content.get("profile_email") or profile.get("email") or "",
        "phone": content.get("profile_phone") or profile.get("phone") or "",
        "location": content.get("profile_location") or profile.get("location") or "",
        "linkedin": content.get("profile_linkedin") or profile.get("linkedin_url") or "",
        "github": content.get("profile_github") or profile.get("github_url") or "",
        "portfolio": content.get("profile_portfolio") or profile.get("portfolio_url") or "",
        "summary": content.get("summary") or profile.get("summary") or "",
        "skills": deduped_skills[:24],
        "education": education,
        "experience": experience,
        "projects": projects,
        "certifications": certifications if isinstance(certifications, list) else [],
    }


def _compile_latex(
    latex_source: str,
    output_tex_path: Path,
    output_pdf_path: Path,
) -> None:
    engine, args = _determine_engine()

    with tempfile.TemporaryDirectory(prefix="resume-export-") as tmp_dir:
        tmp = Path(tmp_dir)
        tex_file = tmp / "resume.tex"
        pdf_file = tmp / "resume.pdf"
        tex_file.write_text(latex_source, encoding="utf-8")

        for _ in range(2):
            result = subprocess.run(
                [engine, *args, tex_file.name],
                cwd=tmp,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                snippet = (result.stderr or result.stdout or "").strip()
                snippet = snippet[-1200:]
                raise ResumePdfExportError(f"LaTeX compilation failed. {snippet}")

        if not pdf_file.exists():
            raise ResumePdfExportError("LaTeX compilation completed without producing a PDF file.")

        output_tex_path.write_text(latex_source, encoding="utf-8")
        shutil.copy2(pdf_file, output_pdf_path)


def _get_active_profile_id(db: sqlite3.Connection) -> str:
    try:
        row = db.execute("SELECT active_profile_id FROM settings WHERE id = 1").fetchone()
        if row is None:
            return "local"
        value = str(row[0] or "").strip()
        return value or "local"
    except sqlite3.Error:
        return "local"


def _load_profile_for_resume(resume: dict[str, Any], db: sqlite3.Connection) -> dict[str, Any]:
    candidates: list[str] = []
    content = _parse_json(resume.get("content_json"), {})
    if isinstance(content, dict):
        embedded_profile_id = str(content.get("profile_id") or "").strip()
        if embedded_profile_id:
            candidates.append(embedded_profile_id)
    candidates.append(_get_active_profile_id(db))
    candidates.append("local")

    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        row = db.execute("SELECT * FROM user_profile WHERE id = ?", (candidate,)).fetchone()
        if row is not None:
            return dict(row)

    latest = db.execute(
        "SELECT * FROM user_profile ORDER BY datetime(updated_at) DESC, id ASC LIMIT 1"
    ).fetchone()
    return dict(latest) if latest is not None else {}


def export_resume_pdf(resume_id: str, db: sqlite3.Connection) -> dict[str, Any]:
    resume_row = db.execute(
        "SELECT * FROM resume_versions WHERE id = ?",
        (resume_id,),
    ).fetchone()
    if resume_row is None:
        raise ValueError("Resume not found")

    settings_row = db.execute(
        "SELECT export_path FROM settings WHERE id = 1",
    ).fetchone()
    export_path_raw = str((settings_row["export_path"] if settings_row else None) or "~/Downloads")

    resume = dict(resume_row)
    profile = _load_profile_for_resume(resume, db)

    # Prefer template_id stored in the resume row (new flow).
    # Fall back to settings default for legacy rows that pre-date template_id.
    template_id = str(resume.get("template_id") or "classic-serif")

    payload = _build_resume_payload(resume, profile)

    # Deterministic ATS-safe rendering is the default path.
    # AI-generated raw LaTeX can be enabled explicitly for experimentation:
    #   RESUME_PDF_USE_AI_LATEX=1
    latex_source: str | None = None
    use_ai_latex = str(os.getenv("RESUME_PDF_USE_AI_LATEX", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    if use_ai_latex:
        try:
            latex_source = asyncio.run(_generate_latex_via_gemini(payload, template_id))
        except RuntimeError:
            # asyncio.run() raises RuntimeError if an event loop is already running.
            # In that case, create a new loop explicitly.
            try:
                loop = asyncio.new_event_loop()
                latex_source = loop.run_until_complete(_generate_latex_via_gemini(payload, template_id))
                loop.close()
            except Exception:
                logger.exception("Could not run async LaTeX generation — using deterministic renderer")
        except Exception:
            logger.exception("AI LaTeX generation failed — using deterministic renderer")
    else:
        logger.info("AI LaTeX disabled; using deterministic Jake ATS renderer")

    ai_used = bool(latex_source)
    if not latex_source:
        logger.info("Using Jake-style deterministic renderer for template '%s'", template_id)
        latex_source = _render_jakes_template(payload)

    export_dir = _resolve_export_dir(export_path_raw)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    base_name = _safe_slug(
        f"{payload.get('name') or 'resume'}-{template_id}-{resume_id}-{timestamp}"
    )
    tex_path = export_dir / f"{base_name}.tex"
    pdf_path = export_dir / f"{base_name}.pdf"

    _compile_latex(latex_source, tex_path, pdf_path)

    return {
        "template": template_id,
        "export_dir": str(export_dir),
        "tex_path": str(tex_path),
        "pdf_path": str(pdf_path),
        "filename": pdf_path.name,
        "ai_used": ai_used,
    }


def export_resume_latex(resume_id: str, db: sqlite3.Connection) -> dict[str, Any]:
    """Return the rendered LaTeX source for a resume without compiling to PDF."""
    resume_row = db.execute(
        "SELECT * FROM resume_versions WHERE id = ?",
        (resume_id,),
    ).fetchone()
    if resume_row is None:
        raise ValueError("Resume not found")

    resume = dict(resume_row)
    profile = _load_profile_for_resume(resume, db)
    template_id = str(resume.get("template_id") or "classic-serif")
    payload = _build_resume_payload(resume, profile)
    latex_source = _render_jakes_template(payload)

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = _safe_slug(
        f"{payload.get('name') or 'resume'}-{template_id}-{resume_id}-{timestamp}"
    ) + ".tex"

    return {
        "template": template_id,
        "latex_source": latex_source,
        "filename": filename,
    }

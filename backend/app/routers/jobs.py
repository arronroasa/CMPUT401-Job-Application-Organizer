import json
import re
import sqlite3
from html import unescape
from hashlib import sha256
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.discovery.ranker import compute_all_scores

router = APIRouter(prefix="", tags=["jobs"])


_NON_WORD_SKILL_CHARS_RE = re.compile(r"[^a-z0-9+#]+")


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _normalize_skill_token(value: str) -> str:
    cleaned = _NON_WORD_SKILL_CHARS_RE.sub(" ", unescape(value or "").lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    alias_map = {
        "node js": "nodejs",
        "react js": "react",
        "next js": "nextjs",
        "rest apis": "rest api",
        "postgre sql": "postgresql",
        "postgres": "postgresql",
    }
    return alias_map.get(cleaned, cleaned)


def _skill_forms(value: str) -> set[str]:
    token = _normalize_skill_token(value)
    if not token:
        return set()
    forms = {token, token.replace(" ", "")}
    if token.endswith("s") and len(token) > 3:
        singular = token[:-1]
        forms.add(singular)
        forms.add(singular.replace(" ", ""))
    return {item for item in forms if item}


def _parse_skill_items(raw_skills: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_skills, list):
        return []
    parsed: list[dict[str, Any]] = []
    for item in raw_skills:
        if isinstance(item, str):
            name = item.strip()
            if name:
                parsed.append({"name": name, "required": True, "userHas": False})
            continue
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            parsed.append(
                {
                    "name": name,
                    "required": bool(item.get("required", True)),
                    "userHas": bool(item.get("userHas", False)),
                }
            )
    return parsed


def _get_active_profile_id(db: sqlite3.Connection) -> str:
    row = db.execute("SELECT active_profile_id FROM settings WHERE id = 1").fetchone()
    active_profile_id = str(row[0] or "").strip() if row is not None else ""
    if not active_profile_id:
        active_profile_id = "local"

    active_exists = db.execute(
        "SELECT 1 FROM user_profile WHERE id = ? LIMIT 1",
        (active_profile_id,),
    ).fetchone()
    if active_exists is not None:
        return active_profile_id

    local_exists = db.execute("SELECT 1 FROM user_profile WHERE id = 'local' LIMIT 1").fetchone()
    if local_exists is not None:
        return "local"

    first_profile = db.execute(
        "SELECT id FROM user_profile ORDER BY updated_at DESC LIMIT 1"
    ).fetchone()
    if first_profile is None:
        return "local"
    return str(first_profile[0] or "local").strip() or "local"


def _load_full_profile(db: sqlite3.Connection) -> dict[str, Any] | None:
    """Load the full user profile row for live re-scoring."""
    profile_id = _get_active_profile_id(db)
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (profile_id,)).fetchone()
    return dict(row) if row else None


def _extract_profile_skill_forms(db: sqlite3.Connection) -> list[set[str]]:
    profile_id = _get_active_profile_id(db)
    row = db.execute("SELECT skills_json FROM user_profile WHERE id = ?", (profile_id,)).fetchone()
    if row is None:
        return []

    raw = row["skills_json"]
    values: list[Any]
    if isinstance(raw, str):
        try:
            decoded = json.loads(raw)
            values = decoded if isinstance(decoded, list) else []
        except json.JSONDecodeError:
            values = []
    elif isinstance(raw, list):
        values = raw
    else:
        values = []

    forms: list[set[str]] = []
    for value in values:
        if isinstance(value, str):
            skill_name = value
        elif isinstance(value, dict):
            skill_name = str(value.get("name") or "")
        else:
            continue
        normalized = _skill_forms(skill_name)
        if normalized:
            forms.append(normalized)
    return forms


def _annotate_user_has(
    skills_required_json: Any,
    profile_skill_forms: list[set[str]],
) -> list[dict[str, Any]]:
    parsed = _parse_skill_items(skills_required_json)
    if not profile_skill_forms:
        return parsed

    for skill in parsed:
        skill_forms = _skill_forms(str(skill.get("name") or ""))
        skill["userHas"] = bool(skill_forms and any(skill_forms & owned for owned in profile_skill_forms))
    return parsed


def _sanitize_description(value: str | None) -> str:
    text = unescape(str(value or ""))

    # ── Strip HTML if present ─────────────────────────────────────────────
    if "<" in text and ">" in text:
        no_scripts = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", text)
        with_line_breaks = re.sub(r"(?i)<\s*br\s*/?>", "\n", no_scripts)
        with_line_breaks = re.sub(r"(?i)</\s*(p|div|li|h[1-6])\s*>", "\n", with_line_breaks)
        with_bullets = re.sub(r"(?i)<\s*li[^>]*>", "\n- ", with_line_breaks)
        text = re.sub(r"(?is)<[^>]+>", " ", with_bullets)
        text = unescape(text)

    # ── Normalise inline whitespace (keep newlines) ───────────────────────
    text = re.sub(r"[ \t\r\f\v]+", " ", text)

    # ── Convert markdown-style formatting ────────────────────────────────
    # **Bold** → strip the asterisks (keep text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    # *italic* → strip the asterisks
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    # Lines starting with "* " → bullet "- "
    text = re.sub(r"(?m)^[ \t]*\*[ \t]+", "- ", text)
    # Lines starting with "• " (unicode bullet) → "- "
    text = re.sub(r"(?m)^[ \t]*[•·–][ \t]+", "- ", text)
    # Markdown headings "## Heading" → strip the hashes
    text = re.sub(r"(?m)^#{1,6}[ \t]+", "", text)

    # ── Sentence / paragraph boundary recovery ────────────────────────────
    # When text was scraped as one wall (no newlines), inject breaks before
    # common section headers so the output is readable.
    _SECTION_HEADERS_RE = re.compile(
        r"(?<!\n)(?<!\A)"           # not already at a line start
        r"(?=(?:What you['']?ll (?:do|be doing)|"
        r"About (?:the (?:role|job|team|company)|us)|"
        r"Who (?:you are|we are)|"
        r"Requirements?:|"
        r"Qualifications?:|"
        r"Responsibilities?:|"
        r"What (?:we offer|you bring|you need)|"
        r"(?:Key |Core )?Skills?:|"
        r"Nice[- ]to[- ](?:have|haves?):?|"
        r"Benefits?:|"
        r"Compensation:|"
        r"You (?:will|would|should|must)|"
        r"The role|"
        r"The team|"
        r"Join us))",
        re.IGNORECASE,
    )
    text = _SECTION_HEADERS_RE.sub("\n\n", text)

    # ── Whitespace cleanup ────────────────────────────────────────────────
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _row_to_job(
    row: sqlite3.Row,
    profile_skill_forms: list[set[str]] | None = None,
    full_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    job = dict(row)
    raw_skills = job.get("skills_required_json")
    parsed_skills: Any = raw_skills
    if isinstance(raw_skills, str):
        try:
            parsed_skills = json.loads(raw_skills)
        except json.JSONDecodeError:
            parsed_skills = []
    profile_forms = profile_skill_forms or []
    job["skills_required_json"] = _annotate_user_has(parsed_skills, profile_forms)
    job["description"] = _sanitize_description(job.get("description"))

    # ── Live re-score using the full profile (3 dimensions) ──────────────
    if full_profile:
        scores = compute_all_scores(job, full_profile)
        job["match_score"] = scores["overall"]
        job["skill_match"] = scores["skill_match"]
        job["experience_match"] = scores["experience_match"]
        job["role_match"] = scores["role_match"]
        overall_pct = scores["overall"]
        if overall_pct >= 0.7:
            job["match_tier"] = "high"
        elif overall_pct >= 0.4:
            job["match_tier"] = "medium"
        else:
            job["match_tier"] = "low"
    else:
        # Fall back to stored scores (or defaults)
        job.setdefault("skill_match", job.get("match_score", 0.0))
        job.setdefault("experience_match", 0.75)
        job.setdefault("role_match", 0.5)

    return job


class ImportJobRequest(BaseModel):
    source_url: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    description: str | None = None
    remote: bool = False


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _company_from_host(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower()
    host = host.removeprefix("www.")
    parts = [part for part in host.split(".") if part]
    if len(parts) >= 2:
        return parts[-2].replace("-", " ").title()
    return host.replace("-", " ").title() or "Unknown Company"


def _parse_linkedin_title_parts(source_url: str, metadata_title: str) -> tuple[str, str]:
    if "linkedin.com" not in urlparse(source_url).netloc.lower():
        return "", ""

    cleaned = _clean_text(metadata_title)
    if not cleaned:
        return "", ""

    cleaned = re.sub(r"\|\s*LinkedIn\s*$", "", cleaned, flags=re.IGNORECASE).strip()
    match = re.search(
        r"^(?P<company>.+?)\s+(?:is\s+)?hiring\s+(?P<title>.+?)\s+in\s+.+$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not match:
        return cleaned, ""
    return _clean_text(match.group("title")), _clean_text(match.group("company"))


def _normalize_source_url(source_url: str) -> str:
    parsed = urlparse(source_url)
    host = parsed.netloc.lower()

    if "linkedin.com" in host:
        if "/jobs/view/" in parsed.path:
            return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        current_job_ids = parse_qs(parsed.query).get("currentJobId", [])
        if current_job_ids:
            job_id = str(current_job_ids[0]).strip()
            if job_id.isdigit():
                return f"{parsed.scheme}://{parsed.netloc}/jobs/view/{job_id}/"

        raise HTTPException(
            status_code=400,
            detail=(
                "Please import a specific LinkedIn job URL "
                "(for example: https://www.linkedin.com/jobs/view/<job-id>/)."
            ),
        )

    if "indeed." in host:
        query = parse_qs(parsed.query)
        job_keys = query.get("jk", [])
        if parsed.path.startswith("/viewjob") and job_keys:
            job_key = str(job_keys[0]).strip()
            if job_key:
                return f"{parsed.scheme}://{parsed.netloc}/viewjob?jk={job_key}"

    return source_url


def _fetch_html_metadata(source_url: str) -> dict[str, str]:
    try:
        request = Request(
            source_url,
            headers={
                "User-Agent": "Career-Co-Pilot/0.1 (+https://github.com/Sashreek007/Career-Co-Pilot)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urlopen(request, timeout=15) as response:  # noqa: S310
            html = response.read(220_000).decode("utf-8", errors="ignore")
    except Exception:
        return {}

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    title = _clean_text(unescape(title_match.group(1))) if title_match else ""

    meta: dict[str, str] = {}
    for tag_match in re.finditer(r"<meta\s+[^>]*>", html, flags=re.IGNORECASE):
        tag = tag_match.group(0)
        key_match = re.search(
            r'(?:name|property)\s*=\s*["\']([^"\']+)["\']',
            tag,
            flags=re.IGNORECASE,
        )
        value_match = re.search(r'content\s*=\s*["\']([^"\']*)["\']', tag, flags=re.IGNORECASE)
        if not key_match or not value_match:
            continue
        key = _clean_text(key_match.group(1)).lower()
        value = _clean_text(unescape(value_match.group(1)))
        if key and value and key not in meta:
            meta[key] = value

    return {
        "title": _clean_text(meta.get("og:title") or meta.get("twitter:title") or title),
        "description": _clean_text(meta.get("og:description") or meta.get("description")),
        "site_name": _clean_text(meta.get("og:site_name")),
    }


def _source_from_url(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower()
    if "linkedin.com" in host:
        return "linkedin_manual"
    if "indeed." in host:
        return "indeed_manual"
    if "greenhouse.io" in host or "greenhouse" in host:
        return "greenhouse_manual"
    return host or "manual"


@router.get("/jobs")
def get_jobs(db: sqlite3.Connection = Depends(db_conn)):
    profile_skill_forms = _extract_profile_skill_forms(db)
    full_profile = _load_full_profile(db)
    rows = db.execute(
        """
        SELECT * FROM jobs
        WHERE is_archived = 0
          AND source != 'remotive'
        ORDER BY discovered_at DESC
        """
    ).fetchall()
    jobs = [_row_to_job(row, profile_skill_forms, full_profile) for row in rows]
    # Sort by live-computed match_score descending
    jobs.sort(key=lambda j: float(j.get("match_score") or 0), reverse=True)
    return jobs


@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    profile_skill_forms = _extract_profile_skill_forms(db)
    full_profile = _load_full_profile(db)
    row = db.execute(
        "SELECT * FROM jobs WHERE id = ? AND is_archived = 0",
        (job_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_job(row, profile_skill_forms, full_profile)


@router.delete("/jobs")
def archive_all_jobs(db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE jobs SET is_archived = 1 WHERE is_archived = 0",
    )
    db.commit()
    return {"ok": True, "archived": int(result.rowcount or 0)}


@router.post("/jobs/import-link")
def import_job_from_link(payload: ImportJobRequest, db: sqlite3.Connection = Depends(db_conn)):
    profile_skill_forms = _extract_profile_skill_forms(db)
    source_url = payload.source_url.strip()
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="source_url must be a valid http(s) URL")
    source_url = _normalize_source_url(source_url)

    # If browser helper already provided rich fields, skip remote metadata fetch.
    provided_title = _clean_text(payload.title)
    provided_company = _clean_text(payload.company)
    provided_description = _clean_text(payload.description)
    should_fetch_metadata = not (provided_title and provided_company and provided_description)
    metadata = _fetch_html_metadata(source_url) if should_fetch_metadata else {}

    linkedin_title, linkedin_company = _parse_linkedin_title_parts(source_url, metadata.get("title", ""))

    title = provided_title
    if title.startswith("http://") or title.startswith("https://"):
        title = ""
    if not title:
        title = linkedin_title or metadata.get("title", "")

    company = provided_company
    if company.startswith("http://") or company.startswith("https://"):
        company = ""
    if not company:
        company = linkedin_company or metadata.get("site_name", "")
    if not company:
        company = _company_from_host(source_url)

    description = provided_description or metadata.get("description", "")

    if not title:
        linkedin_match = re.search(r"/jobs/view/(\d+)", source_url)
        if linkedin_match:
            title = f"LinkedIn Job {linkedin_match.group(1)}"
        else:
            title = "Imported Job"

    job_id = "manual-" + sha256(source_url.encode("utf-8")).hexdigest()[:16]
    db.execute(
        """
        INSERT OR REPLACE INTO jobs (
            id, title, company, location, remote, description, skills_required_json,
            source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
        """,
        (
            job_id,
            title,
            company,
            (payload.location or "Remote").strip() or "Remote",
            1 if payload.remote else 0,
            description,
            json.dumps([]),
            _source_from_url(source_url),
            source_url,
            0.0,
            "low",
            None,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Imported job could not be loaded")
    return _row_to_job(row, profile_skill_forms)


@router.delete("/jobs/{job_id}")
def archive_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE jobs SET is_archived = 1 WHERE id = ? AND is_archived = 0",
        (job_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, "job_id": job_id, "is_archived": 1}

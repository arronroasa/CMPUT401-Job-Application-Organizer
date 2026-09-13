import io
import json
import logging
import re
import tempfile
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from ...clients.gemini import get_gemini_client

APP_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RESUME_UPLOAD_DIR = APP_DATA_DIR / "resumes"
SKILL_TAXONOMY_PATH = APP_DATA_DIR / "skill_taxonomy.json"

logger = logging.getLogger(__name__)

MAX_RESUME_SIZE_BYTES = 8 * 1024 * 1024

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:\+?\d[\d()\-\s]{7,}\d)")
URL_RE = re.compile(r"https?://[^\s)]+", re.IGNORECASE)
PLAIN_LINK_RE = re.compile(
    r"\b(?:https?://)?(?:www\.)?(?:linkedin\.com/[^\s)]+|github\.com/[^\s)]+|[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s)]*)?)",
    re.IGNORECASE,
)
DATE_TOKEN_RE = re.compile(r"(20\d{2}|19\d{2})(?:[-/](0[1-9]|1[0-2]))?")
NON_WORD_SKILL_CHARS_RE = re.compile(r"[^a-z0-9+#]+")
HEADING_RE = re.compile(
    r"^(summary|objective|skills|technical skills|experience|work experience|projects|certifications?|education|academics?)\s*:?\s*$",
    re.IGNORECASE,
)


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalise_profile_url(value: Any, *, host_hint: str | None = None) -> str:
    raw = _clean_text(value).strip("()[]<>.,;")
    if not raw:
        return ""
    if raw.lower() in {"github", "linkedin", "website", "portfolio", "link"}:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"

    parsed = urlparse(raw)
    host = parsed.netloc.lower().strip()
    if not host or "." not in host:
        return ""
    if host_hint and host_hint not in host:
        return ""
    path = parsed.path or ""
    if path.endswith(".") or path.endswith(","):
        path = path[:-1]
    normalised = f"{parsed.scheme or 'https'}://{host}{path}"
    if parsed.query:
        normalised += f"?{parsed.query}"
    return normalised


def _ensure_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _ensure_json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


@lru_cache(maxsize=1)
def _skill_taxonomy() -> list[str]:
    if not SKILL_TAXONOMY_PATH.exists():
        return []
    try:
        payload = json.loads(SKILL_TAXONOMY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    return [_clean_text(item) for item in payload if _clean_text(item)]


def _normalise_skill_token(value: str) -> str:
    cleaned = NON_WORD_SKILL_CHARS_RE.sub(" ", value.lower()).strip()
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
    token = _normalise_skill_token(value)
    if not token:
        return set()
    forms = {token, token.replace(" ", "")}
    if token.endswith("s") and len(token) > 3:
        singular = token[:-1]
        forms.add(singular)
        forms.add(singular.replace(" ", ""))
    return {form for form in forms if form}


def _to_title_like(value: str) -> str:
    tokens = [token for token in re.split(r"\s+", value.strip()) if token]
    return " ".join(token.capitalize() for token in tokens)


def _normalise_skill_display(value: Any) -> str:
    raw = _clean_text(value)
    if not raw:
        return ""

    # Collapse accidental spaced letters: "H T M L" -> "HTML", "C D" -> "CD"
    letter_tokens = raw.split()
    if len(letter_tokens) >= 2 and all(len(token) == 1 and token.isalnum() for token in letter_tokens):
        raw = "".join(letter_tokens).upper()

    cleaned = _normalise_skill_token(raw)
    canonical_map = {
        "aws": "AWS",
        "azure": "Azure",
        "gcp": "GCP",
        "html": "HTML",
        "css": "CSS",
        "sql": "SQL",
        "ci cd": "CI/CD",
        "cicd": "CI/CD",
        "js": "JavaScript",
        "ts": "TypeScript",
        "javascript": "JavaScript",
        "typescript": "TypeScript",
        "nodejs": "Node.js",
        "react": "React",
        "nextjs": "Next.js",
        "postgresql": "PostgreSQL",
        "pytorch": "PyTorch",
        "fastapi": "FastAPI",
        "face": "Hugging Face",
        "huggingface": "Hugging Face",
        "rest api": "REST API",
    }
    if cleaned in canonical_map:
        return canonical_map[cleaned]

    if raw.upper() in {"C", "C++", "C#", "R"}:
        return raw.upper()

    # Filter clear noise from OCR/tokenization artifacts.
    compact = cleaned.replace(" ", "")
    if not compact:
        return ""
    if len(compact) == 1 and compact.upper() not in {"C", "R"}:
        return ""
    if len(compact) <= 2:
        allow_short = {"ai", "ml", "go", "js", "ts", "ui", "ux", "db", "qa"}
        if compact.lower() not in allow_short and compact.upper() not in {"C", "R"}:
            return ""
    if compact.isdigit():
        return ""

    return _to_title_like(cleaned)


def _extract_text_from_pdf(raw: bytes) -> str:
    from pypdf import PdfReader  # type: ignore[import-untyped]

    reader = PdfReader(io.BytesIO(raw))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _extract_text_from_docx(raw: bytes) -> str:
    from docx import Document  # type: ignore[import-untyped]

    document = Document(io.BytesIO(raw))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def extract_resume_text(file_name: str, content_type: str | None, raw: bytes) -> str:
    if len(raw) > MAX_RESUME_SIZE_BYTES:
        raise ValueError("Resume file is too large (max 8MB)")

    suffix = Path(file_name).suffix.lower()
    try:
        if suffix == ".pdf":
            text = _extract_text_from_pdf(raw)
        elif suffix == ".docx":
            text = _extract_text_from_docx(raw)
        elif suffix in {".txt", ".md", ".rtf"}:
            text = raw.decode("utf-8", errors="ignore")
        else:
            if content_type and "text" in content_type.lower():
                text = raw.decode("utf-8", errors="ignore")
            else:
                raise ValueError("Unsupported resume format. Use PDF, DOCX, or TXT.")
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - parser fallback
        raise ValueError(f"Failed to read resume file ({suffix or 'unknown'}).") from exc

    cleaned = _clean_text(text)
    if not cleaned:
        raise ValueError("Resume appears empty or unreadable.")
    return text


def _candidate_lines(text: str, limit: int = 40) -> list[str]:
    lines = []
    for line in text.splitlines():
        cleaned = _clean_text(line)
        if cleaned:
            lines.append(cleaned)
        if len(lines) >= limit:
            break
    return lines


def _extract_name(lines: list[str]) -> str:
    for line in lines[:8]:
        if "@" in line or "http://" in line.lower() or "https://" in line.lower():
            continue
        if len(line.split()) < 2 or len(line.split()) > 5:
            continue
        if any(token in line.lower() for token in ("resume", "curriculum", "profile")):
            continue
        return line
    return ""


def _extract_location(lines: list[str]) -> str:
    location_hint = re.compile(
        r"\b([A-Za-z .'-]{2,},\s*(?:[A-Z]{2}|[A-Za-z .'-]{3,}))\b"
    )
    for line in lines[:16]:
        if "@" in line or "http" in line.lower():
            continue
        match = location_hint.search(line)
        if match:
            return _clean_text(match.group(1))
    return ""


def _extract_summary(text: str) -> str:
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        if re.match(r"^\s*(summary|objective)\s*:?\s*$", line, re.IGNORECASE):
            buffer: list[str] = []
            for nxt in lines[idx + 1 : idx + 7]:
                cleaned = _clean_text(nxt)
                if not cleaned:
                    continue
                if HEADING_RE.match(cleaned):
                    break
                buffer.append(cleaned)
            if buffer:
                return _clean_text(" ".join(buffer))[:500]
    return ""


def _extract_section_tokens(text: str, section_names: tuple[str, ...], limit: int = 30) -> list[str]:
    lines = text.splitlines()
    captured: list[str] = []
    capture_mode = False
    for line in lines:
        cleaned = _clean_text(line)
        if not cleaned:
            continue
        lowered = cleaned.lower().rstrip(":")
        if lowered in section_names:
            capture_mode = True
            continue
        if capture_mode and HEADING_RE.match(cleaned):
            break
        if capture_mode:
            parts = re.split(r"[,\u2022|;]+", cleaned)
            for part in parts:
                token = _clean_text(part)
                if token:
                    captured.append(token)
                if len(captured) >= limit:
                    return captured
    return captured


def _extract_skills(text: str) -> list[str]:
    lowered = text.lower()
    found: set[str] = set()
    for skill in _skill_taxonomy():
        pattern = r"(?<![a-z0-9])" + re.escape(skill.lower()) + r"(?![a-z0-9])"
        if re.search(pattern, lowered):
            found.add(skill)

    section_tokens = _extract_section_tokens(text, ("skills", "technical skills", "core skills"), limit=60)
    taxonomy_forms: list[tuple[str, set[str]]] = [(skill, _skill_forms(skill)) for skill in _skill_taxonomy()]
    for token in section_tokens:
        token_forms = _skill_forms(token)
        if not token_forms:
            continue
        matched = False
        for canonical, forms in taxonomy_forms:
            if token_forms & forms:
                found.add(canonical)
                matched = True
                break
        if not matched and len(token.split()) <= 4:
            found.add(token)

    normalised = {
        _normalise_skill_display(skill)
        for skill in found
        if _normalise_skill_display(skill)
    }
    return sorted(normalised)[:80]


def _extract_section_lines(text: str, headings: tuple[str, ...]) -> list[str]:
    lines = text.splitlines()
    captured: list[str] = []
    capture_mode = False

    for line in lines:
        cleaned = _clean_text(line)
        if not cleaned:
            if capture_mode:
                captured.append("")
            continue
        lowered = cleaned.lower().rstrip(":")
        if lowered in headings:
            capture_mode = True
            continue
        if capture_mode and HEADING_RE.match(cleaned):
            break
        if capture_mode:
            captured.append(cleaned)
    return captured


def _split_header_parts(value: str) -> list[str]:
    if "|" in value:
        return [_clean_text(part) for part in value.split("|") if _clean_text(part)]
    if " - " in value:
        return [_clean_text(part) for part in value.split(" - ") if _clean_text(part)]
    return [_clean_text(value)] if _clean_text(value) else []


def _extract_experiences_from_text(text: str) -> list[dict[str, Any]]:
    lines = _extract_section_lines(text, ("experience", "work experience"))
    if not lines:
        return []

    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def push_current() -> None:
        nonlocal current
        if not current:
            return
        if not (current.get("role") or current.get("company") or current.get("description")):
            current = None
            return
        entries.append(current)
        current = None

    for line in lines:
        if not line:
            push_current()
            continue

        if re.match(r"^[\-\u2022*]\s*", line):
            bullet = re.sub(r"^[\-\u2022*]\s*", "", line).strip()
            if not bullet:
                continue
            if current is None:
                current = {
                    "role": "",
                    "company": "",
                    "description": "",
                    "skills": [],
                    "start_date": "",
                    "end_date": "",
                    "bullets": [],
                }
            current["bullets"].append(bullet)
            if not current.get("description"):
                current["description"] = bullet
            continue

        header_parts = _split_header_parts(line)
        if len(header_parts) >= 2:
            push_current()
            role = header_parts[0]
            company = header_parts[1] if len(header_parts) > 1 else ""
            current = {
                "role": role,
                "company": company,
                "description": "",
                "skills": [],
                "start_date": "",
                "end_date": "",
                "bullets": [],
            }
            if len(header_parts) > 2:
                date_text = header_parts[2]
                if "present" in date_text.lower():
                    current["end_date"] = "present"
            continue

        if current is None:
            current = {
                "role": line,
                "company": "",
                "description": "",
                "skills": [],
                "start_date": "",
                "end_date": "",
                "bullets": [],
            }
        else:
            current["description"] = f"{current.get('description', '')} {line}".strip()

    push_current()
    return entries[:20]


def _extract_projects_from_text(text: str) -> list[dict[str, Any]]:
    lines = _extract_section_lines(text, ("projects", "project"))
    if not lines:
        return []

    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def push_current() -> None:
        nonlocal current
        if not current:
            return
        if not (current.get("name") or current.get("description")):
            current = None
            return
        entries.append(current)
        current = None

    for line in lines:
        if not line:
            push_current()
            continue

        if re.match(r"^[\-\u2022*]\s*", line):
            bullet = re.sub(r"^[\-\u2022*]\s*", "", line).strip()
            if not bullet:
                continue
            if current is None:
                current = {
                    "name": "Project",
                    "description": "",
                    "tech_stack": [],
                    "skills": [],
                    "impact_statement": "",
                    "url": "",
                    "start_date": "",
                    "end_date": "",
                }
            if not current.get("description"):
                current["description"] = bullet
            else:
                current["impact_statement"] = bullet
            continue

        if current is not None and not current.get("description"):
            current["description"] = line
            continue

        push_current()
        current = {
            "name": line,
            "description": "",
            "tech_stack": [],
            "skills": [],
            "impact_statement": "",
            "url": "",
            "start_date": "",
            "end_date": "",
        }

    push_current()
    return entries[:20]


def _extract_certifications_from_text(text: str) -> list[dict[str, Any]]:
    lines = _extract_section_lines(text, ("certification", "certifications", "licenses", "achievements"))
    if not lines:
        return []

    entries: list[dict[str, Any]] = []
    for line in lines:
        if not line:
            continue
        parts = _split_header_parts(line)
        if not parts:
            continue
        name = parts[0]
        issuer = parts[1] if len(parts) > 1 else ""
        date_value = parts[2] if len(parts) > 2 else ""
        entries.append(
            {
                "name": name,
                "issuer": issuer,
                "date_obtained": date_value,
                "url": "",
            }
        )
    return entries[:20]


def _extract_education_from_text(text: str) -> list[dict[str, Any]]:
    lines = _extract_section_lines(text, ("education", "academic", "academics"))
    if not lines:
        return []

    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def push_current() -> None:
        nonlocal current
        if not current:
            return
        if not (current.get("institution") or current.get("degree") or current.get("field")):
            current = None
            return
        entries.append(current)
        current = None

    for line in lines:
        if not line:
            push_current()
            continue

        cleaned = re.sub(r"^[\-\u2022*]\s*", "", line).strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()

        if (
            current is not None
            and ("university" in lowered or "college" in lowered or "institute" in lowered or "school" in lowered)
            and current.get("institution")
            and current.get("degree")
        ):
            push_current()

        if current is None:
            current = {
                "institution": "",
                "degree": "",
                "field": "",
                "start_date": "",
                "end_date": "",
                "gpa": "",
                "location": "",
            }

        if "gpa" in lowered:
            match = re.search(r"gpa[:\s]*([0-9.]+)", cleaned, re.IGNORECASE)
            current["gpa"] = match.group(1) if match else cleaned
            continue

        if re.search(r"\b(19|20)\d{2}\b", cleaned):
            date_parts = re.split(r"\s*[–-]\s*", cleaned, maxsplit=1)
            if len(date_parts) == 2 and re.search(r"\b(19|20)\d{2}\b", date_parts[0]) and re.search(
                r"\b(19|20)\d{2}\b|present|current|now",
                date_parts[1],
                re.IGNORECASE,
            ):
                current["start_date"] = date_parts[0]
                current["end_date"] = date_parts[1]
            elif not current.get("start_date"):
                current["start_date"] = cleaned
            elif not current.get("end_date"):
                current["end_date"] = cleaned
            continue

        if "," in cleaned and re.search(r"\b[A-Z]{2}\b", cleaned):
            if not current.get("location"):
                current["location"] = cleaned
            continue

        if any(token in lowered for token in ("b.sc", "b.s", "btech", "b.tech", "bachelor", "master", "m.sc", "m.s", "phd", "diploma", "certificate")):
            if not current.get("degree"):
                current["degree"] = cleaned
                continue

        if any(token in lowered for token in ("major", "minor", "field", "coursework", "computer", "engineering", "science", "arts", "business")):
            if not current.get("field"):
                current["field"] = cleaned.split(":", 1)[-1].strip()
                continue

        if not current.get("institution"):
            current["institution"] = cleaned
        elif not current.get("degree"):
            current["degree"] = cleaned
        elif not current.get("field"):
            current["field"] = cleaned

    push_current()
    return entries[:10]


def _extract_json_block(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""

    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline >= 0 else text
        fence_end = text.rfind("```")
        if fence_end >= 0:
            text = text[:fence_end]
        text = text.strip()

    if text.startswith("{") and text.endswith("}"):
        return text
    if text.startswith("[") and text.endswith("]"):
        return text

    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start >= 0 and obj_end > obj_start:
        return text[obj_start : obj_end + 1]

    arr_start = text.find("[")
    arr_end = text.rfind("]")
    if arr_start >= 0 and arr_end > arr_start:
        return text[arr_start : arr_end + 1]
    return ""


def _parse_json_payload(raw: str) -> dict[str, Any] | list[Any] | None:
    block = _extract_json_block(raw)
    if not block:
        return None
    try:
        parsed = json.loads(block)
        if isinstance(parsed, (dict, list)):
            return parsed
    except json.JSONDecodeError:
        return None
    return None


def _run_gemini_prompt(
    client: Any,
    prompt: str,
    *,
    text: str,
    file_name: str | None = None,
    raw: bytes | None = None,
) -> str:
    # Best quality: pass uploaded resume file directly when supported.
    if raw and file_name:
        tmp_path: str | None = None
        uploaded: Any = None
        try:
            import google.generativeai as genai  # type: ignore[import-untyped]

            upload_file = getattr(genai, "upload_file", None)
            delete_file = getattr(genai, "delete_file", None)
            if callable(upload_file):
                suffix = Path(file_name).suffix or ".bin"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
                    temp.write(raw)
                    tmp_path = temp.name
                uploaded = upload_file(path=tmp_path, display_name=Path(file_name).name)
                response = client.generate_content([uploaded, prompt])
                body = str(getattr(response, "text", "") or "")
                if callable(delete_file) and getattr(uploaded, "name", None):
                    try:
                        delete_file(uploaded.name)
                    except Exception:
                        pass
                if body.strip():
                    return body
        except Exception:
            logger.exception("Gemini file-based resume extraction failed")
        finally:
            if tmp_path:
                try:
                    Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    pass

    excerpt = text[:22000]
    response = client.generate_content(f"{prompt}\n\nResume text:\n{excerpt}")
    return str(getattr(response, "text", "") or "")


def _extract_section_with_ai(
    client: Any,
    *,
    section: str,
    text: str,
    file_name: str | None = None,
    raw: bytes | None = None,
) -> list[Any]:
    section_prompts = {
        "experiences": (
            "Extract ONLY work experiences from this resume.\n"
            "Return JSON array only.\n"
            "Schema item:\n"
            '{ "role": string, "company": string, "description": string, "skills": string[], '
            '"start_date": string, "end_date": string, "bullets": string[] }'
        ),
        "projects": (
            "Extract ONLY projects from this resume.\n"
            "Return JSON array only.\n"
            "Schema item:\n"
            '{ "name": string, "description": string, "tech_stack": string[], "skills": string[], '
            '"impact_statement": string, "url": string, "start_date": string, "end_date": string }'
        ),
        "certifications": (
            "Extract ONLY certifications from this resume.\n"
            "Return JSON array only.\n"
            'Schema item: { "name": string, "issuer": string, "date_obtained": string, "url": string }'
        ),
        "education": (
            "Extract ONLY education entries from this resume.\n"
            "Return JSON array only.\n"
            'Schema item: { "institution": string, "degree": string, "field": string, "start_date": string, '
            '"end_date": string, "gpa": string, "location": string }'
        ),
        "skills": (
            "Extract ONLY technical skills from this resume.\n"
            "Return JSON array of strings only.\n"
            'Example: ["Python", "FastAPI", "PostgreSQL"]'
        ),
        "role_interests": (
            "Based on this resume, suggest 3-5 target job roles.\n"
            "Return JSON array only.\n"
            'Schema item: { "title": string, "seniority": "intern"|"entry"|"mid"|"senior", "domains": string[], '
            '"remote": boolean, "locations": string[] }'
        ),
    }

    prompt = section_prompts.get(section)
    if not prompt:
        return []

    try:
        raw_output = _run_gemini_prompt(
            client,
            prompt,
            text=text,
            file_name=file_name,
            raw=raw,
        )
    except Exception:
        logger.exception("Gemini section extraction failed for section=%s", section)
        return []

    parsed = _parse_json_payload(raw_output)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        candidate = parsed.get(section)
        return _ensure_json_list(candidate)
    return []


def _extract_structured_with_ai(
    text: str,
    *,
    file_name: str | None = None,
    raw: bytes | None = None,
) -> dict[str, Any]:
    client = get_gemini_client()
    if client is None:
        return {}

    prompt = (
        "Extract structured resume data from this resume.\n"
        "Return valid JSON only. No markdown.\n"
        "Schema:\n"
        "{\n"
        '  "name": string,\n'
        '  "email": string,\n'
        '  "phone": string,\n'
        '  "location": string,\n'
        '  "linkedin_url": string,\n'
        '  "github_url": string,\n'
        '  "portfolio_url": string,\n'
        '  "summary": string,\n'
        '  "skills": string[],\n'
        '  "skill_years": { "Skill Name": number },\n'
        '  "experiences": [\n'
        "    {\n"
        '      "role": string,\n'
        '      "company": string,\n'
        '      "description": string,\n'
        '      "skills": string[],\n'
        '      "start_date": string,\n'
        '      "end_date": string,\n'
        '      "bullets": string[]\n'
        "    }\n"
        "  ],\n"
        '  "projects": [\n'
        "    {\n"
        '      "name": string,\n'
        '      "description": string,\n'
        '      "tech_stack": string[],\n'
        '      "skills": string[],\n'
        '      "impact_statement": string,\n'
        '      "url": string,\n'
        '      "start_date": string,\n'
        '      "end_date": string\n'
        "    }\n"
        "  ],\n"
        '  "education": [\n'
        '    { "institution": string, "degree": string, "field": string, "start_date": string, "end_date": string, "gpa": string, "location": string }\n'
        "  ],\n"
        '  "certifications": [\n'
        '    { "name": string, "issuer": string, "date_obtained": string, "url": string }\n'
        "  ],\n"
        '  "role_interests": [\n'
        '    { "title": string, "seniority": "intern"|"entry"|"mid"|"senior", "domains": string[], "remote": boolean, "locations": string[] }\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Do not invent facts.\n"
        "- Keep all real experiences and projects present in the resume.\n"
        "- Preserve original technology names (e.g., CI/CD, C++, Node.js, FastAPI).\n"
        "- Use empty string/list for missing fields.\n"
    )

    try:
        raw_output = _run_gemini_prompt(
            client,
            prompt,
            text=text,
            file_name=file_name,
            raw=raw,
        )
    except Exception:
        logger.exception("Gemini structured extraction failed")
        return {}

    parsed = _parse_json_payload(raw_output)
    result: dict[str, Any] = parsed if isinstance(parsed, dict) else {}

    # Backfill missing sections with focused prompts.
    for section in ("experiences", "projects", "education", "certifications", "skills", "role_interests"):
        if _ensure_json_list(result.get(section)):
            continue
        recovered = _extract_section_with_ai(
            client,
            section=section,
            text=text,
            file_name=file_name,
            raw=raw,
        )
        if recovered:
            result[section] = recovered

    if not isinstance(result.get("skill_years"), dict):
        result["skill_years"] = {}

    return result


def _safe_file_name(file_name: str) -> str:
    base = Path(file_name or "resume").name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    if not base:
        base = "resume"
    return base[:120]


def save_resume_file(profile_id: str, file_name: str, raw: bytes) -> dict[str, str]:
    RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_file_name(file_name)
    suffix = Path(safe_name).suffix.lower()
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    stored_name = f"{profile_id}-{ts}-{uuid4().hex[:8]}{suffix}"
    file_path = RESUME_UPLOAD_DIR / stored_name
    file_path.write_bytes(raw)
    return {"file_name": safe_name, "file_path": str(file_path)}


def _merge_skills(existing: list[Any], parsed_skills: list[str], parsed_skill_years: dict[str, Any]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    index_by_form: dict[str, int] = {}

    def add_skill(item: dict[str, Any]) -> None:
        idx = len(merged)
        merged.append(item)
        for form in _skill_forms(str(item.get("name") or "")):
            index_by_form[form] = idx

    for item in existing:
        if isinstance(item, str):
            name = _normalise_skill_display(item)
            if not name:
                continue
            add_skill(
                {
                    "id": f"sk-{uuid4().hex[:8]}",
                    "name": name,
                    "level": "intermediate",
                    "confidenceScore": 65,
                    "yearsOfExperience": 1,
                    "tags": [],
                }
            )
            continue
        if isinstance(item, dict):
            name = _normalise_skill_display(item.get("name"))
            if not name:
                continue
            add_skill(
                {
                    "id": _clean_text(item.get("id")) or f"sk-{uuid4().hex[:8]}",
                    "name": name,
                    "level": _clean_text(item.get("level")) or "intermediate",
                    "confidenceScore": int(item.get("confidenceScore") or item.get("confidence_score") or 65),
                    "yearsOfExperience": float(
                        item.get("yearsOfExperience") or item.get("years_of_experience") or item.get("years") or 1
                    ),
                    "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                }
            )

    for skill_name in parsed_skills:
        skill_name = _normalise_skill_display(skill_name)
        if not skill_name:
            continue
        forms = _skill_forms(skill_name)
        if not forms:
            continue
        existing_idx = next((index_by_form[form] for form in forms if form in index_by_form), None)
        guessed_years = parsed_skill_years.get(skill_name) or parsed_skill_years.get(skill_name.lower())
        try:
            years_value = max(0.0, float(guessed_years))
        except (TypeError, ValueError):
            years_value = 1.0
        if existing_idx is None:
            add_skill(
                {
                    "id": f"sk-{uuid4().hex[:8]}",
                    "name": skill_name,
                    "level": "intermediate",
                    "confidenceScore": 72,
                    "yearsOfExperience": years_value,
                    "tags": ["resume"],
                }
            )
        else:
            current = merged[existing_idx]
            if years_value > float(current.get("yearsOfExperience") or 0):
                current["yearsOfExperience"] = years_value

    return merged


def _normalise_string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        cleaned = _clean_text(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
    return output


def _normalise_date_value(value: Any) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return ""
    lowered = cleaned.lower()
    if lowered in {"present", "current", "now"}:
        return "present"

    month_map = {
        "jan": "01", "january": "01",
        "feb": "02", "february": "02",
        "mar": "03", "march": "03",
        "apr": "04", "april": "04",
        "may": "05",
        "jun": "06", "june": "06",
        "jul": "07", "july": "07",
        "aug": "08", "august": "08",
        "sep": "09", "sept": "09", "september": "09",
        "oct": "10", "october": "10",
        "nov": "11", "november": "11",
        "dec": "12", "december": "12",
    }

    yyyymm = re.search(r"\b(19|20)\d{2}[-/](0[1-9]|1[0-2])\b", cleaned)
    if yyyymm:
        return yyyymm.group(0).replace("/", "-")

    month_year = re.search(r"\b([A-Za-z]{3,9})\s+((?:19|20)\d{2})\b", cleaned)
    if month_year:
        month_name = month_year.group(1).lower()
        month = month_map.get(month_name)
        year = month_year.group(2)
        if month and re.match(r"^(19|20)\d{2}$", year):
            return f"{year}-{month}"

    year_only = re.search(r"\b(19|20)\d{2}\b", cleaned)
    if year_only:
        return year_only.group(0)
    return cleaned


def _normalise_experiences(raw_values: Any) -> list[dict[str, Any]]:
    values = _ensure_json_list(raw_values)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in values:
        if not isinstance(item, dict):
            continue
        role = _clean_text(item.get("role") or item.get("title") or item.get("position"))
        company = _clean_text(item.get("company") or item.get("employer") or item.get("organization"))
        description = _clean_text(item.get("description") or item.get("summary"))
        bullets = _normalise_string_list(item.get("bullets"))
        if not bullets and description:
            bullets = [description]
        if not description and bullets:
            description = bullets[0]
        skills = [
            _normalise_skill_display(skill)
            for skill in _ensure_json_list(item.get("skills"))
            if _normalise_skill_display(skill)
        ]
        start_date = _normalise_date_value(item.get("start_date") or item.get("startDate") or item.get("start"))
        end_raw = _normalise_date_value(item.get("end_date") or item.get("endDate") or item.get("end"))
        current = bool(item.get("current")) or end_raw.lower() in {"present", "current", "now"}
        end_date = "" if current else end_raw

        if not (role or company or description):
            continue
        dedupe_key = f"{role.lower()}|{company.lower()}|{start_date.lower()}|{description[:80].lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(
            {
                "id": _clean_text(item.get("id")) or f"exp-{uuid4().hex[:8]}",
                "company": company,
                "role": role,
                "description": description,
                "skills": _normalise_string_list(skills),
                "startDate": start_date,
                "endDate": end_date or None,
                "current": current,
                "bullets": bullets,
            }
        )

    return output[:20]


def _normalise_projects(raw_values: Any) -> list[dict[str, Any]]:
    values = _ensure_json_list(raw_values)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in values:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("name") or item.get("title"))
        description = _clean_text(item.get("description") or item.get("summary") or item.get("text"))
        tech_stack = [
            _normalise_skill_display(skill)
            for skill in _ensure_json_list(item.get("tech_stack") or item.get("techStack"))
            if _normalise_skill_display(skill)
        ]
        skills = [
            _normalise_skill_display(skill)
            for skill in _ensure_json_list(item.get("skills"))
            if _normalise_skill_display(skill)
        ]
        impact = _clean_text(item.get("impact_statement") or item.get("impactStatement"))
        url = _clean_text(item.get("url")) or None
        start_date = _normalise_date_value(item.get("start_date") or item.get("startDate") or item.get("start"))
        end_date = _normalise_date_value(item.get("end_date") or item.get("endDate") or item.get("end")) or None

        if not (name or description):
            continue
        dedupe_key = f"{name.lower()}|{description[:80].lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(
            {
                "id": _clean_text(item.get("id")) or f"proj-{uuid4().hex[:8]}",
                "name": name or "Project",
                "description": description,
                "techStack": _normalise_string_list(tech_stack),
                "skills": _normalise_string_list(skills),
                "impactStatement": impact,
                "url": url,
                "startDate": start_date,
                "endDate": end_date,
            }
        )
    return output[:20]


def _normalise_certifications(raw_values: Any) -> list[dict[str, Any]]:
    values = _ensure_json_list(raw_values)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in values:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("name"))
        issuer = _clean_text(item.get("issuer") or item.get("organization"))
        date_obtained = _normalise_date_value(item.get("date_obtained") or item.get("dateObtained") or item.get("date"))
        url = _clean_text(item.get("url")) or None
        if not name:
            continue
        dedupe_key = f"{name.lower()}|{issuer.lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(
            {
                "id": _clean_text(item.get("id")) or f"cert-{uuid4().hex[:8]}",
                "name": name,
                "issuer": issuer,
                "dateObtained": date_obtained,
                "url": url,
            }
        )
    return output[:20]


def _normalise_education(raw_values: Any) -> list[dict[str, Any]]:
    values = _ensure_json_list(raw_values)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in values:
        if not isinstance(item, dict):
            continue
        institution = _clean_text(item.get("institution") or item.get("school") or item.get("university") or item.get("college"))
        degree = _clean_text(item.get("degree") or item.get("qualification") or item.get("credential"))
        field = _clean_text(item.get("field") or item.get("field_of_study") or item.get("major"))
        gpa = _clean_text(item.get("gpa"))
        location = _clean_text(item.get("location") or item.get("city"))
        start_date = _normalise_date_value(item.get("start_date") or item.get("startDate") or item.get("start"))
        end_raw = _normalise_date_value(item.get("end_date") or item.get("endDate") or item.get("end"))
        current = bool(item.get("current")) or end_raw.lower() in {"present", "current", "now"}
        end_date = "" if current else end_raw

        if not (institution or degree or field):
            continue
        dedupe_key = f"{institution.lower()}|{degree.lower()}|{field.lower()}|{start_date.lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(
            {
                "id": _clean_text(item.get("id")) or f"edu-{uuid4().hex[:8]}",
                "institution": institution,
                "degree": degree,
                "field": field,
                "startDate": start_date or None,
                "endDate": end_date or None,
                "current": current,
                "gpa": gpa or None,
                "location": location or None,
            }
        )
    return output[:10]


def _normalise_seniority(value: Any) -> str:
    lowered = _clean_text(value).lower()
    if lowered in {"intern", "entry", "mid", "senior"}:
        return lowered
    if lowered in {"junior", "new grad", "new-grad"}:
        return "entry"
    if lowered in {"staff", "lead", "principal"}:
        return "senior"
    return "entry"


def _role_interest_id(raw_id: Any, *, ai_generated: bool) -> str:
    base = _clean_text(raw_id)
    if ai_generated:
        lowered = base.lower()
        if lowered.startswith("ri-ai-"):
            return base
        if lowered.startswith("ri-") and len(base) > 3:
            return f"ri-ai-{base[3:]}"
        return f"ri-ai-{uuid4().hex[:8]}"
    return base or f"ri-{uuid4().hex[:8]}"


def _normalise_role_interests(raw_values: Any, *, ai_generated: bool = False) -> list[dict[str, Any]]:
    values = _ensure_json_list(raw_values)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in values:
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title") or item.get("role") or item.get("name"))
        if not title:
            continue
        domains = _normalise_string_list(item.get("domains"))
        locations = _normalise_string_list(item.get("locations"))
        if not locations:
            locations = ["Canada", "Remote"]
        remote = bool(item.get("remote", True))
        seniority = _normalise_seniority(item.get("seniority"))
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(
            {
                "id": _role_interest_id(item.get("id"), ai_generated=ai_generated),
                "title": title,
                "seniority": seniority,
                "domains": domains,
                "remote": remote,
                "locations": locations,
            }
        )
    return output[:8]


def _infer_role_interests_from_skills(skills: list[str], *, ai_generated: bool = True) -> list[dict[str, Any]]:
    lowered = {skill.lower() for skill in skills}
    roles: list[dict[str, Any]] = []

    def add_role(title: str, domains: list[str]) -> None:
        role_id = f"ri-{'ai-' if ai_generated else ''}{uuid4().hex[:8]}"
        roles.append(
            {
                "id": role_id,
                "title": title,
                "seniority": "entry",
                "domains": domains,
                "remote": True,
                "locations": ["Canada", "Remote"],
            }
        )

    if {"python", "fastapi", "postgresql"} & lowered:
        add_role("Backend Engineer", ["SaaS", "Developer Tools"])
    if {"react", "typescript", "javascript", "node.js", "nodejs"} & lowered:
        add_role("Full Stack Engineer", ["SaaS", "Web Apps"])
    if {"pytorch", "hugging face", "langchain", "langgraph"} & lowered:
        add_role("AI Engineer", ["AI/ML", "Applied AI"])
    if {"aws", "kubernetes", "docker", "ci/cd"} & lowered:
        add_role("Platform Engineer", ["Cloud", "Infrastructure"])

    # Ensure at least one role recommendation.
    if not roles:
        add_role("Software Engineer", ["Generalist"])

    deduped: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for role in roles:
        key = str(role["title"]).lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        deduped.append(role)
    return deduped[:5]


def _profile_text_for_role_recommendation(profile: dict[str, Any], skills: list[str]) -> str:
    chunks: list[str] = []
    if _clean_text(profile.get("name")):
        chunks.append(f"Name: {_clean_text(profile.get('name'))}")
    if _clean_text(profile.get("summary")):
        chunks.append(f"Summary: {_clean_text(profile.get('summary'))}")
    if _clean_text(profile.get("location")):
        chunks.append(f"Location preference: {_clean_text(profile.get('location'))}")
    if skills:
        chunks.append(f"Skills: {', '.join(skills[:35])}")

    for item in _ensure_json_list(profile.get("experience_json"))[:6]:
        if not isinstance(item, dict):
            continue
        role = _clean_text(item.get("role") or item.get("title"))
        company = _clean_text(item.get("company") or item.get("employer"))
        desc = _clean_text(item.get("description"))
        line = "Experience:"
        if role:
            line += f" {role}"
        if company:
            line += f" at {company}"
        if desc:
            line += f" ({desc[:220]})"
        chunks.append(line)

    for item in _ensure_json_list(profile.get("projects_json"))[:6]:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("name"))
        desc = _clean_text(item.get("description"))
        if not name and not desc:
            continue
        line = f"Project: {name}" if name else "Project"
        if desc:
            line += f" ({desc[:220]})"
        chunks.append(line)

    return "\n".join(chunk for chunk in chunks if chunk).strip()


def recommend_role_interests_for_profile(
    *,
    profile: dict[str, Any],
    limit: int = 5,
) -> tuple[list[dict[str, Any]], bool]:
    raw_skills = _ensure_json_list(profile.get("skills_json"))
    skills: list[str] = []
    for item in raw_skills:
        if isinstance(item, dict):
            normalized = _normalise_skill_display(item.get("name"))
        else:
            normalized = _normalise_skill_display(item)
        if normalized:
            skills.append(normalized)
    skills = sorted(set(skills))

    profile_text = _profile_text_for_role_recommendation(profile, skills)
    ai_payload = _extract_structured_with_ai(profile_text) if profile_text else {}
    ai_roles = _normalise_role_interests(ai_payload.get("role_interests"), ai_generated=True)
    fallback_roles = _infer_role_interests_from_skills(skills, ai_generated=True)
    recommendations = ai_roles or fallback_roles

    max_items = max(1, min(limit, 8))
    return recommendations[:max_items], bool(ai_roles)


def _merge_structured_entries(
    incoming: list[dict[str, Any]],
    existing: list[dict[str, Any]],
    *,
    key_fields: tuple[str, ...],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in [*incoming, *existing]:
        if not isinstance(item, dict):
            continue
        key_parts = [_clean_text(item.get(field)).lower() for field in key_fields]
        key = "|".join(key_parts)
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        merged.append(item)
    return merged


def extract_resume_data(file_name: str, content_type: str | None, raw: bytes) -> dict[str, Any]:
    text = extract_resume_text(file_name, content_type, raw)
    lines = _candidate_lines(text)
    ai = _extract_structured_with_ai(text, file_name=file_name, raw=raw)

    raw_urls = [*URL_RE.findall(text), *PLAIN_LINK_RE.findall(text)]
    found_urls: list[str] = []
    for candidate in raw_urls:
        normalized = _normalise_profile_url(candidate)
        if normalized:
            found_urls.append(normalized)
    email = _clean_text(ai.get("email")) or (EMAIL_RE.search(text).group(0) if EMAIL_RE.search(text) else "")
    phone = _clean_text(ai.get("phone")) or (PHONE_RE.search(text).group(0) if PHONE_RE.search(text) else "")
    linkedin_url = _normalise_profile_url(ai.get("linkedin_url"), host_hint="linkedin.com") or next(
        (url for url in found_urls if "linkedin.com" in url.lower()),
        "",
    )
    github_url = _normalise_profile_url(ai.get("github_url"), host_hint="github.com") or next(
        (url for url in found_urls if "github.com" in url.lower()),
        "",
    )
    portfolio_url = _normalise_profile_url(ai.get("portfolio_url")) or next(
        (url for url in found_urls if "linkedin.com" not in url.lower() and "github.com" not in url.lower()),
        "",
    )

    ai_skill_years = ai.get("skill_years")
    ai_skills = _ensure_json_list(ai.get("skills"))
    heuristic_skills = _extract_skills(text)
    combined_skills = ai_skills + heuristic_skills
    normalised_skills = sorted(
        {
            _normalise_skill_display(skill)
            for skill in combined_skills
            if _normalise_skill_display(skill)
        }
    )[:100]

    ai_experiences = _ensure_json_list(ai.get("experiences"))
    ai_projects = _ensure_json_list(ai.get("projects"))
    ai_education = _ensure_json_list(ai.get("education"))
    ai_certifications = _ensure_json_list(ai.get("certifications"))
    ai_role_interests = _normalise_role_interests(ai.get("role_interests"), ai_generated=True)
    fallback_experiences = _extract_experiences_from_text(text)
    fallback_projects = _extract_projects_from_text(text)
    fallback_education = _extract_education_from_text(text)
    fallback_certifications = _extract_certifications_from_text(text)
    fallback_role_interests = _infer_role_interests_from_skills(normalised_skills, ai_generated=True)

    parsed = {
        "name": _clean_text(ai.get("name")) or _extract_name(lines),
        "email": _clean_text(email),
        "phone": _clean_text(phone),
        "location": _clean_text(ai.get("location")) or _extract_location(lines),
        "linkedin_url": _normalise_profile_url(linkedin_url, host_hint="linkedin.com"),
        "github_url": _normalise_profile_url(github_url, host_hint="github.com"),
        "portfolio_url": _normalise_profile_url(portfolio_url),
        "summary": _clean_text(ai.get("summary")) or _extract_summary(text),
        "skills": normalised_skills,
        "skill_years": ai_skill_years if isinstance(ai_skill_years, dict) else {},
        "experiences": ai_experiences or fallback_experiences,
        "projects": ai_projects or fallback_projects,
        "education": ai_education or fallback_education,
        "certifications": ai_certifications or fallback_certifications,
        "role_interests": ai_role_interests or fallback_role_interests,
        "raw_text": text,
        "used_ai": bool(ai),
    }
    return parsed


def merge_resume_into_profile(
    *,
    existing_profile: dict[str, Any],
    parsed_resume: dict[str, Any],
    stored_file_name: str,
    stored_file_path: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    existing_skills = _ensure_json_list(existing_profile.get("skills_json"))
    existing_experiences = _normalise_experiences(existing_profile.get("experience_json"))
    existing_projects = _normalise_projects(existing_profile.get("projects_json"))
    existing_education = _normalise_education(existing_profile.get("education_json"))
    existing_certifications = _normalise_certifications(existing_profile.get("certifications_json"))
    existing_role_interests = _normalise_role_interests(existing_profile.get("role_interests_json"))

    updates: dict[str, Any] = {
        "resume_file_name": stored_file_name,
        "resume_file_path": stored_file_path,
        "resume_uploaded_at": datetime.utcnow().isoformat(),
        "resume_text": parsed_resume.get("raw_text", ""),
        "resume_parsed_json": parsed_resume,
    }

    def set_if_present(target_key: str, candidate: Any) -> None:
        value = _clean_text(candidate)
        if not value:
            return
        updates[target_key] = value

    def set_url_if_present(target_key: str, candidate: Any, host_hint: str | None = None) -> None:
        value = _normalise_profile_url(candidate, host_hint=host_hint)
        if not value:
            return
        updates[target_key] = value

    set_if_present("name", parsed_resume.get("name"))
    set_if_present("email", parsed_resume.get("email"))
    set_if_present("phone", parsed_resume.get("phone"))
    set_if_present("location", parsed_resume.get("location"))
    set_url_if_present("linkedin_url", parsed_resume.get("linkedin_url"), host_hint="linkedin.com")
    set_url_if_present("github_url", parsed_resume.get("github_url"), host_hint="github.com")
    set_url_if_present("portfolio_url", parsed_resume.get("portfolio_url"))
    set_if_present("summary", parsed_resume.get("summary"))

    merged_skills = _merge_skills(
        existing_skills,
        parsed_resume.get("skills") if isinstance(parsed_resume.get("skills"), list) else [],
        parsed_resume.get("skill_years") if isinstance(parsed_resume.get("skill_years"), dict) else {},
    )
    if merged_skills:
        updates["skills_json"] = merged_skills

    incoming_experiences = _normalise_experiences(parsed_resume.get("experiences"))
    incoming_projects = _normalise_projects(parsed_resume.get("projects"))
    incoming_education = _normalise_education(parsed_resume.get("education"))
    incoming_certifications = _normalise_certifications(parsed_resume.get("certifications"))
    incoming_role_interests = _normalise_role_interests(parsed_resume.get("role_interests"))

    merged_experiences = _merge_structured_entries(
        incoming_experiences,
        existing_experiences,
        key_fields=("company", "role", "startDate"),
    )
    merged_projects = _merge_structured_entries(
        incoming_projects,
        existing_projects,
        key_fields=("name", "description"),
    )
    merged_education = _merge_structured_entries(
        incoming_education,
        existing_education,
        key_fields=("institution", "degree", "field", "startDate"),
    )
    merged_certifications = _merge_structured_entries(
        incoming_certifications,
        existing_certifications,
        key_fields=("name", "issuer"),
    )
    merged_role_interests = _merge_structured_entries(
        incoming_role_interests,
        existing_role_interests,
        key_fields=("title", "seniority"),
    )

    if merged_experiences:
        updates["experience_json"] = merged_experiences
    if merged_projects:
        updates["projects_json"] = merged_projects
    if merged_education:
        updates["education_json"] = merged_education
    if merged_certifications:
        updates["certifications_json"] = merged_certifications
    if merged_role_interests:
        updates["role_interests_json"] = merged_role_interests

    extracted_summary = {
        "file_name": stored_file_name,
        "skills_extracted": len(parsed_resume.get("skills") or []),
        "experiences_extracted": len(incoming_experiences),
        "projects_extracted": len(incoming_projects),
        "education_extracted": len(incoming_education),
        "certifications_extracted": len(incoming_certifications),
        "role_interests_extracted": len(incoming_role_interests),
        "used_ai": bool(parsed_resume.get("used_ai")),
    }
    return updates, extracted_summary

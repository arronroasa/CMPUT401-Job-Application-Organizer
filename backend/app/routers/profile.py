from datetime import datetime
import json
import re
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from ..db.database import get_db
from ..engines.profile.resume_ingestion import (
    extract_resume_data,
    merge_resume_into_profile,
    recommend_role_interests_for_profile,
    save_resume_file,
)

router = APIRouter(prefix="", tags=["profile"])

JSON_COLUMNS = {
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "education_json",
    "role_interests_json",
    "resume_parsed_json",
}
PROFILE_COLUMNS = {
    "id",
    "name",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "github_url",
    "portfolio_url",
    "summary",
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "education_json",
    "role_interests_json",
    "resume_file_name",
    "resume_file_path",
    "resume_uploaded_at",
    "resume_text",
    "resume_parsed_json",
    "updated_at",
}
PROFILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{2,64}$")


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _validate_profile_id(profile_id: str) -> str:
    cleaned = str(profile_id or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="profile_id is required")
    if not PROFILE_ID_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="profile_id is invalid")
    return cleaned


def _next_profile_name(db: sqlite3.Connection) -> str:
    row = db.execute("SELECT COUNT(*) AS total FROM user_profile").fetchone()
    count = int(row[0]) if row is not None else 0
    return f"Profile {count + 1}"


def _profile_name_exists(name: str, db: sqlite3.Connection) -> bool:
    row = db.execute(
        "SELECT 1 FROM user_profile WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def _ensure_unique_profile_name(name: str, db: sqlite3.Connection) -> str:
    base = str(name or "").strip() or _next_profile_name(db)
    if not _profile_name_exists(base, db):
        return base
    counter = 2
    while True:
        candidate = f"{base} ({counter})"
        if not _profile_name_exists(candidate, db):
            return candidate
        counter += 1


def _new_profile_id() -> str:
    return f"profile-{uuid4().hex[:8]}"


def _ensure_settings_row(db: sqlite3.Connection) -> None:
    db.execute(
        """
        INSERT INTO settings (id, active_profile_id)
        VALUES (1, 'local')
        ON CONFLICT(id) DO NOTHING
        """
    )
    db.execute(
        """
        UPDATE settings
        SET active_profile_id = COALESCE(NULLIF(TRIM(active_profile_id), ''), 'local')
        WHERE id = 1
        """
    )
    db.commit()


def _get_active_profile_id(db: sqlite3.Connection) -> str:
    _ensure_settings_row(db)
    row = db.execute("SELECT active_profile_id FROM settings WHERE id = 1").fetchone()
    if row is None:
        return "local"
    value = str(row[0] or "").strip()
    return value or "local"


def _set_active_profile_id(db: sqlite3.Connection, profile_id: str) -> None:
    _ensure_settings_row(db)
    db.execute(
        """
        UPDATE settings
        SET active_profile_id = ?, updated_at = ?
        WHERE id = 1
        """,
        (profile_id, datetime.utcnow().isoformat()),
    )
    db.commit()


def _resolve_profile_id(db: sqlite3.Connection, profile_id: str | None) -> str:
    if profile_id:
        return _validate_profile_id(profile_id)
    return _get_active_profile_id(db)


def _row_to_profile(row: sqlite3.Row) -> dict[str, Any]:
    profile = dict(row)
    for col in JSON_COLUMNS:
        value = profile.get(col)
        if isinstance(value, str):
            try:
                profile[col] = json.loads(value)
            except json.JSONDecodeError:
                pass
    parsed_resume = profile.get("resume_parsed_json")
    if isinstance(parsed_resume, dict):
        parsed_resume.pop("raw_text", None)
    profile.pop("resume_text", None)
    profile.pop("resume_file_path", None)
    return profile


def _upsert_profile_row(data: dict[str, Any], db: sqlite3.Connection) -> dict[str, Any]:
    columns = list(data.keys())
    placeholders = ", ".join("?" for _ in columns)
    update_columns = [col for col in columns if col != "id"]
    update_expr = ", ".join(f"{col} = excluded.{col}" for col in update_columns)
    db.execute(
        f"""
        INSERT INTO user_profile ({", ".join(columns)})
        VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {update_expr}
        """,
        tuple(data[col] for col in columns),
    )
    db.commit()
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (data["id"],)).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to fetch updated profile")
    return _row_to_profile(row)


def _profile_exists(profile_id: str, db: sqlite3.Connection) -> bool:
    row = db.execute("SELECT 1 FROM user_profile WHERE id = ?", (profile_id,)).fetchone()
    return row is not None


def _normalise_role_interest_entry(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    title = str(item.get("title") or item.get("role") or "").strip()
    if not title:
        return None
    seniority = str(item.get("seniority") or "entry").strip().lower()
    if seniority not in {"intern", "entry", "mid", "senior"}:
        seniority = "entry"
    domains = [str(value).strip() for value in item.get("domains", []) if str(value).strip()]
    locations = [str(value).strip() for value in item.get("locations", []) if str(value).strip()]
    if not locations:
        locations = ["Canada", "Remote"]

    role_id = str(item.get("id") or "").strip()
    if not role_id:
        role_id = f"ri-{uuid4().hex[:8]}"
    return {
        "id": role_id,
        "title": title,
        "seniority": seniority,
        "domains": domains,
        "remote": bool(item.get("remote", True)),
        "locations": locations,
    }


def _merge_role_interests(existing: Any, incoming: Any) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()

    for source in [*_ensure_json_list(existing), *_ensure_json_list(incoming)]:
        normalized = _normalise_role_interest_entry(source)
        if normalized is None:
            continue
        key = f"{normalized['title'].lower()}|{normalized['seniority']}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(normalized)
    return merged


def _ensure_json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    return []


@router.get("/profiles")
def list_profiles(db: sqlite3.Connection = Depends(db_conn)):
    active_id = _get_active_profile_id(db)
    rows = db.execute(
        """
        SELECT id, name, email, location, updated_at, resume_file_name, resume_uploaded_at
        FROM user_profile
        ORDER BY datetime(updated_at) DESC, id ASC
        """
    ).fetchall()
    profiles = [
        {
            **dict(row),
            "is_active": dict(row).get("id") == active_id,
        }
        for row in rows
    ]
    return {"profiles": profiles, "active_profile_id": active_id}


@router.post("/profiles")
def create_profile(payload: dict[str, Any] | None = None, db: sqlite3.Connection = Depends(db_conn)):
    body = payload or {}
    profile_id = _new_profile_id()
    name = _ensure_unique_profile_name(str(body.get("name") or "").strip(), db)
    now = datetime.utcnow().isoformat()
    data: dict[str, Any] = {
        "id": profile_id,
        "name": name,
        "email": "",
        "location": "",
        "skills_json": json.dumps([]),
        "experience_json": json.dumps([]),
        "projects_json": json.dumps([]),
        "certifications_json": json.dumps([]),
        "education_json": json.dumps([]),
        "role_interests_json": json.dumps([]),
        "updated_at": now,
    }
    profile = _upsert_profile_row(data, db)
    _set_active_profile_id(db, profile_id)
    return profile


@router.put("/profiles/{profile_id}/activate")
def activate_profile(profile_id: str, db: sqlite3.Connection = Depends(db_conn)):
    target = _validate_profile_id(profile_id)
    if not _profile_exists(target, db):
        raise HTTPException(status_code=404, detail="Profile not found")
    _set_active_profile_id(db, target)
    return {"ok": True, "active_profile_id": target}


@router.patch("/profiles/{profile_id}/rename")
def rename_profile(profile_id: str, payload: dict[str, Any], db: sqlite3.Connection = Depends(db_conn)):
    target = _validate_profile_id(profile_id)
    if not _profile_exists(target, db):
        raise HTTPException(status_code=404, detail="Profile not found")

    name = str((payload or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Profile name is required")

    db.execute(
        "UPDATE user_profile SET name = ?, updated_at = ? WHERE id = ?",
        (name, datetime.utcnow().isoformat(), target),
    )
    db.commit()
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (target,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _row_to_profile(row)


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: str, db: sqlite3.Connection = Depends(db_conn)):
    target = _validate_profile_id(profile_id)
    if not _profile_exists(target, db):
        raise HTTPException(status_code=404, detail="Profile not found")

    remaining = db.execute(
        "SELECT id FROM user_profile WHERE id != ? ORDER BY datetime(updated_at) DESC, id ASC",
        (target,),
    ).fetchall()
    if not remaining:
        raise HTTPException(status_code=400, detail="Cannot delete the last profile")

    active_id = _get_active_profile_id(db)
    next_active_id = str(remaining[0][0])

    db.execute("DELETE FROM user_profile WHERE id = ?", (target,))
    db.commit()

    if active_id == target:
        _set_active_profile_id(db, next_active_id)

    return {
        "ok": True,
        "deleted_profile_id": target,
        "active_profile_id": _get_active_profile_id(db),
    }


@router.get("/profile")
def get_profile(
    profile_id: str | None = Query(default=None),
    db: sqlite3.Connection = Depends(db_conn),
):
    resolved = _resolve_profile_id(db, profile_id)
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (resolved,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    _set_active_profile_id(db, resolved)
    return _row_to_profile(row)


@router.put("/profile")
def upsert_profile(
    payload: dict[str, Any],
    profile_id: str | None = Query(default=None),
    db: sqlite3.Connection = Depends(db_conn),
):
    target_id = _resolve_profile_id(db, profile_id)
    data = {k: v for k, v in payload.items() if k in PROFILE_COLUMNS}
    data["id"] = target_id
    data["updated_at"] = datetime.utcnow().isoformat()

    for col in JSON_COLUMNS:
        if col in data and data[col] is not None and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])

    profile = _upsert_profile_row(data, db)
    _set_active_profile_id(db, target_id)
    return profile


@router.post("/profile/resume")
async def upload_resume(
    file: UploadFile = File(...),
    profile_id: str | None = Form(default=None),
    create_new_profile: bool = Form(default=True),
    db: sqlite3.Connection = Depends(db_conn),
):
    file_name = str(file.filename or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="Resume file name is required")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Resume file is empty")

    try:
        parsed = extract_resume_data(file_name, file.content_type, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if create_new_profile:
        target_id = _new_profile_id()
        existing: dict[str, Any] = {}
    else:
        target_id = _resolve_profile_id(db, profile_id)
        row = db.execute("SELECT * FROM user_profile WHERE id = ?", (target_id,)).fetchone()
        existing = dict(row) if row is not None else {}

    stored = save_resume_file(target_id, file_name, raw)
    updates, extracted = merge_resume_into_profile(
        existing_profile=existing,
        parsed_resume=parsed,
        stored_file_name=stored["file_name"],
        stored_file_path=stored["file_path"],
    )

    if create_new_profile and not str(updates.get("name") or "").strip():
        updates["name"] = _next_profile_name(db)
    if create_new_profile:
        updates["name"] = _ensure_unique_profile_name(str(updates.get("name") or ""), db)

    data = {
        **{k: v for k, v in existing.items() if k in PROFILE_COLUMNS},
        **{k: v for k, v in updates.items() if k in PROFILE_COLUMNS},
        "id": target_id,
        "updated_at": datetime.utcnow().isoformat(),
    }

    for col in JSON_COLUMNS:
        if col in data and data[col] is not None and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])

    profile = _upsert_profile_row(data, db)
    _set_active_profile_id(db, target_id)
    return {
        "profile": profile,
        "profile_id": target_id,
        "created_new_profile": create_new_profile,
        "extracted": extracted,
    }


@router.post("/profile/recommend-roles")
def recommend_roles(
    profile_id: str | None = Query(default=None),
    db: sqlite3.Connection = Depends(db_conn),
):
    resolved = _resolve_profile_id(db, profile_id)
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (resolved,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile_row = _row_to_profile(row)
    recommendations, used_ai = recommend_role_interests_for_profile(profile=profile_row, limit=5)
    merged_role_interests = _merge_role_interests(profile_row.get("role_interests_json"), recommendations)

    updated = _upsert_profile_row(
        {
            "id": resolved,
            "role_interests_json": json.dumps(merged_role_interests),
            "updated_at": datetime.utcnow().isoformat(),
        },
        db,
    )
    _set_active_profile_id(db, resolved)
    return {
        "profile": updated,
        "recommended_count": len(recommendations),
        "used_ai": used_ai,
    }

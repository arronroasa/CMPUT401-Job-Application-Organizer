from datetime import datetime
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db

router = APIRouter(prefix="", tags=["settings"])

ALLOWED_LLM_PROVIDERS = {"gemini", "openai", "local"}
ALLOWED_TEMPLATES = {"jakes", "minimal", "modern"}


class UpdateSettingsRequest(BaseModel):
    daily_submission_cap: int | None = None
    discovery_interval_minutes: int | None = None
    default_resume_template: str | None = None
    export_path: str | None = None
    llm_provider: str | None = None
    llm_api_key: str | None = None


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _ensure_settings_row(db: sqlite3.Connection) -> None:
    db.execute(
        """
        INSERT INTO settings (id)
        VALUES (1)
        ON CONFLICT(id) DO NOTHING
        """
    )
    db.commit()


def _get_settings_or_500(db: sqlite3.Connection) -> dict[str, Any]:
    _ensure_settings_row(db)
    row = db.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Settings row missing")
    return dict(row)


@router.get("/settings")
def get_settings(db: sqlite3.Connection = Depends(db_conn)):
    return _get_settings_or_500(db)


@router.put("/settings")
def update_settings(payload: UpdateSettingsRequest, db: sqlite3.Connection = Depends(db_conn)):
    updates: dict[str, Any] = {}

    if payload.daily_submission_cap is not None:
        if payload.daily_submission_cap < 1 or payload.daily_submission_cap > 50:
            raise HTTPException(status_code=400, detail="daily_submission_cap must be between 1 and 50")
        updates["daily_submission_cap"] = payload.daily_submission_cap

    if payload.discovery_interval_minutes is not None:
        if payload.discovery_interval_minutes < 1:
            raise HTTPException(status_code=400, detail="discovery_interval_minutes must be >= 1")
        updates["discovery_interval_minutes"] = payload.discovery_interval_minutes

    if payload.default_resume_template is not None:
        if payload.default_resume_template not in ALLOWED_TEMPLATES:
            raise HTTPException(status_code=400, detail="default_resume_template is invalid")
        updates["default_resume_template"] = payload.default_resume_template

    if payload.export_path is not None:
        updates["export_path"] = payload.export_path

    if payload.llm_provider is not None:
        if payload.llm_provider not in ALLOWED_LLM_PROVIDERS:
            raise HTTPException(status_code=400, detail="llm_provider is invalid")
        updates["llm_provider"] = payload.llm_provider

    if payload.llm_api_key is not None:
        updates["llm_api_key"] = payload.llm_api_key.strip()

    if not updates:
        return _get_settings_or_500(db)

    updates["updated_at"] = datetime.utcnow().isoformat()
    assignments = ", ".join(f"{column} = ?" for column in updates.keys())
    values = list(updates.values())

    _ensure_settings_row(db)
    db.execute(
        f"UPDATE settings SET {assignments} WHERE id = 1",
        values,
    )
    db.commit()
    return _get_settings_or_500(db)

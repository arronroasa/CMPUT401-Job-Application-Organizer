"""Application drafts — the "Apply" flow.

Ported from careersavers' routers/drafts.py, trimmed down to the fill-only
path: prepare a draft (scan the job's application form + generate answers
from the active profile), then fill it into a Chrome window you already
have open with remote debugging enabled. It deliberately never calls the
original engine's final-submit step (`confirm_submit_application`) — you
always review and submit the real application yourself.

This also drops the resume_version_id -> export_resume_pdf indirection the
original had (that's part of the resume-TAILORING engine, which isn't part
of this trimmed backend) since submission_engine.py already reads the
resume file straight off the active profile's `resume_file_path` (set by
/profile/resume), and the chat/operator-guidance and rate-limit machinery
tied to interactive multi-cycle sessions, since this port only ever runs
one fill pass per draft.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.applications.draft_generator import generate_draft_answers
from ..engines.applications.form_analyzer import analyze_form
from ..engines.applications.submission_engine import (
    BrowserUnavailableError,
    RateLimitError,
    get_submission_progress,
    submit_application,
)

router = APIRouter(prefix="/drafts", tags=["drafts"])

JSON_COLUMNS = {"form_structure_json", "filled_answers_json", "screening_answers_json"}


class PrepareDraftRequest(BaseModel):
    job_id: str


class FillDraftRequest(BaseModel):
    # A lightweight stand-in for the original's two separate consent flags
    # (confirm_user_assisted + acknowledge_platform_terms) — same idea:
    # you're confirming you understand this will drive a real browser
    # window and you're responsible for what you submit through it.
    confirmed: bool = False


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_draft(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    for col in JSON_COLUMNS:
        raw = item.get(col)
        if isinstance(raw, str):
            try:
                item[col] = json.loads(raw)
            except json.JSONDecodeError:
                pass
    return item


def _artifact_url_for_screenshot_path(path: str | None) -> str | None:
    if not path:
        return None
    filename = Path(path).name.strip()
    if not filename:
        return None
    return f"/artifacts/screenshots/{quote(filename)}"


def _get_draft_or_404(draft_id: str, db: sqlite3.Connection) -> dict[str, Any]:
    row = db.execute("SELECT * FROM application_drafts WHERE id = ?", (draft_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _row_to_draft(row)


def _get_active_profile_id(db: sqlite3.Connection) -> str:
    try:
        row = db.execute("SELECT active_profile_id FROM settings WHERE id = 1").fetchone()
        active = str(row[0] or "").strip() if row is not None else ""
    except sqlite3.Error:
        active = ""
    return active or "local"


@router.post("/prepare")
async def prepare_draft(payload: PrepareDraftRequest, db: sqlite3.Connection = Depends(db_conn)):
    job = db.execute(
        "SELECT * FROM jobs WHERE id = ? AND is_archived = 0",
        (payload.job_id,),
    ).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    active_profile_id = _get_active_profile_id(db)
    profile = db.execute("SELECT * FROM user_profile WHERE id = ?", (active_profile_id,)).fetchone()
    if profile is None and active_profile_id != "local":
        profile = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="No profile found — upload a resume via Auto Search first so there's something to fill the form with.",
        )

    job_dict = dict(job)
    profile_dict = dict(profile)

    form_fields = await analyze_form(str(job_dict.get("source_url") or ""))
    filled_answers = generate_draft_answers(job_dict, profile_dict, form_fields)

    draft_id = f"app-{uuid4().hex[:8]}"
    now = datetime.utcnow().isoformat()
    # submission_engine.py's _assert_can_submit() (shared by both the
    # fill-only path we use and the real click_submit=True path we never
    # call) unconditionally requires status='approved' before it will touch
    # a draft — in careersavers proper that's set by a separate
    # POST /drafts/{id}/approve step after a human reviews the drafted
    # answers in a chat UI. This trimmed port doesn't have that
    # edit-then-approve step (you review the RESULT instead, via the
    # screenshot returned by /fill), so there's nothing left to gate on:
    # mark it approved immediately.
    db.execute(
        """
        INSERT INTO application_drafts (
            id,
            job_id,
            profile_id,
            status,
            form_structure_json,
            filled_answers_json,
            created_at,
            approved_at
        )
        VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)
        """,
        (
            draft_id,
            payload.job_id,
            str(profile_dict.get("id") or active_profile_id or "local"),
            json.dumps(form_fields),
            json.dumps(filled_answers),
            now,
            now,
        ),
    )
    db.commit()
    return _get_draft_or_404(draft_id, db)


@router.get("/{draft_id}")
def get_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/fill")
async def fill_draft(
    draft_id: str,
    payload: FillDraftRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Connects to a Chrome window you already have open with remote
    debugging enabled, navigates it to the job's application page, and
    fills in the form. Stops at a review screenshot — nothing gets
    submitted; you do that yourself in the browser window.
    """
    if not payload.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Confirmation required: this will control a real Chrome window.",
        )
    _get_draft_or_404(draft_id, db)
    try:
        result = await submit_application(
            draft_id,
            db,
            use_visible_browser=True,
            pause_for_manual_input_seconds=0,
        )
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except BrowserUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    screenshot_path = result.get("screenshot_path")
    return {
        "status": result.get("status", "ready_for_final_approval"),
        "screenshot_path": screenshot_path,
        "screenshot_url": _artifact_url_for_screenshot_path(screenshot_path),
        "mode": result.get("mode"),
    }


@router.get("/{draft_id}/progress")
def get_draft_progress(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    _get_draft_or_404(draft_id, db)
    progress = get_submission_progress(draft_id)
    screenshot_path = progress.get("latest_screenshot_path")
    return {
        **progress,
        "latest_screenshot_url": _artifact_url_for_screenshot_path(
            screenshot_path if isinstance(screenshot_path, str) else None
        ),
    }

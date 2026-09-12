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
from ..engines.resume.pdf_exporter import ResumePdfExportError, export_resume_pdf
from ..engines.applications.submission_engine import (
    BrowserUnavailableError,
    RateLimitError,
    confirm_submit_application,
    get_chat_messages,
    get_submission_progress,
    post_user_chat_message,
    set_submission_guidance,
    submit_application,
)

router = APIRouter(prefix="/drafts", tags=["drafts"])

JSON_COLUMNS = {"form_structure_json", "filled_answers_json", "screening_answers_json"}


class PrepareDraftRequest(BaseModel):
    job_id: str
    resume_version_id: str | None = None


class UpdateDraftRequest(BaseModel):
    filled_answers_json: dict[str, Any]


class AssistedFillRequest(BaseModel):
    confirm_user_assisted: bool = False
    acknowledge_platform_terms: bool = False
    use_visible_browser: bool = False
    pause_for_manual_input_seconds: int = 0


class AssistedFinalSubmitRequest(BaseModel):
    confirm_user_assisted: bool = False
    acknowledge_platform_terms: bool = False
    confirm_final_submit: bool = False
    use_visible_browser: bool = False


class AssistedManualSubmitRequest(BaseModel):
    confirm_user_assisted: bool = False
    acknowledge_platform_terms: bool = False
    confirm_final_submit: bool = False


class AssistedGuidanceRequest(BaseModel):
    message: str


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _assert_assisted_consent(confirm_user_assisted: bool, acknowledge_platform_terms: bool) -> None:
    if not confirm_user_assisted:
        raise HTTPException(status_code=400, detail="User-assisted mode confirmation is required")
    if not acknowledge_platform_terms:
        raise HTTPException(status_code=400, detail="Platform terms acknowledgement is required")


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
    return f"/api/artifacts/screenshots/{quote(filename)}"


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


def _select_resume_version_for_job(
    db: sqlite3.Connection,
    *,
    job_id: str,
    profile_id: str,
    preferred_resume_id: str | None,
) -> str | None:
    if preferred_resume_id:
        return preferred_resume_id

    rows = db.execute(
        """
        SELECT id, content_json
        FROM resume_versions
        WHERE job_id = ?
        ORDER BY created_at DESC
        """,
        (job_id,),
    ).fetchall()
    if not rows:
        return None

    fallback_id: str | None = None
    for row in rows:
        resume_id = str(row["id"] if isinstance(row, sqlite3.Row) else row[0])
        if not fallback_id:
            fallback_id = resume_id
        raw_content = row["content_json"] if isinstance(row, sqlite3.Row) else row[1]
        if not isinstance(raw_content, str) or not raw_content.strip():
            continue
        try:
            parsed = json.loads(raw_content)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            embedded_profile_id = str(parsed.get("profile_id") or "").strip()
            if embedded_profile_id and embedded_profile_id == profile_id:
                return resume_id
    return fallback_id


def _resume_upload_override_from_version(
    db: sqlite3.Connection,
    resume_version_id: str | None,
) -> dict[str, str] | None:
    if not resume_version_id:
        return None
    try:
        export = export_resume_pdf(resume_version_id, db)
    except (ValueError, ResumePdfExportError):
        return None
    resume_path = str(export.get("pdf_path") or "").strip()
    file_name = str(export.get("filename") or "").strip()
    if not resume_path:
        return None
    if not Path(resume_path).exists():
        return None
    return {
        "resume_file_path": resume_path,
        "resume_file_name": file_name or Path(resume_path).name,
    }


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
        raise HTTPException(status_code=404, detail="Profile not found")

    selected_resume_version_id = _select_resume_version_for_job(
        db,
        job_id=payload.job_id,
        profile_id=str(dict(profile).get("id") or active_profile_id or "local"),
        preferred_resume_id=payload.resume_version_id,
    )

    if selected_resume_version_id:
        resume = db.execute("SELECT id FROM resume_versions WHERE id = ?", (selected_resume_version_id,)).fetchone()
        if resume is None:
            raise HTTPException(status_code=404, detail="Resume version not found")

    job_dict = dict(job)
    profile_dict = dict(profile)

    form_fields = await analyze_form(str(job_dict.get("source_url") or ""))
    resume_upload_override = _resume_upload_override_from_version(db, selected_resume_version_id)
    filled_answers = generate_draft_answers(
        job_dict,
        profile_dict,
        form_fields,
        resume_upload_override=resume_upload_override,
    )

    draft_id = f"app-{uuid4().hex[:8]}"
    db.execute(
        """
        INSERT INTO application_drafts (
            id,
            job_id,
            resume_version_id,
            profile_id,
            status,
            form_structure_json,
            filled_answers_json,
            created_at
        )
        VALUES (?, ?, ?, ?, 'drafted', ?, ?, ?)
        """,
        (
            draft_id,
            payload.job_id,
            selected_resume_version_id,
            str(profile_dict.get("id") or active_profile_id or "local"),
            json.dumps(form_fields),
            json.dumps(filled_answers),
            datetime.utcnow().isoformat(),
        ),
    )
    db.commit()
    return _get_draft_or_404(draft_id, db)


@router.get("/{draft_id}")
def get_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    return _get_draft_or_404(draft_id, db)


@router.patch("/{draft_id}")
def update_draft(draft_id: str, payload: UpdateDraftRequest, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET filled_answers_json = ? WHERE id = ?",
        (json.dumps(payload.filled_answers_json), draft_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/approve")
def approve_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET status = 'approved', approved_at = ? WHERE id = ?",
        (datetime.utcnow().isoformat(), draft_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/reject")
def reject_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET status = 'rejected' WHERE id = ?",
        (draft_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/submit")
async def submit_draft(
    draft_id: str,
    payload: AssistedFillRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _assert_assisted_consent(payload.confirm_user_assisted, payload.acknowledge_platform_terms)
    try:
        result = await submit_application(
            draft_id,
            db,
            use_visible_browser=payload.use_visible_browser,
            pause_for_manual_input_seconds=payload.pause_for_manual_input_seconds,
        )
        screenshot_path = result.get("screenshot_path")
        return {
            "status": result.get("status", "ready_for_final_approval"),
            "screenshot_path": screenshot_path,
            "screenshot_url": _artifact_url_for_screenshot_path(screenshot_path),
            "mode": result.get("mode"),
            "requires_explicit_final_submit": True,
        }
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except BrowserUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{draft_id}/confirm-submit")
async def confirm_submit_draft(
    draft_id: str,
    payload: AssistedFinalSubmitRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _assert_assisted_consent(payload.confirm_user_assisted, payload.acknowledge_platform_terms)
    if not payload.confirm_final_submit:
        raise HTTPException(status_code=400, detail="Final submit confirmation is required")
    try:
        result = await confirm_submit_application(
            draft_id,
            db,
            use_visible_browser=payload.use_visible_browser,
        )
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except BrowserUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    submitted_at = datetime.utcnow().isoformat()
    db.execute(
        """
        UPDATE application_drafts
        SET status = 'submitted', submitted_at = ?
        WHERE id = ?
        """,
        (submitted_at, draft_id),
    )

    run_id = f"submission-{uuid4().hex[:10]}"
    db.execute(
        """
        INSERT INTO discovery_runs (id, started_at, completed_at, jobs_found, jobs_new, source, status)
        VALUES (?, ?, ?, 0, 0, 'submission_engine', 'submitted')
        """,
        (run_id, submitted_at, submitted_at),
    )
    db.commit()

    draft = _get_draft_or_404(draft_id, db)
    screenshot_path = result.get("screenshot_path")
    return {
        "status": result.get("status", "submitted"),
        "screenshot_path": screenshot_path,
        "screenshot_url": _artifact_url_for_screenshot_path(screenshot_path),
        "mode": result.get("mode"),
        "draft": draft,
    }


@router.post("/{draft_id}/mark-submitted")
def mark_submitted_manually(
    draft_id: str,
    payload: AssistedManualSubmitRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _assert_assisted_consent(payload.confirm_user_assisted, payload.acknowledge_platform_terms)
    if not payload.confirm_final_submit:
        raise HTTPException(status_code=400, detail="Final submit confirmation is required")

    _get_draft_or_404(draft_id, db)
    submitted_at = datetime.utcnow().isoformat()
    db.execute(
        """
        UPDATE application_drafts
        SET status = 'submitted', submitted_at = ?
        WHERE id = ?
        """,
        (submitted_at, draft_id),
    )
    run_id = f"submission-{uuid4().hex[:10]}"
    db.execute(
        """
        INSERT INTO discovery_runs (id, started_at, completed_at, jobs_found, jobs_new, source, status)
        VALUES (?, ?, ?, 0, 0, 'submission_engine', 'submitted_manual')
        """,
        (run_id, submitted_at, submitted_at),
    )
    db.commit()
    draft = _get_draft_or_404(draft_id, db)
    return {
        "status": "submitted_manual",
        "draft": draft,
    }


@router.get("/{draft_id}/progress")
def get_draft_progress(
    draft_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    _get_draft_or_404(draft_id, db)
    progress = get_submission_progress(draft_id)
    screenshot_path = progress.get("latest_screenshot_path")
    return {
        **progress,
        "latest_screenshot_url": _artifact_url_for_screenshot_path(
            screenshot_path if isinstance(screenshot_path, str) else None
        ),
    }


@router.post("/{draft_id}/guidance")
def set_draft_guidance(
    draft_id: str,
    payload: AssistedGuidanceRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _get_draft_or_404(draft_id, db)
    applied = set_submission_guidance(draft_id, payload.message)
    return {"ok": True, "draft_id": draft_id, "applied_guidance": applied}


class ChatMessageRequest(BaseModel):
    text: str


@router.get("/{draft_id}/messages")
def get_draft_messages(
    draft_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Return the full AI+user chat thread for this draft."""
    _get_draft_or_404(draft_id, db)
    messages = get_chat_messages(draft_id)
    return {"draft_id": draft_id, "messages": messages}


@router.post("/{draft_id}/messages")
def post_draft_message(
    draft_id: str,
    payload: ChatMessageRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """
    Post a user message into the chat thread.
    Also feeds it to the running agent as operator guidance so it can respond.
    """
    _get_draft_or_404(draft_id, db)
    text = str(payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")
    applied = post_user_chat_message(draft_id, text)
    messages = get_chat_messages(draft_id)
    return {"ok": True, "draft_id": draft_id, "applied": applied, "messages": messages}

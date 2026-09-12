"""Resume API router — generate, list, get, and delete resume versions."""

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.resume.compiler import compile_resume, compile_resume_all
from ..engines.resume.pdf_exporter import ResumePdfExportError, export_resume_latex, export_resume_pdf

router = APIRouter(prefix="", tags=["resumes"])


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


class GenerateRequest(BaseModel):
    job_id: str


class UpdateResumeRequest(BaseModel):
    content_json: dict


def _row_to_resume(row: sqlite3.Row) -> dict[str, Any]:
    resume = dict(row)
    raw = resume.get("content_json")
    if isinstance(raw, str):
        try:
            resume["content_json"] = json.loads(raw)
        except json.JSONDecodeError:
            pass
    return resume


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/resumes/generate")
async def generate_resume(
    body: GenerateRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Trigger resume generation for the given job (single version, backwards-compat)."""
    try:
        result = await compile_resume(body.job_id, db)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/resumes/generate-all")
async def generate_all_resumes(
    body: GenerateRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Generate a tailored resume for the given job.

    Returns a list with one resume version object for backwards compatibility
    with existing frontend response shape.
    """
    try:
        results = await compile_resume_all(body.job_id, db)
        return {
            "job_id": body.job_id,
            "versions": [
                {
                    "id": r["id"],
                    "label": r["label"],
                    "type": r["type"],
                    "template_id": r["template_id"],
                    "strength_score": r["strength_score"],
                    "created_at": r["created_at"],
                }
                for r in results
            ],
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/resumes")
def list_resumes(db: sqlite3.Connection = Depends(db_conn)):
    """Return all resume versions, newest first."""
    rows = db.execute(
        """
        SELECT rv.*, j.title AS job_title, j.company AS job_company
        FROM resume_versions rv
        LEFT JOIN jobs j ON j.id = rv.job_id
        ORDER BY rv.created_at DESC
        """
    ).fetchall()
    return [_row_to_resume(row) for row in rows]


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Return a single resume version by ID."""
    row = db.execute(
        """
        SELECT rv.*, j.title AS job_title, j.company AS job_company
        FROM resume_versions rv
        LEFT JOIN jobs j ON j.id = rv.job_id
        WHERE rv.id = ?
        """,
        (resume_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return _row_to_resume(row)


@router.patch("/resumes/{resume_id}")
def update_resume(
    resume_id: str,
    body: UpdateResumeRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Overwrite the content_json of an existing resume version (user inline edits)."""
    result = db.execute(
        "UPDATE resume_versions SET content_json = ? WHERE id = ?",
        (json.dumps(body.content_json), resume_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Resume not found")
    row = db.execute(
        """
        SELECT rv.*, j.title AS job_title, j.company AS job_company
        FROM resume_versions rv
        LEFT JOIN jobs j ON j.id = rv.job_id
        WHERE rv.id = ?
        """,
        (resume_id,),
    ).fetchone()
    return _row_to_resume(row)


@router.post("/resumes/{resume_id}/export/pdf")
def export_pdf(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Render selected template to LaTeX, compile PDF, save to export path, return file."""
    try:
        result = export_resume_pdf(resume_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ResumePdfExportError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    response = FileResponse(
        path=result["pdf_path"],
        filename=result["filename"],
        media_type="application/pdf",
    )
    response.headers["X-Resume-Export-Path"] = result["pdf_path"]
    response.headers["X-Resume-Template"] = result["template"]
    response.headers["X-Resume-Tex-Path"] = result["tex_path"]
    response.headers["X-Resume-AI-Used"] = "true" if result.get("ai_used") else "false"
    return response


@router.post("/resumes/{resume_id}/export/latex")
def export_latex(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Render selected template to LaTeX source and return as a .tex file download."""
    try:
        result = export_resume_latex(resume_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ResumePdfExportError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    from fastapi.responses import Response
    return Response(
        content=result["latex_source"],
        media_type="text/x-tex",
        headers={
            "Content-Disposition": f'attachment; filename="{result["filename"]}"',
            "X-Resume-Template": result["template"],
        },
    )


@router.delete("/resumes/{resume_id}")
def delete_resume(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Hard-delete a resume version (they are regeneratable)."""
    result = db.execute(
        "DELETE FROM resume_versions WHERE id = ?",
        (resume_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"ok": True, "deleted_id": resume_id}

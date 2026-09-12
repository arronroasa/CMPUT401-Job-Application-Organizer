import importlib
import logging
import sqlite3

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.db.database import get_db
from app.engines.feedback.cache_refresher import refresh_insights_cache

logger = logging.getLogger(__name__)

router = APIRouter(tags=['outcomes'])
ALLOWED_STATUSES = {'submitted', 'viewed', 'interview', 'offer', 'rejected'}


class OutcomeUpdate(BaseModel):
    status: str
    response_time_days: int | None = None
    rejection_type: str | None = None
    notes: str | None = None


def _get_db() -> sqlite3.Connection:
    return get_db()


async def _refresh_cached_insights() -> None:
    conn = _get_db()
    try:
        await refresh_insights_cache(conn)
    except Exception:  # pragma: no cover
        logger.exception('Failed to refresh insights cache')
    finally:
        conn.close()


async def _generate_interview_kit(draft_id: str) -> None:
    try:
        module = importlib.import_module('app.engines.interviews.kit_generator')
        generate_fn = getattr(module, 'generate_interview_kit', None)
        if not callable(generate_fn):
            return

        conn = _get_db()
        try:
            await generate_fn(draft_id, conn)
        finally:
            conn.close()
    except ModuleNotFoundError:
        logger.info('Interview kit generator not available yet, skipping')
    except Exception:  # pragma: no cover
        logger.exception('Failed to generate interview kit for draft_id=%s', draft_id)


@router.patch('/applications/{draft_id}/outcome')
async def update_application_outcome(draft_id: str, payload: OutcomeUpdate, background_tasks: BackgroundTasks):
    status = payload.status.strip().lower()
    if status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f'Invalid status: {payload.status}')

    conn = _get_db()
    try:
        cursor = conn.cursor()

        cursor.execute('SELECT id FROM application_drafts WHERE id = ?', (draft_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail='Application draft not found')

        cursor.execute(
            """
            UPDATE application_drafts
            SET status = ?,
                response_time_days = ?,
                rejection_type = ?,
                notes = ?
            WHERE id = ?
            """,
            (
                status,
                payload.response_time_days,
                payload.rejection_type,
                payload.notes,
                draft_id,
            ),
        )
        conn.commit()

        background_tasks.add_task(_refresh_cached_insights)
        if status == 'interview':
            background_tasks.add_task(_generate_interview_kit, draft_id)

        cursor.execute(
            """
            SELECT id, status, response_time_days, rejection_type, notes
            FROM application_drafts
            WHERE id = ?
            """,
            (draft_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else {'id': draft_id, 'status': status}
    finally:
        conn.close()

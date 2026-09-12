import json
import sqlite3
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app.db.database import get_db
from app.engines.feedback.cache_refresher import refresh_insights_cache

router = APIRouter(prefix='/insights', tags=['insights'])

def _get_db() -> sqlite3.Connection:
    return get_db()


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


async def _ensure_fresh(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS insights_cache (
            id INTEGER PRIMARY KEY,
            rolling_metrics_json TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    cursor.execute("PRAGMA table_info(insights_cache)")
    columns = {row[1] for row in cursor.fetchall()}
    if 'patterns_json' not in columns:
        cursor.execute("ALTER TABLE insights_cache ADD COLUMN patterns_json TEXT")
    if 'weights_json' not in columns:
        cursor.execute("ALTER TABLE insights_cache ADD COLUMN weights_json TEXT")
    conn.commit()

    cursor.execute("SELECT updated_at FROM insights_cache WHERE id = 1")
    row = cursor.fetchone()
    if row is None:
        await refresh_insights_cache(conn)
        return

    updated_at = _parse_dt(row['updated_at'])
    if updated_at is None or datetime.utcnow() - updated_at > timedelta(hours=1):
        await refresh_insights_cache(conn)


@router.get('')
async def get_insights():
    conn = _get_db()
    try:
        await _ensure_fresh(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT rolling_metrics_json FROM insights_cache WHERE id = 1")
        row = cursor.fetchone()
        if not row or not row['rolling_metrics_json']:
            raise HTTPException(status_code=404, detail='Insights cache is empty')
        return json.loads(row['rolling_metrics_json'])
    finally:
        conn.close()


@router.post('/refresh')
async def refresh_insights():
    conn = _get_db()
    try:
        metrics = await refresh_insights_cache(conn)
        return metrics
    finally:
        conn.close()


@router.get('/patterns')
async def get_patterns():
    conn = _get_db()
    try:
        await _ensure_fresh(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT patterns_json FROM insights_cache WHERE id = 1")
        row = cursor.fetchone()
        if not row or not row['patterns_json']:
            return []
        return json.loads(row['patterns_json'])
    finally:
        conn.close()

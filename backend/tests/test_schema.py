import sqlite3
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.schema import init_db

EXPECTED_TABLES = {
    "user_profile",
    "jobs",
    "resume_versions",
    "application_drafts",
    "interview_kits",
    "insights_cache",
    "discovery_runs",
    "settings",
}


def _get_tables(db_path: Path) -> set[str]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        return {name for (name,) in rows}
    finally:
        conn.close()


def test_init_db_creates_all_tables(tmp_path: Path):
    db_path = tmp_path / "career_copilot.db"
    init_db(db_path)
    tables = _get_tables(db_path)
    assert EXPECTED_TABLES.issubset(tables)


def test_init_db_is_idempotent(tmp_path: Path):
    db_path = tmp_path / "career_copilot.db"
    init_db(db_path)
    init_db(db_path)
    tables = _get_tables(db_path)
    assert EXPECTED_TABLES.issubset(tables)

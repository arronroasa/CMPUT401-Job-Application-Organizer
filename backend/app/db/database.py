from pathlib import Path
import sqlite3

DB_FILENAME = "career_copilot.db"
DB_PATH = Path(__file__).resolve().parents[2] / "data" / DB_FILENAME


def get_db(db_path: str | Path | None = None) -> sqlite3.Connection:
    target = Path(db_path) if db_path is not None else DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(target, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

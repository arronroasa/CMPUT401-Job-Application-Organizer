from pathlib import Path

from .database import get_db

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY DEFAULT 'local',
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    summary TEXT,
    skills_json TEXT,
    experience_json TEXT,
    projects_json TEXT,
    certifications_json TEXT,
    education_json TEXT,
    role_interests_json TEXT,
    resume_file_name TEXT,
    resume_file_path TEXT,
    resume_uploaded_at TEXT,
    resume_text TEXT,
    resume_parsed_json TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    remote INTEGER DEFAULT 0,
    description TEXT,
    skills_required_json TEXT,
    source TEXT,
    source_url TEXT,
    match_score REAL DEFAULT 0.0,
    match_tier TEXT DEFAULT 'low',
    posted_date TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    is_archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resume_versions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    job_id TEXT REFERENCES jobs(id),
    content_json TEXT,
    strength_score REAL DEFAULT 0.0,
    keyword_coverage REAL DEFAULT 0.0,
    skill_alignment REAL DEFAULT 0.0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_drafts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    resume_version_id TEXT REFERENCES resume_versions(id),
    profile_id TEXT REFERENCES user_profile(id) DEFAULT 'local',
    status TEXT DEFAULT 'drafted',
    form_structure_json TEXT,
    filled_answers_json TEXT,
    cover_letter TEXT,
    screening_answers_json TEXT,
    response_time_days INTEGER,
    rejection_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    approved_at TEXT,
    submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS interview_kits (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES application_drafts(id),
    interview_type TEXT,
    company_profile_json TEXT,
    question_bank_json TEXT,
    answer_drafts_json TEXT,
    mock_scores_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS insights_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    rolling_metrics_json TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discovery_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT,
    completed_at TEXT,
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    source TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daily_submission_cap INTEGER DEFAULT 10,
    discovery_interval_minutes INTEGER DEFAULT 60,
    default_resume_template TEXT DEFAULT 'jakes',
    export_path TEXT DEFAULT '~/Downloads',
    llm_provider TEXT DEFAULT 'gemini',
    llm_api_key TEXT,
    active_profile_id TEXT DEFAULT 'local',
    updated_at TEXT DEFAULT (datetime('now'))
);
"""


def init_db(db_path: str | Path | None = None) -> None:
    conn = get_db(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        _ensure_jobs_columns(conn)
        _ensure_resume_versions_columns(conn)
        _ensure_user_profile_columns(conn)
        _ensure_application_drafts_columns(conn)
        _ensure_settings_columns(conn)
        conn.execute(
            """
            INSERT INTO settings (id)
            VALUES (1)
            ON CONFLICT(id) DO NOTHING
            """
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_jobs_columns(conn) -> None:
    """Add columns that were added after the initial schema deployment."""
    existing = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(jobs)").fetchall()
        if len(row) > 1
    }
    required_defs = [
        ("skill_match", "REAL DEFAULT 0.0"),
        ("experience_match", "REAL DEFAULT 0.75"),
        ("role_match", "REAL DEFAULT 0.5"),
    ]
    for column, definition in required_defs:
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE jobs ADD COLUMN {column} {definition}")


def _ensure_resume_versions_columns(conn) -> None:
    existing = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(resume_versions)").fetchall()
        if len(row) > 1
    }
    required_defs = [
        ("template_id", "TEXT DEFAULT 'classic-serif'"),
    ]
    for column, definition in required_defs:
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE resume_versions ADD COLUMN {column} {definition}")


def _ensure_user_profile_columns(conn) -> None:
    existing = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(user_profile)").fetchall()
        if len(row) > 1
    }
    required_defs = [
        ("portfolio_url", "TEXT"),
        ("resume_file_name", "TEXT"),
        ("resume_file_path", "TEXT"),
        ("resume_uploaded_at", "TEXT"),
        ("resume_text", "TEXT"),
        ("resume_parsed_json", "TEXT"),
        ("education_json", "TEXT"),
    ]
    for column, definition in required_defs:
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE user_profile ADD COLUMN {column} {definition}")


def _ensure_settings_columns(conn) -> None:
    existing = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(settings)").fetchall()
        if len(row) > 1
    }
    required_defs = [
        ("active_profile_id", "TEXT DEFAULT 'local'"),
    ]
    for column, definition in required_defs:
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE settings ADD COLUMN {column} {definition}")

    conn.execute(
        """
        UPDATE settings
        SET active_profile_id = COALESCE(NULLIF(TRIM(active_profile_id), ''), 'local')
        WHERE id = 1
        """
    )


def _ensure_application_drafts_columns(conn) -> None:
    existing = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(application_drafts)").fetchall()
        if len(row) > 1
    }
    # SQLite cannot ADD COLUMN with both REFERENCES and non-NULL/default constraints
    # in many existing-table migration paths. Keep migration compatible by adding a
    # plain TEXT column, then backfill with 'local'.
    required_defs = [
        ("profile_id", "TEXT DEFAULT 'local'"),
    ]
    for column, definition in required_defs:
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE application_drafts ADD COLUMN {column} {definition}")

    conn.execute(
        """
        UPDATE application_drafts
        SET profile_id = COALESCE(NULLIF(TRIM(profile_id), ''), 'local')
        """
    )

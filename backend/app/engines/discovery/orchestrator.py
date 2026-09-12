import json
import logging
import sqlite3
from datetime import datetime
from typing import Any
from uuid import uuid4

from .adapters.base import JobSourceAdapter
from .adapters.greenhouse import GreenhouseAdapter
from .deduplicator import deduplicate_jobs
from .normalizer import normalize_jobs
from .query_generator import generate_queries
from .ranker import apply_ranking

logger = logging.getLogger(__name__)

_SOURCE_ORDER = [
    "greenhouse",
]
_DEFAULT_SOURCES = ["greenhouse"]


def _parse_json_array(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            payload = json.loads(raw)
            return payload if isinstance(payload, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _load_profile(db_conn: sqlite3.Connection, user_profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if user_profile is not None:
        return user_profile
    row = db_conn.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if row is None:
        return None
    return dict(row)


def _build_queries(profile: dict[str, Any]) -> list[str]:
    role_interests = _parse_json_array(profile.get("role_interests_json"))
    profile_location = str(profile.get("location") or "remote").strip() or "remote"
    ordered_queries: list[str] = []
    seen: set[str] = set()

    for interest in role_interests:
        if not isinstance(interest, dict):
            continue
        role = str(interest.get("title") or "").strip()
        if not role:
            continue
        remote = bool(interest.get("remote", False))
        raw_locations = interest.get("locations")
        if isinstance(raw_locations, list) and raw_locations:
            locations = [str(item).strip() for item in raw_locations if str(item).strip()]
        else:
            locations = [profile_location]
        if not locations:
            locations = ["remote"]

        for location in locations:
            for query in generate_queries(role, location, remote):
                normalized = query.strip().lower()
                if normalized in seen:
                    continue
                seen.add(normalized)
                ordered_queries.append(query)
    return ordered_queries


def _insert_jobs(db_conn: sqlite3.Connection, jobs: list[dict[str, Any]]) -> None:
    if not jobs:
        return
    db_conn.executemany(
        """
        INSERT OR IGNORE INTO jobs (
            id, title, company, location, remote, description, skills_required_json,
            source, source_url, match_score, match_tier, skill_match, experience_match,
            role_match, posted_date, discovered_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                job["id"],
                job["title"],
                job["company"],
                job["location"],
                job["remote"],
                job["description"],
                job["skills_required_json"],
                job["source"],
                job["source_url"],
                job["match_score"],
                job["match_tier"],
                job.get("skill_match", job["match_score"]),
                job.get("experience_match", 0.75),
                job.get("role_match", 0.5),
                job["posted_date"],
                job["discovered_at"],
                job["is_archived"],
            )
            for job in jobs
        ],
    )
    db_conn.commit()


def _resolve_sources(
    requested_sources: list[str] | None,
) -> list[str]:
    candidate = requested_sources or _DEFAULT_SOURCES
    seen: set[str] = set()
    resolved: list[str] = []
    for source in candidate:
        normalized = str(source).strip().lower()
        if normalized not in _SOURCE_ORDER:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        resolved.append(normalized)
    return resolved or _DEFAULT_SOURCES


def _build_adapters(
    sources: list[str],
) -> dict[str, JobSourceAdapter]:
    adapters: dict[str, JobSourceAdapter] = {}
    for source in sources:
        if source == "greenhouse":
            adapters[source] = GreenhouseAdapter()
    return adapters


async def _collect_raw_jobs(
    adapters: dict[str, JobSourceAdapter],
    queries: list[str],
    max_results_per_query: int,
) -> list[Any]:
    collected = []
    for _, adapter in adapters.items():
        for query in queries:
            jobs = await adapter.search(query, max_results=max_results_per_query)
            collected.extend(jobs)
    return collected


async def run_discovery(
    db_conn: sqlite3.Connection,
    user_profile: dict[str, Any] | None = None,
    sources: list[str] | None = None,
    *,
    max_results_per_query: int = 20,
) -> dict[str, Any]:
    resolved_sources = _resolve_sources(sources)
    source_label = ",".join(resolved_sources)
    run_id = f"discovery-{uuid4().hex[:10]}"
    started_at = datetime.utcnow().isoformat()
    db_conn.execute(
        """
        INSERT INTO discovery_runs (id, started_at, source, status)
        VALUES (?, ?, ?, ?)
        """,
        (run_id, started_at, source_label, "running"),
    )
    db_conn.commit()

    try:
        profile = _load_profile(db_conn, user_profile)
        if profile is None:
            logger.info("Discovery skipped: user profile not found")
            completed_at = datetime.utcnow().isoformat()
            db_conn.execute(
                """
                UPDATE discovery_runs
                SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
                WHERE id = ?
                """,
                (completed_at, "skipped_no_profile", run_id),
            )
            db_conn.commit()
            return {"run_id": run_id, "jobs_found": 0, "jobs_new": 0, "status": "skipped_no_profile"}

        queries = _build_queries(profile)
        if not queries:
            logger.info("Discovery skipped: no role interests available")
            completed_at = datetime.utcnow().isoformat()
            db_conn.execute(
                """
                UPDATE discovery_runs
                SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
                WHERE id = ?
                """,
                (completed_at, "skipped_no_roles", run_id),
            )
            db_conn.commit()
            return {"run_id": run_id, "jobs_found": 0, "jobs_new": 0, "status": "skipped_no_roles"}

        adapters = _build_adapters(resolved_sources)
        raw_jobs = await _collect_raw_jobs(
            adapters,
            queries,
            max_results_per_query=max(max_results_per_query, 1),
        )

        normalized = normalize_jobs(raw_jobs)
        existing_rows = db_conn.execute("SELECT id, title, company FROM jobs").fetchall()
        existing_ids = {str(row["id"]) for row in existing_rows}
        existing_pairs = [
            f"{str(row['title'] or '').strip()} {str(row['company'] or '').strip()}".strip()
            for row in existing_rows
        ]

        deduped = deduplicate_jobs(normalized, existing_ids, existing_pairs)
        ranked = [apply_ranking(job, profile) for job in deduped][:50]
        _insert_jobs(db_conn, ranked)

        completed_at = datetime.utcnow().isoformat()
        db_conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = ?, jobs_new = ?, status = ?
            WHERE id = ?
            """,
            (completed_at, len(normalized), len(ranked), "completed", run_id),
        )
        db_conn.commit()
        return {
            "run_id": run_id,
            "jobs_found": len(normalized),
            "jobs_new": len(ranked),
            "status": "completed",
            "sources": resolved_sources,
        }
    except Exception:
        logger.exception("Discovery run failed")
        completed_at = datetime.utcnow().isoformat()
        db_conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        db_conn.commit()
        raise

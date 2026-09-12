import asyncio
import re
import sqlite3
from datetime import datetime
from typing import Callable
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from ..db.database import get_db
from ..engines.browser_cdp import normalize_cdp_endpoint
from ..engines.discovery.adapters.browser_assisted import (
    IndeedUserAssistedAdapter,
    LinkedInUserAssistedAdapter,
)
from ..engines.discovery.deduplicator import deduplicate_jobs
from ..engines.discovery.live_session import (
    append_discovery_event,
    finish_discovery_session,
    get_discovery_messages,
    get_discovery_progress,
    latest_discovery_guidance,
    mark_source_finished,
    mark_source_started,
    post_discovery_user_message,
    push_discovery_ai_message,
    should_stop_discovery,
    start_discovery_session,
    update_source_progress,
)
from ..engines.discovery.normalizer import normalize_jobs
from ..engines.discovery.orchestrator import run_discovery
from ..engines.discovery.ranker import apply_ranking

router = APIRouter(prefix="/discovery", tags=["discovery"])
_DEFAULT_SOURCES = ["greenhouse"]
_SUPPORTED_SOURCES = ["greenhouse", "linkedin_browser", "indeed_browser"]
_DEFAULT_BROWSER_ASSIST_SOURCES = ["linkedin"]
_BROWSER_ASSIST_TASKS: dict[str, asyncio.Task] = {}


class DiscoveryRunRequest(BaseModel):
    sources: list[str] | None = None
    max_results_per_query: int = 20


class BrowserAssistDiscoveryRequest(BaseModel):
    source: str = "linkedin"
    query: str = Field(..., min_length=2, max_length=200)
    max_results: int = Field(default=20, ge=1, le=60)
    min_match_score: float = Field(default=0.15, ge=0.0, le=1.0)
    use_visible_browser: bool = True
    cdp_endpoint: str | None = None
    wait_seconds: int = Field(default=25, ge=5, le=180)


class BrowserAssistSessionRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=220)
    sources: list[str] | None = None
    max_results: int = Field(default=300, ge=1, le=300)
    min_match_score: float = Field(default=0.0, ge=0.0, le=1.0)
    use_visible_browser: bool = True
    cdp_endpoint: str | None = None
    wait_seconds: int = Field(default=6, ge=3, le=180)


class DiscoveryChatMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)


def _get_discovery_run_row(run_id: str) -> sqlite3.Row | None:
    conn = get_db()
    try:
        return conn.execute("SELECT * FROM discovery_runs WHERE id = ?", (run_id,)).fetchone()
    finally:
        conn.close()


def _mark_orphaned_run_failed(run_id: str) -> sqlite3.Row | None:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM discovery_runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        status = str(row["status"] or "").lower()
        if status == "running":
            completed_at = datetime.utcnow().isoformat()
            conn.execute(
                """
                UPDATE discovery_runs
                SET status = ?, completed_at = ?
                WHERE id = ?
                """,
                ("failed", completed_at, run_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM discovery_runs WHERE id = ?", (run_id,)).fetchone()
        return row
    finally:
        conn.close()


def _fallback_progress_from_db_row(run_id: str, row: sqlite3.Row) -> dict:
    source_text = str(row["source"] or "")
    sources = [part.strip() for part in source_text.split(",") if part.strip()]
    status = str(row["status"] or "unknown")
    started_at = row["started_at"]
    completed_at = row["completed_at"]
    jobs_found = int(row["jobs_found"] or 0)
    jobs_new = int(row["jobs_new"] or 0)
    return {
        "run_id": run_id,
        "status": status,
        "mode": "browser_assisted_visible",
        "query": "",
        "sources": sources,
        "current_source": None,
        "jobs_found": jobs_found,
        "jobs_new": jobs_new,
        "started_at": started_at,
        "updated_at": completed_at or started_at,
        "completed_at": completed_at,
        "error": (
            "Discovery session context is unavailable (backend restarted). "
            "Please run Auto Search again."
            if status in {"failed", "running"}
            else None
        ),
        "events": [],
        "source_results": [
            {
                "source": source,
                "status": "completed" if status == "completed" else status,
                "jobs_found": 0,
                "jobs_new": 0,
                "error": None,
            }
            for source in sources
        ],
        "estimated_duration_seconds": 0,
    }


def _effective_sources(request: DiscoveryRunRequest) -> list[str]:
    candidate = request.sources or _DEFAULT_SOURCES
    seen: set[str] = set()
    resolved: list[str] = []
    for source in candidate:
        normalized = str(source).strip().lower()
        if normalized not in _SUPPORTED_SOURCES:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        resolved.append(normalized)
    return resolved or _DEFAULT_SOURCES


def _run_discovery_job(request: DiscoveryRunRequest) -> None:
    conn = get_db()
    try:
        asyncio.run(
            run_discovery(
                conn,
                sources=request.sources,
                max_results_per_query=request.max_results_per_query,
            )
        )
    finally:
        conn.close()


def _normalize_browser_source(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"linkedin", "linkedin_browser"}:
        return "linkedin_browser"
    if normalized in {"indeed", "indeed_browser"}:
        return "indeed_browser"
    raise HTTPException(status_code=400, detail="source must be linkedin or indeed")


def _browser_source_short_name(source: str) -> str:
    normalized = _normalize_browser_source(source)
    return "linkedin" if normalized == "linkedin_browser" else "indeed"


def _normalize_browser_sources(values: list[str] | None) -> list[str]:
    candidate = values or list(_DEFAULT_BROWSER_ASSIST_SOURCES)
    seen: set[str] = set()
    resolved: list[str] = []
    for source in candidate:
        short = _browser_source_short_name(source)
        if short in seen:
            continue
        seen.add(short)
        resolved.append(short)
    return resolved or list(_DEFAULT_BROWSER_ASSIST_SOURCES)


def _build_browser_adapter_for_source(
    source: str,
    *,
    use_visible_browser: bool,
    cdp_endpoint: str | None,
    wait_seconds: int,
    event_hook: Callable[[str, str], None] | None = None,
    guidance_provider: Callable[[], str] | None = None,
    stop_requested: Callable[[], bool] | None = None,
):
    normalized = _normalize_browser_source(source)
    common = {
        "use_visible_browser": use_visible_browser,
        "cdp_endpoint": cdp_endpoint,
        "manual_wait_seconds": wait_seconds,
        "event_hook": event_hook,
        "guidance_provider": guidance_provider,
        "stop_requested": stop_requested,
        # Discovery search stays on deterministic Playwright actions for speed.
        # Keep step-by-step AI decisioning for application flow, not discovery.
        "use_ai_navigator": False,
    }
    if normalized == "linkedin_browser":
        return normalized, LinkedInUserAssistedAdapter(**common)
    return normalized, IndeedUserAssistedAdapter(**common)


def _insert_jobs(
    db_conn: sqlite3.Connection,
    jobs: list[dict],
    *,
    upsert_by_source_url: bool = False,
) -> tuple[int, int]:
    if not jobs:
        return 0, 0
    if not upsert_by_source_url:
        before = db_conn.total_changes
        db_conn.executemany(
            """
            INSERT OR IGNORE INTO jobs (
                id, title, company, location, remote, description, skills_required_json,
                source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    job["posted_date"],
                    job["discovered_at"],
                    job["is_archived"],
                )
                for job in jobs
            ],
        )
        db_conn.commit()
        return max(0, db_conn.total_changes - before), 0

    existing_rows = db_conn.execute("SELECT id, source_url FROM jobs").fetchall()
    existing_ids = {str(row["id"]) for row in existing_rows}
    existing_by_url = {
        str(row["source_url"] or "").strip().lower(): str(row["id"])
        for row in existing_rows
        if str(row["source_url"] or "").strip()
    }
    inserted_count = 0
    updated_count = 0
    for job in jobs:
        source_url = str(job.get("source_url") or "").strip()
        source_key = source_url.lower()
        target_id = str(job["id"])
        existing_id = existing_by_url.get(source_key) if source_key else None
        if existing_id:
            target_id = existing_id
        db_conn.execute(
            """
            INSERT INTO jobs (
                id, title, company, location, remote, description, skills_required_json,
                source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                company=excluded.company,
                location=excluded.location,
                remote=excluded.remote,
                description=excluded.description,
                skills_required_json=excluded.skills_required_json,
                source=excluded.source,
                source_url=excluded.source_url,
                match_score=excluded.match_score,
                match_tier=excluded.match_tier,
                posted_date=excluded.posted_date,
                discovered_at=excluded.discovered_at,
                is_archived=0
            """,
            (
                target_id,
                job["title"],
                job["company"],
                job["location"],
                job["remote"],
                job["description"],
                job["skills_required_json"],
                job["source"],
                source_url,
                job["match_score"],
                job["match_tier"],
                job["posted_date"],
                job["discovered_at"],
                job["is_archived"],
            ),
        )
        if existing_id:
            updated_count += 1
        else:
            inserted_count += 1
        existing_ids.add(target_id)
        if source_key:
            existing_by_url[source_key] = target_id
    db_conn.commit()
    return inserted_count, updated_count


def _load_local_profile(db_conn: sqlite3.Connection) -> dict:
    profile_row = db_conn.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if profile_row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return dict(profile_row)


def _rank_and_insert_jobs(
    db_conn: sqlite3.Connection,
    *,
    raw_jobs,
    profile: dict,
    min_match_score: float,
    dedupe_by_source_url_only: bool = False,
) -> tuple[int, int, int]:
    normalized = normalize_jobs(raw_jobs)
    existing_rows = db_conn.execute("SELECT id, title, company, source_url FROM jobs").fetchall()
    existing_ids = {str(row["id"]) for row in existing_rows}
    if dedupe_by_source_url_only:
        seen_keys: set[str] = set()
        deduped = []
        for job in normalized:
            job_id = str(job.get("id") or "")
            source_url = str(job.get("source_url") or "").strip().lower()
            key = source_url or job_id
            if key:
                if key in seen_keys:
                    continue
                seen_keys.add(key)
            deduped.append(job)
    else:
        existing_pairs = [
            f"{str(row['title'] or '').strip()} {str(row['company'] or '').strip()}".strip()
            for row in existing_rows
        ]
        deduped = deduplicate_jobs(normalized, existing_ids, existing_pairs)
    ranked = [apply_ranking(job, profile) for job in deduped]
    threshold = max(0.0, min(float(min_match_score), 1.0))
    filtered = [job for job in ranked if float(job.get("match_score") or 0.0) >= threshold]
    inserted, updated = _insert_jobs(
        db_conn,
        filtered,
        upsert_by_source_url=dedupe_by_source_url_only,
    )
    return len(normalized), inserted, updated


async def _run_single_browser_source(
    db_conn: sqlite3.Connection,
    *,
    source: str,
    query: str,
    max_results: int,
    min_match_score: float,
    use_visible_browser: bool,
    cdp_endpoint: str | None,
    wait_seconds: int,
    event_hook: Callable[[str, str], None] | None = None,
    guidance_provider: Callable[[], str] | None = None,
    stop_requested: Callable[[], bool] | None = None,
) -> tuple[str, int, int]:
    normalized_source, adapter = _build_browser_adapter_for_source(
        source,
        use_visible_browser=use_visible_browser,
        cdp_endpoint=cdp_endpoint,
        wait_seconds=wait_seconds,
        event_hook=event_hook,
        guidance_provider=guidance_provider,
        stop_requested=stop_requested,
    )
    profile = _load_local_profile(db_conn)
    raw_jobs = await adapter.search(query.strip(), max_results=max_results)
    if not raw_jobs and adapter.last_error:
        raise RuntimeError(adapter.last_error)
    jobs_found, jobs_new, _jobs_updated = _rank_and_insert_jobs(
        db_conn,
        raw_jobs=raw_jobs,
        profile=profile,
        min_match_score=min_match_score,
        dedupe_by_source_url_only=True,
    )
    return normalized_source, jobs_found, jobs_new


def _cleanup_browser_assist_task(run_id: str, task: asyncio.Task | None = None) -> None:
    if task is not None:
        try:
            task.result()
        except Exception:
            pass
    _BROWSER_ASSIST_TASKS.pop(run_id, None)


async def _run_browser_assist_session(run_id: str, payload: BrowserAssistSessionRequest) -> None:
    query = payload.query.strip()
    sources = _normalize_browser_sources(payload.sources)
    conn: sqlite3.Connection = get_db()
    total_found = 0
    total_new = 0
    status = "completed"
    error: str | None = None

    try:
        append_discovery_event(run_id, f"Run started for query '{query}'.")
        for source in sources:
            source_short = _browser_source_short_name(source)

            guidance = latest_discovery_guidance(run_id).lower()
            if source_short == "linkedin" and "skip linkedin" in guidance:
                mark_source_finished(run_id, source_short, status="skipped")
                append_discovery_event(run_id, "Skipped LinkedIn per operator guidance.", level="warn")
                continue
            if source_short == "indeed" and "skip indeed" in guidance:
                mark_source_finished(run_id, source_short, status="skipped")
                append_discovery_event(run_id, "Skipped Indeed per operator guidance.", level="warn")
                continue

            if should_stop_discovery(run_id):
                status = "cancelled"
                append_discovery_event(run_id, "Stopping run by operator request.", level="warn")
                push_discovery_ai_message(run_id, "Stopping now as requested.")
                break

            mark_source_started(run_id, source_short)
            append_discovery_event(run_id, f"Searching {source_short.title()} in browser...")
            push_discovery_ai_message(run_id, f"Now searching {source_short.title()} for '{query}'.")

            try:
                source_observed_found = 0
                source_progress_found = 0
                source_progress_new = 0
                source_progress_updated = 0
                processed_urls: set[str] = set()
                profile = _load_local_profile(conn)

                def _source_event_hook(message: str, level: str = "info") -> None:
                    nonlocal source_observed_found
                    append_discovery_event(run_id, message, level=level)
                    matched = re.search(r"Observed\s+(\d+)\s+candidate rows", message, re.IGNORECASE)
                    if matched:
                        source_observed_found = max(source_observed_found, int(matched.group(1)))
                        update_source_progress(
                            run_id,
                            source_short,
                            jobs_found=max(source_observed_found, source_progress_found),
                            jobs_new=source_progress_new,
                        )

                normalized_source, adapter = _build_browser_adapter_for_source(
                    source=source_short,
                    use_visible_browser=payload.use_visible_browser,
                    cdp_endpoint=payload.cdp_endpoint,
                    wait_seconds=payload.wait_seconds,
                    event_hook=_source_event_hook,
                    guidance_provider=lambda: latest_discovery_guidance(run_id),
                    stop_requested=lambda: should_stop_discovery(run_id),
                )

                def _ingest_parsed_batch(batch) -> None:
                    nonlocal source_progress_found, source_progress_new
                    fresh_batch = []
                    for raw_job in batch or []:
                        source_url = str(getattr(raw_job, "source_url", "") or "").strip()
                        if not source_url or source_url in processed_urls:
                            continue
                        processed_urls.add(source_url)
                        fresh_batch.append(raw_job)
                    if not fresh_batch:
                        return
                    batch_found, batch_new, batch_updated = _rank_and_insert_jobs(
                        conn,
                        raw_jobs=fresh_batch,
                        profile=profile,
                        min_match_score=payload.min_match_score,
                        dedupe_by_source_url_only=True,
                    )
                    source_progress_found += batch_found
                    source_progress_new += batch_new
                    source_progress_updated += batch_updated
                    update_source_progress(
                        run_id,
                        source_short,
                        jobs_found=max(source_observed_found, source_progress_found),
                        jobs_new=source_progress_new,
                    )
                    if batch_new > 0 or batch_updated > 0:
                        append_discovery_event(
                            run_id,
                            (
                                f"{source_short.title()} synced {batch_new + batch_updated} jobs "
                                f"({source_progress_new} new, {source_progress_updated} updated)."
                            ),
                            level="debug",
                        )

                raw_jobs = await adapter.search(
                    query.strip(),
                    max_results=payload.max_results,
                    on_parsed_progress=_ingest_parsed_batch,
                )
                if not raw_jobs and adapter.last_error:
                    raise RuntimeError(adapter.last_error)

                remaining_jobs = []
                for raw_job in raw_jobs:
                    source_url = str(getattr(raw_job, "source_url", "") or "").strip()
                    if source_url and source_url in processed_urls:
                        continue
                    if source_url:
                        processed_urls.add(source_url)
                    remaining_jobs.append(raw_job)
                if remaining_jobs:
                    rem_found, rem_new, rem_updated = _rank_and_insert_jobs(
                        conn,
                        raw_jobs=remaining_jobs,
                        profile=profile,
                        min_match_score=payload.min_match_score,
                        dedupe_by_source_url_only=True,
                    )
                    source_progress_found += rem_found
                    source_progress_new += rem_new
                    source_progress_updated += rem_updated

                jobs_found = max(source_observed_found, source_progress_found)
                jobs_new = source_progress_new
                update_source_progress(
                    run_id,
                    source_short,
                    jobs_found=jobs_found,
                    jobs_new=jobs_new,
                )
                source_name = _browser_source_short_name(normalized_source)
                total_found += jobs_found
                total_new += jobs_new
                mark_source_finished(
                    run_id,
                    source_name,
                    status="completed",
                    jobs_found=jobs_found,
                    jobs_new=jobs_new,
                )
                append_discovery_event(
                    run_id,
                    (
                        f"{source_name.title()} complete: {jobs_found} extracted, "
                        f"{source_progress_new} new, {source_progress_updated} updated."
                    ),
                )
                push_discovery_ai_message(
                    run_id,
                    (
                        f"{source_name.title()} done: {jobs_found} extracted, "
                        f"{source_progress_new} new, {source_progress_updated} updated."
                    ),
                )
            except Exception as source_exc:
                source_error = str(source_exc)
                mark_source_finished(run_id, source_short, status="failed", error=source_error)
                append_discovery_event(
                    run_id,
                    f"{source_short.title()} failed: {source_error}",
                    level="error",
                )
                push_discovery_ai_message(run_id, f"{source_short.title()} failed: {source_error}")
                # Keep going to next source instead of failing the whole run immediately.
                continue

        if status == "completed" and total_found == 0:
            append_discovery_event(run_id, "No jobs were extracted from selected sources.", level="warn")
    except Exception as exc:
        status = "failed"
        error = str(exc)
        append_discovery_event(run_id, f"Run failed: {error}", level="error")
    finally:
        if status == "completed":
            any_success = False
            progress = get_discovery_progress(run_id)
            for row in progress.get("source_results", []):
                if str(row.get("status")) == "completed":
                    any_success = True
                    break
            if not any_success:
                status = "failed"
                if not error:
                    error = "All sources failed."

        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = ?, jobs_new = ?, status = ?
            WHERE id = ?
            """,
            (completed_at, total_found, total_new, status, run_id),
        )
        conn.commit()
        conn.close()
        finish_discovery_session(run_id, status=status, error=error)


@router.post("/run")
def trigger_discovery(
    background_tasks: BackgroundTasks,
    request: DiscoveryRunRequest | None = None,
):
    payload = request or DiscoveryRunRequest()
    effective_sources = _effective_sources(payload)
    background_tasks.add_task(_run_discovery_job, payload)
    return {
        "queued": True,
        "status": "running",
        "sources": effective_sources,
        "mode": "bulk_discovery",
        "started_at": datetime.utcnow().isoformat(),
    }


@router.post("/browser-assist")
async def run_browser_assisted_discovery(payload: BrowserAssistDiscoveryRequest):
    source = _browser_source_short_name(payload.source)
    query = payload.query.strip()

    conn: sqlite3.Connection = get_db()
    run_id = f"discovery-{uuid4().hex[:10]}"
    started_at = datetime.utcnow().isoformat()
    conn.execute(
        """
        INSERT INTO discovery_runs (id, started_at, source, status)
        VALUES (?, ?, ?, ?)
        """,
        (run_id, started_at, source, "running"),
    )
    conn.commit()

    try:
        normalized_source, jobs_found, jobs_new = await _run_single_browser_source(
            conn,
            source=source,
            query=query,
            max_results=payload.max_results,
            min_match_score=payload.min_match_score,
            use_visible_browser=payload.use_visible_browser,
            cdp_endpoint=payload.cdp_endpoint,
            wait_seconds=payload.wait_seconds,
        )
        threshold = max(0.0, min(float(payload.min_match_score), 1.0))

        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = ?, jobs_new = ?, status = ?
            WHERE id = ?
            """,
            (completed_at, jobs_found, jobs_new, "completed", run_id),
        )
        conn.commit()

        return {
            "run_id": run_id,
            "status": "completed",
            "mode": "browser_assisted_visible" if payload.use_visible_browser else "browser_assisted_managed",
            "source": normalized_source,
            "query": query,
            "jobs_found": jobs_found,
            "jobs_new": jobs_new,
            "min_match_score": threshold,
            "started_at": started_at,
            "completed_at": completed_at,
        }
    except HTTPException as exc:
        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        conn.commit()
        raise exc
    except RuntimeError as exc:
        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        conn.commit()
        raise HTTPException(status_code=503, detail=f"Browser-assisted discovery failed. {exc}") from exc
    except Exception:
        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        conn.commit()
        raise
    finally:
        conn.close()


@router.post("/browser-assist/start")
async def start_browser_assisted_discovery_session(payload: BrowserAssistSessionRequest):
    query = payload.query.strip()
    sources = _normalize_browser_sources(payload.sources)
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    run_id = f"discovery-{uuid4().hex[:10]}"
    started_at = datetime.utcnow().isoformat()

    conn: sqlite3.Connection = get_db()
    try:
        conn.execute(
            """
            INSERT INTO discovery_runs (id, started_at, source, status)
            VALUES (?, ?, ?, ?)
            """,
            (run_id, started_at, ",".join(sources), "running"),
        )
        conn.commit()
    finally:
        conn.close()

    mode = "browser_assisted_visible" if payload.use_visible_browser else "browser_assisted_managed"
    start_discovery_session(run_id, query=query, sources=sources, mode=mode)
    task = asyncio.create_task(_run_browser_assist_session(run_id, payload))
    _BROWSER_ASSIST_TASKS[run_id] = task
    task.add_done_callback(lambda _task: _cleanup_browser_assist_task(run_id, _task))

    return {
        "run_id": run_id,
        "status": "running",
        "mode": mode,
        "query": query,
        "sources": sources,
        "started_at": started_at,
    }


@router.get("/browser-assist/{run_id}/progress")
def get_browser_assisted_discovery_progress(run_id: str):
    progress = get_discovery_progress(run_id)
    if progress.get("status") == "idle":
        row = _mark_orphaned_run_failed(run_id)
        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Discovery run not found. Start a new Auto Search run.",
            )
        progress = _fallback_progress_from_db_row(run_id, row)
    started_at = progress.get("started_at")
    elapsed_seconds = 0
    if isinstance(started_at, str) and started_at:
        try:
            elapsed_seconds = max(0, int((datetime.utcnow() - datetime.fromisoformat(started_at)).total_seconds()))
        except Exception:
            elapsed_seconds = 0
    return {
        **progress,
        "elapsed_seconds": elapsed_seconds,
    }


@router.get("/browser-assist/{run_id}/messages")
def get_browser_assisted_discovery_messages(run_id: str):
    progress = get_discovery_progress(run_id)
    if progress.get("status") == "idle":
        row = _get_discovery_run_row(run_id)
        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Discovery run not found. Start a new Auto Search run.",
            )
        return {
            "run_id": run_id,
            "messages": [
                {
                    "role": "ai",
                    "text": "This run is no longer active in memory. Please start Auto Search again.",
                    "at": datetime.utcnow().isoformat(),
                }
            ],
        }
    return {"run_id": run_id, "messages": get_discovery_messages(run_id)}


@router.post("/browser-assist/{run_id}/messages")
def post_browser_assisted_discovery_message(run_id: str, payload: DiscoveryChatMessageRequest):
    progress = get_discovery_progress(run_id)
    if progress.get("status") == "idle":
        row = _get_discovery_run_row(run_id)
        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Discovery run not found. Start a new Auto Search run.",
            )
        raise HTTPException(
            status_code=409,
            detail="Discovery run is no longer active. Start a new Auto Search run.",
        )
    text = str(payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")
    applied = post_discovery_user_message(run_id, text)
    return {
        "ok": True,
        "run_id": run_id,
        "applied": applied,
        "messages": get_discovery_messages(run_id),
    }


@router.get("/status")
def get_discovery_status():
    conn: sqlite3.Connection = get_db()
    try:
        row = conn.execute(
            """
            SELECT *
            FROM discovery_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return {"status": "idle"}
        return dict(row)
    finally:
        conn.close()


@router.get("/browser-status")
def get_browser_status(cdp_endpoint: str | None = None):
    """
    Check whether a Chrome browser with remote debugging is reachable.
    Tries to connect to the CDP /json endpoint and returns connected=true if it succeeds.
    """
    import os
    configured_endpoint = (cdp_endpoint or "").strip() or os.environ.get(
        "DISCOVERY_BROWSER_CDP_ENDPOINT",
        "http://host.docker.internal:9222",
    )
    endpoint = normalize_cdp_endpoint(configured_endpoint)
    endpoint = endpoint.rstrip("/")
    check_url = f"{endpoint}/json/version"
    connected = False
    browser_info: dict = {}
    error: str | None = None
    try:
        with urlopen(check_url, timeout=3) as resp:  # noqa: S310
            import json as _json
            data = _json.loads(resp.read().decode("utf-8", errors="ignore"))
            connected = True
            browser_info = {
                "browser": data.get("Browser", ""),
                "webSocketDebuggerUrl": data.get("webSocketDebuggerUrl", ""),
            }
    except URLError as exc:
        error = f"Could not reach Chrome at {endpoint}: {exc.reason}"
    except Exception as exc:
        error = str(exc)

    return {
        "connected": connected,
        "endpoint": endpoint,
        "configured_endpoint": configured_endpoint,
        "browser_info": browser_info,
        "error": error,
        "how_to_start": (
            "macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n"
            "Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n"
            "Docker backend endpoint: http://host.docker.internal:9222\n"
            "Host backend endpoint:   http://localhost:9222"
        ),
    }


@router.get("/sources")
def get_discovery_sources():
    return {
        "defaults": _DEFAULT_SOURCES,
        "supported": _SUPPORTED_SOURCES,
        "note": (
            "Bulk discovery uses public sources. "
            "LinkedIn/Indeed are available in browser-assisted mode with user session."
        ),
    }

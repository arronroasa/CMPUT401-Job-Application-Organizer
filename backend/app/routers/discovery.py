"""Job discovery — the search that powers "Auto Search" on the
Applications page. Searches public job boards (Greenhouse by default)
for a query you specify (role/keywords + optional location), the same
way the original careersavers UI let you type a search directly, and
ranks the results (using the most recently uploaded resume for scoring,
if one exists).

Note: the original careersavers project also had a "browser-assisted"
discovery mode that drives a real, visible Chrome browser (via CDP) to
search LinkedIn/Indeed interactively. That mode needs a live browser
session on the operator's machine and isn't something a headless backend
container can do on its own, so it was left out of this trimmed-down
version — only the fully automated bulk-discovery path is kept.
"""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from ..db.database import get_db
from ..engines.discovery.orchestrator import run_discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])
_DEFAULT_SOURCES = ["greenhouse"]
_SUPPORTED_SOURCES = ["greenhouse"]


class DiscoveryRunRequest(BaseModel):
    sources: list[str] | None = None
    max_results_per_query: int = 20
    # What to search for — e.g. "backend engineer intern". When omitted,
    # falls back to generating queries from the most recently uploaded
    # resume's role interests (the old resume-role-matching behavior).
    query: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    remote: bool = False


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
    import asyncio

    conn = get_db()
    try:
        asyncio.run(
            run_discovery(
                conn,
                sources=request.sources,
                max_results_per_query=request.max_results_per_query,
                query=request.query,
                location=request.location,
                remote=request.remote,
            )
        )
    finally:
        conn.close()


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
        "query": payload.query,
        "mode": "bulk_discovery",
        "started_at": datetime.utcnow().isoformat(),
    }


@router.get("/status")
def get_discovery_status():
    conn = get_db()
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


@router.get("/sources")
def get_discovery_sources():
    return {
        "defaults": _DEFAULT_SOURCES,
        "supported": _SUPPORTED_SOURCES,
        "note": "Bulk discovery uses public sources (Greenhouse).",
    }

import re
from datetime import datetime
from threading import Lock
from typing import Any

DISCOVERY_EVENT_LIMIT = 260
DISCOVERY_MESSAGE_LIMIT = 240

_LOCK = Lock()
_SESSIONS: dict[str, dict[str, Any]] = {}
_MESSAGES: dict[str, list[dict[str, str]]] = {}
_GUIDANCE: dict[str, str] = {}
_STOP_REQUESTED: set[str] = set()


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _push_ai_message(run_id: str, text: str) -> None:
    normalized = _normalize_space(text)
    if not normalized:
        return
    with _LOCK:
        msgs = _MESSAGES.setdefault(run_id, [])
        msgs.append({"role": "ai", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > DISCOVERY_MESSAGE_LIMIT:
            del msgs[: len(msgs) - DISCOVERY_MESSAGE_LIMIT]


def push_discovery_ai_message(run_id: str, text: str) -> None:
    _push_ai_message(run_id, text)


def _source_entry(source: str) -> dict[str, Any]:
    return {
        "source": source,
        "status": "pending",
        "jobs_found": 0,
        "jobs_new": 0,
        "error": None,
    }


def _recompute_totals(state: dict[str, Any]) -> None:
    source_results = state.get("source_results")
    if not isinstance(source_results, list):
        state["jobs_found"] = 0
        state["jobs_new"] = 0
        return
    total_found = 0
    total_new = 0
    for row in source_results:
        if not isinstance(row, dict):
            continue
        total_found += max(0, int(row.get("jobs_found", 0) or 0))
        total_new += max(0, int(row.get("jobs_new", 0) or 0))
    state["jobs_found"] = total_found
    state["jobs_new"] = total_new


def _ensure_session(run_id: str) -> dict[str, Any]:
    state = _SESSIONS.get(run_id)
    if state is not None:
        return state
    state = {
        "run_id": run_id,
        "status": "running",
        "mode": "browser_assisted_visible",
        "query": "",
        "sources": [],
        "current_source": None,
        "jobs_found": 0,
        "jobs_new": 0,
        "started_at": _utc_now_iso(),
        "updated_at": _utc_now_iso(),
        "completed_at": None,
        "error": None,
        "events": [],
        "source_results": [],
        "estimated_duration_seconds": 0,
    }
    _SESSIONS[run_id] = state
    return state


def start_discovery_session(
    run_id: str,
    *,
    query: str,
    sources: list[str],
    mode: str,
) -> None:
    normalized_query = _normalize_space(query)
    normalized_sources = [str(source).strip().lower() for source in sources if str(source).strip()]
    with _LOCK:
        _GUIDANCE.pop(run_id, None)
        _STOP_REQUESTED.discard(run_id)
        _MESSAGES[run_id] = []
        _SESSIONS[run_id] = {
            "run_id": run_id,
            "status": "running",
            "mode": mode,
            "query": normalized_query,
            "sources": normalized_sources,
            "current_source": normalized_sources[0] if normalized_sources else None,
            "jobs_found": 0,
            "jobs_new": 0,
            "started_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
            "completed_at": None,
            "error": None,
            "events": [],
            "source_results": [_source_entry(source) for source in normalized_sources],
            "estimated_duration_seconds": max(35, len(normalized_sources) * 45),
        }
    append_discovery_event(
        run_id,
        f"Planning browser-assisted search for query '{normalized_query}' across {', '.join(normalized_sources) or 'no sources'}.",
    )
    _push_ai_message(
        run_id,
        (
            "Starting AI auto-search. I'll post status updates here. "
            "You can send guidance (for example: 'skip indeed', 'focus junior roles', or 'stop')."
        ),
    )


def append_discovery_event(run_id: str, message: str, *, level: str = "info") -> None:
    normalized = _normalize_space(message)
    if not normalized:
        return
    with _LOCK:
        state = _ensure_session(run_id)
        events = state.get("events")
        if not isinstance(events, list):
            events = []
            state["events"] = events
        events.append({"at": _utc_now_iso(), "level": str(level or "info"), "message": normalized})
        if len(events) > DISCOVERY_EVENT_LIMIT:
            del events[: len(events) - DISCOVERY_EVENT_LIMIT]
        state["updated_at"] = _utc_now_iso()


def mark_source_started(run_id: str, source: str) -> None:
    normalized = str(source or "").strip().lower()
    with _LOCK:
        state = _ensure_session(run_id)
        state["current_source"] = normalized or state.get("current_source")
        source_results = state.get("source_results")
        if not isinstance(source_results, list):
            source_results = []
            state["source_results"] = source_results
        for row in source_results:
            if str(row.get("source", "")).lower() == normalized:
                row["status"] = "running"
                row["error"] = None
                break
        state["updated_at"] = _utc_now_iso()


def mark_source_finished(
    run_id: str,
    source: str,
    *,
    status: str,
    jobs_found: int = 0,
    jobs_new: int = 0,
    error: str | None = None,
) -> None:
    normalized = str(source or "").strip().lower()
    found = max(0, int(jobs_found))
    new = max(0, int(jobs_new))
    err = _normalize_space(error) if error else None
    with _LOCK:
        state = _ensure_session(run_id)
        source_results = state.get("source_results")
        if not isinstance(source_results, list):
            source_results = []
            state["source_results"] = source_results
        matched = False
        for row in source_results:
            if str(row.get("source", "")).lower() == normalized:
                row["status"] = status
                row["jobs_found"] = found
                row["jobs_new"] = new
                row["error"] = err
                matched = True
                break
        if not matched:
            source_results.append(
                {
                    "source": normalized,
                    "status": status,
                    "jobs_found": found,
                    "jobs_new": new,
                    "error": err,
                }
            )
        _recompute_totals(state)
        state["updated_at"] = _utc_now_iso()


def update_source_progress(
    run_id: str,
    source: str,
    *,
    jobs_found: int,
    jobs_new: int,
) -> None:
    normalized = str(source or "").strip().lower()
    found = max(0, int(jobs_found))
    new = max(0, int(jobs_new))
    with _LOCK:
        state = _ensure_session(run_id)
        source_results = state.get("source_results")
        if not isinstance(source_results, list):
            source_results = []
            state["source_results"] = source_results
        matched = False
        for row in source_results:
            if str(row.get("source", "")).lower() == normalized:
                row["jobs_found"] = found
                row["jobs_new"] = new
                if str(row.get("status") or "").lower() == "pending":
                    row["status"] = "running"
                matched = True
                break
        if not matched:
            source_results.append(
                {
                    "source": normalized,
                    "status": "running",
                    "jobs_found": found,
                    "jobs_new": new,
                    "error": None,
                }
            )
        _recompute_totals(state)
        state["updated_at"] = _utc_now_iso()


def finish_discovery_session(run_id: str, *, status: str, error: str | None = None) -> None:
    err = _normalize_space(error) if error else None
    with _LOCK:
        state = _ensure_session(run_id)
        state["status"] = status
        state["error"] = err
        now = _utc_now_iso()
        state["completed_at"] = now
        state["updated_at"] = now
    if status == "completed":
        _push_ai_message(
            run_id,
            "Search completed. I imported matched jobs into your feed. You can run another search or adjust guidance.",
        )
    elif status == "cancelled":
        _push_ai_message(run_id, "Search stopped by your request.")
    elif err:
        _push_ai_message(run_id, f"Search failed: {err}")


def get_discovery_progress(run_id: str) -> dict[str, Any]:
    with _LOCK:
        state = _SESSIONS.get(run_id)
        if state is None:
            return {
                "run_id": run_id,
                "status": "idle",
                "mode": "browser_assisted_visible",
                "query": "",
                "sources": [],
                "current_source": None,
                "jobs_found": 0,
                "jobs_new": 0,
                "started_at": None,
                "updated_at": _utc_now_iso(),
                "completed_at": None,
                "error": None,
                "events": [],
                "source_results": [],
                "estimated_duration_seconds": 0,
            }
        return {
            "run_id": state.get("run_id", run_id),
            "status": state.get("status", "running"),
            "mode": state.get("mode", "browser_assisted_visible"),
            "query": state.get("query", ""),
            "sources": list(state.get("sources", [])),
            "current_source": state.get("current_source"),
            "jobs_found": int(state.get("jobs_found", 0)),
            "jobs_new": int(state.get("jobs_new", 0)),
            "started_at": state.get("started_at"),
            "updated_at": state.get("updated_at"),
            "completed_at": state.get("completed_at"),
            "error": state.get("error"),
            "events": [dict(item) for item in state.get("events", []) if isinstance(item, dict)],
            "source_results": [
                dict(item)
                for item in state.get("source_results", [])
                if isinstance(item, dict)
            ],
            "estimated_duration_seconds": int(state.get("estimated_duration_seconds", 0)),
        }


def get_discovery_messages(run_id: str) -> list[dict[str, str]]:
    with _LOCK:
        return list(_MESSAGES.get(run_id, []))


def post_discovery_user_message(run_id: str, text: str) -> str:
    normalized = _normalize_space(text)[:1200]
    if not normalized:
        return ""
    with _LOCK:
        _ensure_session(run_id)
        msgs = _MESSAGES.setdefault(run_id, [])
        msgs.append({"role": "user", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > DISCOVERY_MESSAGE_LIMIT:
            del msgs[: len(msgs) - DISCOVERY_MESSAGE_LIMIT]
        _GUIDANCE[run_id] = normalized

    append_discovery_event(run_id, f"Operator guidance received: {normalized[:220]}")
    lowered = normalized.lower()
    if any(token in lowered for token in ("stop", "cancel", "abort")):
        with _LOCK:
            _STOP_REQUESTED.add(run_id)
        _push_ai_message(run_id, "Stopping the run. I will finish the current browser step and then exit.")
    elif "skip indeed" in lowered:
        _push_ai_message(run_id, "Noted. I will skip Indeed if it has not started yet.")
    elif "skip linkedin" in lowered:
        _push_ai_message(run_id, "Noted. I will skip LinkedIn if it has not started yet.")
    else:
        _push_ai_message(run_id, "Got it. I will apply that guidance in the next step.")
    return normalized


def latest_discovery_guidance(run_id: str) -> str:
    with _LOCK:
        return _GUIDANCE.get(run_id, "")


def should_stop_discovery(run_id: str) -> bool:
    with _LOCK:
        return run_id in _STOP_REQUESTED

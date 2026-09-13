from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

PLAYBOOK_DIR = Path(__file__).resolve().parents[3] / "data" / "apply_playbooks"
MAX_PLAYBOOK_LINES = 600
MAX_NOTES_PER_SESSION = 24
MAX_SESSIONS = 30
MAX_SESSION_AGE_DAYS = 90
LEGACY_SESSION_KEEP = 8
MIN_CONFIDENCE_TO_WRITE = 0.72
MIN_CONFIDENCE_TO_LOAD = 0.72
SUCCESS_OUTCOMES = {"success", "submitted", "ready_for_final_approval"}
SESSION_HEADER_RE = re.compile(
    r"^## Session (?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z)"
    r"(?: \| outcome=(?P<outcome>[a-z_]+))?"
    r"(?: \| confidence=(?P<confidence>\d(?:\.\d+)?))?$"
)


@dataclass
class _PlaybookSession:
    timestamp_raw: str
    timestamp: datetime | None
    outcome: str | None
    confidence: float | None
    notes: list[str]


def _site_key(url: str) -> str:
    try:
        parsed = urlparse(str(url or "").strip())
        host = (parsed.hostname or "").strip().lower()
    except Exception:
        host = ""
    if host.startswith("www."):
        host = host[4:]
    safe = "".join(ch for ch in host if ch.isalnum() or ch in {"-", "."}).strip(".")
    return safe or "generic"


def _playbook_path(url: str) -> Path:
    PLAYBOOK_DIR.mkdir(parents=True, exist_ok=True)
    key = _site_key(url)
    return PLAYBOOK_DIR / f"{key}.md"


def _parse_timestamp(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _clamp_confidence(value: float | int | None) -> float:
    try:
        parsed = float(value if value is not None else 0.0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(parsed, 1.0))


def _parse_sessions(lines: list[str]) -> tuple[list[str], list[_PlaybookSession]]:
    preamble: list[str] = []
    sessions: list[_PlaybookSession] = []
    current: _PlaybookSession | None = None

    for line in lines:
        match = SESSION_HEADER_RE.match(line.strip())
        if match:
            if current is not None:
                sessions.append(current)
            ts_raw = match.group("timestamp") or ""
            outcome = (match.group("outcome") or "").strip().lower() or None
            confidence_raw = (match.group("confidence") or "").strip()
            confidence = _clamp_confidence(confidence_raw) if confidence_raw else None
            current = _PlaybookSession(
                timestamp_raw=ts_raw,
                timestamp=_parse_timestamp(ts_raw),
                outcome=outcome,
                confidence=confidence,
                notes=[],
            )
            continue

        if current is not None:
            stripped = line.strip()
            if stripped.startswith("- "):
                note = stripped[2:].strip()
                if note:
                    current.notes.append(note)
            continue

        preamble.append(line)

    if current is not None:
        sessions.append(current)
    return preamble, sessions


def _render_playbook(key: str, preamble: list[str], sessions: list[_PlaybookSession]) -> str:
    rendered: list[str] = []
    if preamble:
        while preamble and not preamble[-1].strip():
            preamble.pop()
        rendered.extend(preamble)
    else:
        rendered.extend(
            [
                f"# Apply Playbook: {key}",
                "",
                "Agent-learned navigation notes for assisted apply flows.",
            ]
        )

    for session in sessions:
        if not session.notes:
            continue
        rendered.append("")
        outcome_text = f" | outcome={session.outcome}" if session.outcome else ""
        confidence_text = (
            f" | confidence={session.confidence:.2f}"
            if session.confidence is not None
            else ""
        )
        rendered.append(f"## Session {session.timestamp_raw}{outcome_text}{confidence_text}")
        for note in session.notes[:MAX_NOTES_PER_SESSION]:
            rendered.append(f"- {note}")

    text = "\n".join(rendered).strip()
    return text + "\n" if text else ""


def _session_is_fresh(session: _PlaybookSession, *, now: datetime) -> bool:
    if session.timestamp is None:
        return False
    return (now - session.timestamp) <= timedelta(days=MAX_SESSION_AGE_DAYS)


def _session_is_high_confidence_success(session: _PlaybookSession, *, now: datetime) -> bool:
    if not _session_is_fresh(session, now=now):
        return False
    if (session.outcome or "").lower() not in SUCCESS_OUTCOMES:
        return False
    if session.confidence is None:
        return False
    return session.confidence >= MIN_CONFIDENCE_TO_LOAD


def _prune_sessions(sessions: list[_PlaybookSession], *, now: datetime) -> list[_PlaybookSession]:
    high_conf = [s for s in sessions if s.notes and _session_is_high_confidence_success(s, now=now)]
    legacy = [
        s
        for s in sessions
        if s.notes
        and _session_is_fresh(s, now=now)
        and not _session_is_high_confidence_success(s, now=now)
    ]
    legacy = legacy[-LEGACY_SESSION_KEEP:]
    kept = (high_conf + legacy)[-MAX_SESSIONS:]
    return kept


def _normalize_notes(notes: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in notes:
        note = str(raw or "").strip()
        if not note:
            continue
        lowered = note.lower()
        # Skip noisy operational notes that do not improve future navigation.
        if lowered.startswith("loaded site playbook notes"):
            continue
        if lowered.startswith("captured browser snapshot"):
            continue
        if lowered.startswith("persisted ") and "login cookies" in lowered:
            continue
        if note in seen:
            continue
        seen.add(note)
        normalized.append(note)
    return normalized


def load_apply_playbook_notes(url: str, *, max_chars: int = 4000) -> str:
    path = _playbook_path(url)
    if not path.exists():
        return ""
    try:
        content = path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""
    if not content:
        return ""

    now = datetime.now(timezone.utc)
    lines = content.splitlines()
    _, sessions = _parse_sessions(lines)
    if not sessions:
        if len(content) <= max_chars:
            return content
        return content[-max_chars:]

    preferred = [s for s in sessions if _session_is_high_confidence_success(s, now=now)]
    selected = preferred[-8:]
    if not selected:
        selected = _prune_sessions(sessions, now=now)[-4:]
    if not selected:
        return ""

    notes: list[str] = []
    seen: set[str] = set()
    for session in reversed(selected):
        for note in session.notes:
            key = note.lower()
            if key in seen:
                continue
            seen.add(key)
            notes.append(note)

    if not notes:
        return ""
    payload = "\n".join(f"- {note}" for note in notes)
    if len(payload) <= max_chars:
        return payload
    return payload[-max_chars:]


def append_apply_playbook_notes(url: str, notes: Iterable[str]) -> None:
    append_apply_playbook_notes_with_score(url, notes, outcome="success", confidence=1.0, helpful=True)


def append_apply_playbook_notes_with_score(
    url: str,
    notes: Iterable[str],
    *,
    outcome: str,
    confidence: float,
    helpful: bool,
) -> bool:
    normalized = _normalize_notes(notes)
    if not normalized or not helpful:
        return False

    outcome_norm = str(outcome or "").strip().lower()
    confidence_norm = _clamp_confidence(confidence)
    if outcome_norm not in SUCCESS_OUTCOMES:
        return False
    if confidence_norm < MIN_CONFIDENCE_TO_WRITE:
        return False
    if len(normalized) < 3:
        return False

    now = datetime.now(timezone.utc)
    path = _playbook_path(url)
    timestamp = now.strftime("%Y-%m-%d %H:%M:%SZ")
    key = _site_key(url)

    if path.exists():
        try:
            existing_lines = path.read_text(encoding="utf-8").strip().splitlines()
        except Exception:
            existing_lines = [f"# Apply Playbook: {key}"]
    else:
        existing_lines = [f"# Apply Playbook: {key}", "", "Agent-learned navigation notes for assisted apply flows."]

    preamble, sessions = _parse_sessions(existing_lines)
    sessions.append(
        _PlaybookSession(
            timestamp_raw=timestamp,
            timestamp=now,
            outcome=outcome_norm,
            confidence=confidence_norm,
            notes=normalized[:MAX_NOTES_PER_SESSION],
        )
    )
    sessions = _prune_sessions(sessions, now=now)

    rendered = _render_playbook(key, preamble, sessions)
    if len(rendered.splitlines()) > MAX_PLAYBOOK_LINES:
        rendered = "\n".join(rendered.splitlines()[-MAX_PLAYBOOK_LINES:]).strip() + "\n"
        if not rendered.startswith("# Apply Playbook:"):
            rendered = f"# Apply Playbook: {key}\n\n{rendered}"

    path.write_text(rendered, encoding="utf-8")
    return True

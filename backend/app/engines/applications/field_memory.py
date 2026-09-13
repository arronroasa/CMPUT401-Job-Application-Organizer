from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MEMORY_DIR = Path(__file__).resolve().parents[3] / "data" / "apply_field_memory"
MAX_ENTRIES = 500


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_label_key(label: str) -> str:
    lowered = _normalize_text(label).lower()
    return re.sub(r"[^a-z0-9]+", "", lowered)


def _normalize_domain(domain: str) -> str:
    raw = _normalize_text(domain).lower()
    if raw.startswith("www."):
        raw = raw[4:]
    safe = "".join(ch for ch in raw if ch.isalnum() or ch in {"-", "."}).strip(".")
    return safe or "generic"


def _profile_key(profile_id: str) -> str:
    raw = _normalize_text(profile_id)
    safe = "".join(ch for ch in raw if ch.isalnum() or ch in {"-", "_"})
    return safe or "local"


def _path(profile_id: str) -> Path:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    return MEMORY_DIR / f"{_profile_key(profile_id)}.json"


def _load(profile_id: str) -> dict[str, Any]:
    path = _path(profile_id)
    if not path.exists():
        return {"entries": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("entries"), dict):
            return data
    except Exception:
        pass
    return {"entries": {}}


def _save(profile_id: str, data: dict[str, Any]) -> None:
    path = _path(profile_id)
    path.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")


def _is_safe_reusable_answer(label: str, value: str) -> bool:
    label_text = _normalize_text(label)
    value_text = _normalize_text(value)
    if not label_text or not value_text:
        return False
    if value_text.startswith("[REQUIRES_REVIEW:"):
        return False
    if len(value_text) > 140:
        return False
    if "\n" in value_text:
        return False
    if len(value_text.split()) > 20:
        return False
    return True


def _label_is_global(label: str) -> bool:
    lowered = _normalize_text(label).lower()
    return bool(
        re.search(
            r"\b(first name|last name|full name|email|phone|linkedin|github|portfolio|website|address|city|country|location|work authorization|authorized|sponsorship|visa)\b",
            lowered,
        )
    )


def recall_answers(
    profile_id: str,
    domain: str,
    labels: list[str],
) -> dict[str, str]:
    payload = _load(profile_id)
    entries = payload.get("entries") if isinstance(payload.get("entries"), dict) else {}
    if not isinstance(entries, dict):
        return {}

    domain_key = _normalize_domain(domain)
    resolved: dict[str, str] = {}
    for label in labels:
        label_key = _normalize_label_key(label)
        if not label_key:
            continue
        keys = [f"{domain_key}::{label_key}", f"global::{label_key}"]
        for key in keys:
            raw = entries.get(key)
            if not isinstance(raw, dict):
                continue
            value = _normalize_text(raw.get("value"))
            if not value:
                continue
            resolved[label] = value
            break
    return resolved


def remember_answers(
    profile_id: str,
    domain: str,
    answers: dict[str, str],
) -> int:
    if not answers:
        return 0

    payload = _load(profile_id)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        payload["entries"] = entries

    ts = datetime.now(timezone.utc).isoformat()
    domain_key = _normalize_domain(domain)
    wrote = 0

    for label, value in answers.items():
        label_text = _normalize_text(label)
        value_text = _normalize_text(value)
        if not _is_safe_reusable_answer(label_text, value_text):
            continue
        label_key = _normalize_label_key(label_text)
        if not label_key:
            continue

        targets = [f"{domain_key}::{label_key}"]
        if _label_is_global(label_text):
            targets.append(f"global::{label_key}")

        for memory_key in targets:
            previous = entries.get(memory_key)
            count = 1
            if isinstance(previous, dict):
                try:
                    count = int(previous.get("count", 0)) + 1
                except (TypeError, ValueError):
                    count = 1
            entries[memory_key] = {
                "label": label_text,
                "value": value_text,
                "updated_at": ts,
                "count": count,
            }
            wrote += 1

    if len(entries) > MAX_ENTRIES:
        # Keep most recently updated entries.
        sorted_items = sorted(
            entries.items(),
            key=lambda item: str(item[1].get("updated_at", "")) if isinstance(item[1], dict) else "",
            reverse=True,
        )
        entries = dict(sorted_items[:MAX_ENTRIES])
        payload["entries"] = entries

    if wrote > 0:
        _save(profile_id, payload)
    return wrote

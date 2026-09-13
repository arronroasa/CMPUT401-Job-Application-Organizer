import json
from pathlib import Path

_SYNONYMS_PATH = Path(__file__).resolve().parents[2] / "data" / "role_synonyms.json"


def _load_role_synonyms() -> dict[str, list[str]]:
    if not _SYNONYMS_PATH.exists():
        return {}
    with open(_SYNONYMS_PATH, encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        return {}
    synonyms: dict[str, list[str]] = {}
    for key, values in payload.items():
        if not isinstance(key, str):
            continue
        if not isinstance(values, list):
            continue
        synonyms[key.strip().lower()] = [str(value).strip() for value in values if str(value).strip()]
    return synonyms


ROLE_SYNONYMS = _load_role_synonyms()
DEFAULT_MODIFIERS = ["intern", "junior", "entry level"]


def _resolve_modifiers(role: str) -> list[str]:
    role_lower = role.lower()
    if "intern" in role_lower:
        return ["intern"]
    if "junior" in role_lower or "entry" in role_lower:
        return ["junior", "entry level"]
    if "senior" in role_lower or "staff" in role_lower:
        return []
    return DEFAULT_MODIFIERS


def generate_queries(role: str, location: str, remote: bool, max_queries: int = 12) -> list[str]:
    cleaned_role = role.strip()
    if not cleaned_role:
        return []

    cleaned_location = (location or "").strip() or "remote"
    synonyms = ROLE_SYNONYMS.get(cleaned_role.lower(), [])
    candidates = [cleaned_role, *synonyms]
    modifiers = _resolve_modifiers(cleaned_role)

    if remote and "remote" not in cleaned_location.lower():
        location_tokens = [cleaned_location, "remote"]
    else:
        location_tokens = [cleaned_location]

    ordered: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        base_queries: list[str] = [candidate]
        for location_token in location_tokens:
            base_queries.append(f"{candidate} {location_token}".strip())

        for base_query in base_queries:
            for modifier in ["", *modifiers]:
                query = f"{base_query} {modifier}".strip()
                normalized = " ".join(query.split()).lower()
                if normalized in seen:
                    continue
                seen.add(normalized)
                ordered.append(query)
                if len(ordered) >= max_queries:
                    return ordered
    return ordered

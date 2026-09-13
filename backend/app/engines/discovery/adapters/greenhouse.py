import asyncio
import json
import logging
import re
import time
from typing import Any
from urllib.request import Request, urlopen

from .base import JobSourceAdapter, RawJobData

logger = logging.getLogger(__name__)

_BOARD_TOKENS = [
    "airtable",
    "brex",
    "coinbase",
    "figma",
    "linear",
    "notion",
    "retool",
    "stripe",
    "vercel",
]
_CACHE_TTL_SECONDS = 300
_board_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _fetch_json(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "User-Agent": "Career-Co-Pilot/0.1 (+https://github.com/Sashreek007/Career-Co-Pilot)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=20) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def _tokenize(text: str) -> list[str]:
    return [piece for piece in re.split(r"[^a-z0-9]+", text.lower()) if piece]


def _matches_query(query: str, title: str, description: str, location: str) -> bool:
    text = f"{title} {description} {location}".lower()
    terms = [token for token in _tokenize(query) if token not in {"remote", "level", "entry"}]
    if not terms:
        return True
    return any(term in text for term in terms)


def _board_company_name(board_token: str) -> str:
    return board_token.replace("-", " ").title()


def _extract_jobs(payload: dict[str, Any], board_token: str, query: str) -> list[RawJobData]:
    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        return []

    parsed: list[RawJobData] = []
    for item in jobs:
        if not isinstance(item, dict):
            continue

        title = str(item.get("title") or "").strip()
        description = str(item.get("content") or "").strip()
        source_url = str(item.get("absolute_url") or "").strip()
        location_info = item.get("location")
        if isinstance(location_info, dict):
            location = str(location_info.get("name") or "Remote").strip()
        else:
            location = "Remote"

        if not (title and source_url):
            continue
        if not _matches_query(query, title, description, location):
            continue

        parsed.append(
            RawJobData(
                title=title,
                company=_board_company_name(board_token),
                location=location,
                description=description,
                source_url=source_url,
                source="greenhouse",
                posted_date=str(item.get("updated_at") or "").strip() or None,
            )
        )
    return parsed


class GreenhouseAdapter(JobSourceAdapter):
    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        now = time.time()
        results: list[RawJobData] = []

        for board_token in _BOARD_TOKENS:
            cache_hit = _board_cache.get(board_token)
            payload: dict[str, Any] | None = None

            if cache_hit and now - cache_hit[0] < _CACHE_TTL_SECONDS:
                payload = {"jobs": cache_hit[1]}
            else:
                endpoint = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true"
                try:
                    payload = await asyncio.to_thread(_fetch_json, endpoint)
                except Exception:
                    logger.debug("Greenhouse fetch failed for board=%s", board_token, exc_info=True)
                    payload = None
                if payload and isinstance(payload.get("jobs"), list):
                    _board_cache[board_token] = (now, payload["jobs"])
                await asyncio.sleep(0.2)

            if payload is None:
                continue

            results.extend(_extract_jobs(payload, board_token, query))
            if len(results) >= max_results:
                return results[:max_results]

        return results[:max_results]

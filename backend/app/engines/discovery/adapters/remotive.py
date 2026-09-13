import asyncio
import json
import logging
from typing import Any
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from .base import JobSourceAdapter, RawJobData

logger = logging.getLogger(__name__)


def _fetch_payload(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "User-Agent": "Career-Co-Pilot/0.1 (+https://github.com/Sashreek007/Career-Co-Pilot)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=20) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


class RemotiveAdapter(JobSourceAdapter):
    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        await asyncio.sleep(1)
        endpoint = (
            "https://remotive.com/api/remote-jobs"
            f"?search={quote_plus(query)}&limit={max_results}"
        )
        try:
            payload = await asyncio.to_thread(_fetch_payload, endpoint)
        except Exception:
            logger.exception("Remotive request failed for query=%s", query)
            return []

        jobs = payload.get("jobs")
        if not isinstance(jobs, list):
            return []

        parsed: list[RawJobData] = []
        for item in jobs:
            if not isinstance(item, dict):
                continue
            parsed.append(
                RawJobData(
                    title=str(item.get("title") or "").strip(),
                    company=str(item.get("company_name") or "").strip(),
                    location=str(item.get("candidate_required_location") or "Remote").strip(),
                    description=str(item.get("description") or "").strip(),
                    source_url=str(item.get("url") or "").strip(),
                    source="remotive",
                    posted_date=str(item.get("publication_date") or "").strip() or None,
                )
            )
        return [job for job in parsed if job.title and job.company and job.source_url]

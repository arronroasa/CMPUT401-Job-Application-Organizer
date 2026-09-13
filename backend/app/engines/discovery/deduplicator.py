from difflib import SequenceMatcher
from typing import Any


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def deduplicate_jobs(
    jobs: list[dict[str, Any]],
    existing_job_ids: set[str],
    existing_title_company: list[str] | None = None,
    threshold: float = 0.85,
) -> list[dict[str, Any]]:
    existing_pairs = [entry.strip().lower() for entry in (existing_title_company or []) if entry]
    accepted: list[dict[str, Any]] = []
    accepted_pairs: list[str] = []
    seen_ids: set[str] = set()

    for job in jobs:
        job_id = str(job.get("id") or "")
        if not job_id:
            continue
        if job_id in existing_job_ids or job_id in seen_ids:
            continue

        pair = f"{str(job.get('title') or '').strip()} {str(job.get('company') or '').strip()}".strip().lower()
        if pair:
            has_fuzzy_duplicate = any(_similarity(pair, candidate) > threshold for candidate in [*existing_pairs, *accepted_pairs])
            if has_fuzzy_duplicate:
                continue

        seen_ids.add(job_id)
        accepted.append(job)
        if pair:
            accepted_pairs.append(pair)
    return accepted

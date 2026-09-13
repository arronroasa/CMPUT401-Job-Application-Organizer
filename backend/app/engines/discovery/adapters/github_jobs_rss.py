from .base import JobSourceAdapter, RawJobData


class GitHubJobsRssAdapter(JobSourceAdapter):
    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        _ = query, max_results
        # TODO: implement RSS feed parsing
        return []

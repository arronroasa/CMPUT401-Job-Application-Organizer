from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class RawJobData:
    title: str
    company: str
    location: str
    description: str
    source_url: str
    source: str
    posted_date: Optional[str] = None


class JobSourceAdapter(ABC):
    @abstractmethod
    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        raise NotImplementedError

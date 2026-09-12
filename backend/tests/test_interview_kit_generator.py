import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.engines.interviews import kit_generator as kg


class _DummyResponse:
    def __init__(self, text: str):
        self.text = text


class _DummyClient:
    def __init__(self, text: str):
        self._text = text

    async def generate_content_async(self, _prompt: str):
        return _DummyResponse(self._text)


def test_company_and_question_fallback_shape_without_gemini(monkeypatch):
    monkeypatch.setattr(kg, "get_gemini_client", lambda: None)

    job = {
        "company": "Stripe",
        "title": "Backend Engineer",
        "description": "Build reliable APIs and backend services.",
    }
    profile = {}

    company_profile, question_bank = asyncio.run(
        kg._generate_company_research_and_questions("app-001", job, profile)
    )

    assert company_profile["company_name"] == "Stripe"
    assert company_profile["role_title"] == "Backend Engineer"
    assert isinstance(question_bank["behavioral_questions"], list)
    assert isinstance(question_bank["technical_questions"], list)
    assert isinstance(question_bank["company_questions"], list)
    assert len(question_bank["behavioral_questions"]) == 5
    assert len(question_bank["technical_questions"]) == 4
    assert len(question_bank["company_questions"]) == 2


def test_invalid_gemini_json_uses_fallback(monkeypatch):
    monkeypatch.setattr(kg, "get_gemini_client", lambda: _DummyClient("not valid json"))

    company_profile, question_bank = asyncio.run(
        kg._generate_company_research_and_questions(
            "app-002",
            {"company": "Acme", "title": "Platform Engineer", "description": "Build distributed systems."},
            {},
        )
    )

    assert "ownership" in company_profile["vision"].lower()
    assert len(question_bank["behavioral_questions"]) == 5
    assert len(question_bank["technical_questions"]) == 4
    assert len(question_bank["company_questions"]) == 2

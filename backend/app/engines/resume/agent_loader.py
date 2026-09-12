"""Agent Loader — reads the instruction markdown files from backend/app/agents/ once.

All resume generation code imports from here so the files are read once at
startup and cached as module-level constants.
"""

from pathlib import Path

_AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
_RESUME_ENGINE_DIR = Path(__file__).resolve().parent


def _read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


# Loaded once at import time — safe to use as module-level constants.
RULES_MD: str = _read(_AGENTS_DIR / "rules.md")
TAILORING_MD: str = _read(_AGENTS_DIR / "tailoring_strategy.md")
JAKES_RESUME_REFERENCE_TEX: str = _read(_RESUME_ENGINE_DIR / "jakes_resume_reference.tex")

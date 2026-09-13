"""Thin wrapper around the Google Generative AI SDK (Gemini)."""

import logging
import os
import sqlite3
from typing import Optional

from ..db.database import DB_PATH

logger = logging.getLogger(__name__)

_client = None  # module-level cache
_client_api_key: str | None = None
_client_model: str | None = None

MODEL_CANDIDATES = (
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
)


def _read_api_key_from_settings() -> str | None:
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT llm_provider, llm_api_key FROM settings WHERE id = 1"
        ).fetchone()
        if row is None:
            return None

        provider, key = row
        provider_value = str(provider or "").strip().lower()
        key_value = str(key or "").strip()
        if provider_value and provider_value != "gemini":
            return None
        return key_value or None
    except sqlite3.Error:
        return None
    finally:
        if conn is not None:
            conn.close()


def _resolve_api_key() -> str | None:
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    return _read_api_key_from_settings()


def get_gemini_client() -> Optional[object]:
    """Return a configured ``GenerativeModel('gemini-1.5-flash')`` instance.

    The API key is read from the ``GEMINI_API_KEY`` environment variable.
    If the key is not set the function logs a warning and returns ``None``.
    All callers **must** handle a ``None`` return gracefully (fall back to
    rule-based logic).
    """
    global _client, _client_api_key, _client_model  # noqa: PLW0603

    api_key = _resolve_api_key()
    if not api_key:
        _client = None
        _client_api_key = None
        _client_model = None
        logger.warning(
            "GEMINI_API_KEY is not set — Gemini features will be disabled. "
            "Set the key in your environment or in Settings."
        )
        return None

    forced_model = os.environ.get("GEMINI_MODEL", "").strip()
    if _client is not None and _client_api_key == api_key:
        if not forced_model and _client_model:
            return _client
        if forced_model and _client_model == forced_model:
            return _client

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        selected_model = forced_model or MODEL_CANDIDATES[0]

        if not forced_model:
            try:
                available: set[str] = set()
                for model in genai.list_models():
                    methods = getattr(model, "supported_generation_methods", []) or []
                    if "generateContent" not in methods:
                        continue
                    name = str(getattr(model, "name", "")).strip()
                    if not name:
                        continue
                    available.add(name.split("/", 1)[-1])
                for candidate in MODEL_CANDIDATES:
                    if candidate in available:
                        selected_model = candidate
                        break
                else:
                    if available:
                        selected_model = sorted(available)[0]
            except Exception:
                selected_model = MODEL_CANDIDATES[0]

        if _client is not None and _client_api_key == api_key and _client_model == selected_model:
            return _client

        _client = genai.GenerativeModel(selected_model)
        _client_api_key = api_key
        _client_model = selected_model
        logger.info("Gemini client initialised (model=%s)", selected_model)
        return _client
    except Exception:
        _client = None
        _client_api_key = None
        _client_model = None
        logger.exception("Failed to initialise Gemini client")
        return None

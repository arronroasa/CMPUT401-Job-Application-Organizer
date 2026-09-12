import json
import os
import platform
import socket
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

_STATE_DIR = Path(__file__).resolve().parents[2] / "data" / "browser_state"


def normalize_cdp_endpoint(endpoint: str) -> str:
    """
    Normalize a CDP endpoint and resolve docker host aliases to numeric IPs.

    Why:
    - Some Chrome builds reject non-local host headers (for example
      host.docker.internal) on /json/version, returning HTTP 500.
    - Rewriting to an IP avoids host-header validation issues.
    """
    raw = str(endpoint or "").strip()
    if not raw:
        return raw
    if "://" not in raw:
        raw = f"http://{raw}"

    parsed = urlparse(raw)
    host = parsed.hostname
    if not host:
        return raw.rstrip("/")

    resolved_host = host
    if host in {"host.docker.internal", "gateway.docker.internal"}:
        try:
            ip = socket.gethostbyname(host)
            if ip:
                resolved_host = ip
        except OSError:
            resolved_host = host

    if resolved_host == host:
        return raw.rstrip("/")

    port = parsed.port
    netloc = f"{resolved_host}:{port}" if port is not None else resolved_host
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth = f"{auth}:{parsed.password}"
        netloc = f"{auth}@{netloc}"

    rewritten = parsed._replace(netloc=netloc)
    return urlunparse(rewritten).rstrip("/")


def _state_file(key: str) -> Path:
    safe = "".join(ch for ch in key if ch.isalnum() or ch in {"-", "_"}).strip()
    if not safe:
        safe = "default"
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    return _STATE_DIR / f"{safe}.json"


def load_browser_storage_state(key: str = "visible_session") -> dict[str, Any]:
    path = _state_file(key)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def save_browser_storage_state(state: dict[str, Any], key: str = "visible_session") -> None:
    if not isinstance(state, dict):
        return
    path = _state_file(key)
    try:
        path.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        return


def get_chrome_user_profile_dir() -> str | None:
    """
    Return the path to the user's local Chrome profile directory so Playwright
    can launch with persistent context (saved logins, cookies, sessions).

    Resolution order:
    1. CHROME_USER_DATA_DIR env var (explicit override — always respected)
    2. Platform-specific default locations:
       - macOS:   ~/Library/Application Support/Google/Chrome
       - Linux:   ~/.config/google-chrome
       - Windows: %LOCALAPPDATA%/Google/Chrome/User Data

    Returns None if the directory cannot be found — callers fall back to
    cookie-injection mode (load_browser_storage_state).
    """
    # 1. Explicit override
    env_val = os.environ.get("CHROME_USER_DATA_DIR", "").strip()
    if env_val:
        p = Path(env_val).expanduser()
        if p.is_dir():
            return str(p)
        # Env var was set but path doesn't exist — warn and fall through
        return None

    # 2. Platform defaults
    system = platform.system()
    if system == "Darwin":
        candidate = Path.home() / "Library" / "Application Support" / "Google" / "Chrome"
    elif system == "Linux":
        candidate = Path.home() / ".config" / "google-chrome"
    elif system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if not local_app_data:
            return None
        candidate = Path(local_app_data) / "Google" / "Chrome" / "User Data"
    else:
        return None

    return str(candidate) if candidate.is_dir() else None


def get_chrome_executable_path() -> str | None:
    """
    Return the path to the Chrome/Chromium binary.

    Resolution order:
    1. CHROME_EXECUTABLE_PATH env var (explicit override)
    2. Common platform-specific install locations

    Returns None if not found — Playwright will use its bundled Chromium.
    """
    env_val = os.environ.get("CHROME_EXECUTABLE_PATH", "").strip()
    if env_val:
        p = Path(env_val).expanduser()
        if p.is_file():
            return str(p)
        return None

    system = platform.system()
    candidates: list[Path] = []

    if system == "Darwin":
        candidates = [
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        ]
    elif system == "Linux":
        candidates = [
            Path("/usr/bin/google-chrome"),
            Path("/usr/bin/google-chrome-stable"),
            Path("/usr/bin/chromium-browser"),
            Path("/usr/bin/chromium"),
            Path("/snap/bin/chromium"),
        ]
    elif system == "Windows":
        prog_files = os.environ.get("PROGRAMFILES", "C:\\Program Files")
        prog_files_x86 = os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)")
        candidates = [
            Path(prog_files) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(prog_files_x86) / "Google" / "Chrome" / "Application" / "chrome.exe",
        ]

    for c in candidates:
        if c.is_file():
            return str(c)
    return None

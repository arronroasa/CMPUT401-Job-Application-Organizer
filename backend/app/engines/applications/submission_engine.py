import asyncio
import json
import logging
import os
import random
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import urlparse

from playwright.async_api import async_playwright

from ...clients.gemini import get_gemini_client
from .apply_playbook import (
    append_apply_playbook_notes_with_score,
    load_apply_playbook_notes,
)
from .field_memory import recall_answers as recall_field_answers
from .field_memory import remember_answers as remember_field_answers
from ..browser_cdp import (
    get_chrome_executable_path,
    get_chrome_user_profile_dir,
    load_browser_storage_state,
    normalize_cdp_endpoint,
    save_browser_storage_state,
)

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path(__file__).resolve().parents[3] / "data" / "screenshots"
AI_AGENT_MAX_TURNS = 5
AI_AGENT_MAX_ACTIONS_PER_TURN = 6
AI_AGENT_MAX_CONTROLS = 120
PROGRESS_EVENT_LIMIT = 160
PROGRESS_SCREENSHOT_LIMIT = 40

PHASE_INIT = "init"
PHASE_NAVIGATE = "navigate"
PHASE_LINKEDIN_HANDOFF = "linkedin_handoff"
PHASE_WAITING_USER = "waiting_user"
PHASE_FILLING = "filling"
PHASE_AI_OPERATING = "ai_operating"
PHASE_REVIEW = "review"
PHASE_SUBMITTING = "submitting"
PHASE_COMPLETE = "complete"

USER_ACTION_NONE = "none"
USER_ACTION_LOGIN = "login_required"
USER_ACTION_ACCOUNT = "account_creation_required"
USER_ACTION_RESUME_AUTOFILL = "resume_autofill_recommended"
USER_ACTION_CLARIFICATION = "clarification_required"
USER_ACTION_FINAL_REVIEW = "final_review"

_PROGRESS_LOCK = Lock()
_SUBMISSION_PROGRESS: dict[str, dict[str, Any]] = {}
_OPERATOR_GUIDANCE: dict[str, str] = {}

# --- Chat message store ---
# Each draft has a list of {"role": "ai"|"user", "text": str, "at": ISO str}
_CHAT_MESSAGES: dict[str, list[dict[str, str]]] = {}
_CHAT_LOCK = Lock()
CHAT_MESSAGE_LIMIT = 200


def _chat_push_ai(draft_id: str, text: str) -> None:
    """Push an AI message into the chat thread for this draft."""
    normalized = _normalize_space(text)
    if not normalized:
        return
    with _CHAT_LOCK:
        msgs = _CHAT_MESSAGES.setdefault(draft_id, [])
        msgs.append({"role": "ai", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > CHAT_MESSAGE_LIMIT:
            del msgs[: len(msgs) - CHAT_MESSAGE_LIMIT]


def get_chat_messages(draft_id: str) -> list[dict[str, str]]:
    """Return the full chat thread for this draft (safe copy)."""
    with _CHAT_LOCK:
        return list(_CHAT_MESSAGES.get(draft_id, []))


def post_user_chat_message(draft_id: str, text: str) -> str:
    """
    Append a user message to the chat thread and apply it as operator guidance.
    Returns the normalized text.
    """
    normalized = _normalize_space(text)[:1200]
    if not normalized:
        return ""
    with _CHAT_LOCK:
        msgs = _CHAT_MESSAGES.setdefault(draft_id, [])
        msgs.append({"role": "user", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > CHAT_MESSAGE_LIMIT:
            del msgs[: len(msgs) - CHAT_MESSAGE_LIMIT]
    # Also feed it into the operator guidance so the running agent picks it up
    set_submission_guidance(draft_id, normalized)
    return normalized


def clear_chat_messages(draft_id: str) -> None:
    with _CHAT_LOCK:
        _CHAT_MESSAGES.pop(draft_id, None)


class RateLimitError(ValueError):
    """Raised when daily submission cap is reached."""


class BrowserUnavailableError(RuntimeError):
    """Raised when Playwright browser runtime is unavailable."""


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat()


def _progress_start(draft_id: str, *, mode: str) -> None:
    clear_chat_messages(draft_id)
    with _PROGRESS_LOCK:
        _SUBMISSION_PROGRESS[draft_id] = {
            "draft_id": draft_id,
            "status": "running",
            "mode": mode,
            "phase": PHASE_INIT,
            "waiting_for_user": False,
            "required_user_action": None,
            "required_user_action_detail": None,
            "started_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
            "latest_screenshot_path": None,
            "snapshots": [],
            "events": [],
            "error": None,
        }
    _chat_push_ai(draft_id, f"Starting AI-assisted application ({mode} mode). I'll let you know when I need input.")


def _progress_event(draft_id: str, message: str, *, level: str = "info") -> None:
    text = _normalize_space(message)
    if not text:
        return
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            state = {
                "draft_id": draft_id,
                "status": "running",
                "mode": "unknown",
                "phase": PHASE_INIT,
                "waiting_for_user": False,
                "required_user_action": None,
                "required_user_action_detail": None,
                "started_at": _utc_now_iso(),
                "updated_at": _utc_now_iso(),
                "latest_screenshot_path": None,
                "snapshots": [],
                "events": [],
                "error": None,
            }
            _SUBMISSION_PROGRESS[draft_id] = state

        events = state.get("events", [])
        if not isinstance(events, list):
            events = []
            state["events"] = events
        events.append({"at": _utc_now_iso(), "level": level, "message": text})
        if len(events) > PROGRESS_EVENT_LIMIT:
            del events[: len(events) - PROGRESS_EVENT_LIMIT]
        state["updated_at"] = _utc_now_iso()


def _progress_snapshot(draft_id: str, screenshot_path: str | None) -> None:
    if not screenshot_path:
        return
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["latest_screenshot_path"] = screenshot_path
        snapshots = state.get("snapshots")
        if not isinstance(snapshots, list):
            snapshots = []
            state["snapshots"] = snapshots
        snapshots.append({"at": _utc_now_iso(), "path": screenshot_path})
        if len(snapshots) > PROGRESS_SCREENSHOT_LIMIT:
            del snapshots[: len(snapshots) - PROGRESS_SCREENSHOT_LIMIT]
        state["updated_at"] = _utc_now_iso()


def _progress_mode(draft_id: str, mode: str) -> None:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["mode"] = mode
        state["updated_at"] = _utc_now_iso()


def _progress_phase(draft_id: str, phase: str) -> None:
    normalized = _normalize_space(phase).lower() or PHASE_INIT
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["phase"] = normalized
        state["updated_at"] = _utc_now_iso()


def _progress_require_user_action(draft_id: str, action: str, detail: str) -> None:
    normalized_action = _normalize_space(action).lower() or USER_ACTION_NONE
    normalized_detail = _normalize_space(detail)
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["waiting_for_user"] = normalized_action != USER_ACTION_NONE
        state["required_user_action"] = None if normalized_action == USER_ACTION_NONE else normalized_action
        state["required_user_action_detail"] = normalized_detail or None
        state["updated_at"] = _utc_now_iso()


def _progress_clear_user_action(draft_id: str) -> None:
    _progress_require_user_action(draft_id, USER_ACTION_NONE, "")


def _progress_finish(draft_id: str, *, status: str, error: str | None = None) -> None:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            state = {
                "draft_id": draft_id,
                "started_at": _utc_now_iso(),
                "mode": "unknown",
                "phase": PHASE_INIT,
                "waiting_for_user": False,
                "required_user_action": None,
                "required_user_action_detail": None,
                "snapshots": [],
                "events": [],
            }
            _SUBMISSION_PROGRESS[draft_id] = state
        state["status"] = status
        if status == "submitted":
            state["phase"] = PHASE_COMPLETE
            state["waiting_for_user"] = False
            state["required_user_action"] = None
            state["required_user_action_detail"] = None
        elif status == "ready_for_final_approval":
            state["phase"] = PHASE_REVIEW
            state["waiting_for_user"] = True
            if not state.get("required_user_action"):
                state["required_user_action"] = USER_ACTION_FINAL_REVIEW
            if not state.get("required_user_action_detail"):
                state["required_user_action_detail"] = "Review and submit when ready."
        else:
            state["phase"] = state.get("phase", PHASE_INIT)
            state["waiting_for_user"] = False
            state["required_user_action"] = None
            state["required_user_action_detail"] = None
        state["error"] = _normalize_space(error) if error else None
        state["updated_at"] = _utc_now_iso()


def get_submission_progress(draft_id: str) -> dict[str, Any]:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return {
                "draft_id": draft_id,
                "status": "idle",
                "mode": "none",
                "phase": PHASE_INIT,
                "waiting_for_user": False,
                "required_user_action": None,
                "required_user_action_detail": None,
                "started_at": None,
                "updated_at": _utc_now_iso(),
                "latest_screenshot_path": None,
                "snapshots": [],
                "events": [],
                "error": None,
            }
        events = state.get("events", [])
        snapshots = state.get("snapshots", [])
        safe_events = [dict(item) for item in events] if isinstance(events, list) else []
        safe_snapshots = [dict(item) for item in snapshots] if isinstance(snapshots, list) else []
        return {
            "draft_id": state.get("draft_id", draft_id),
            "status": state.get("status", "running"),
            "mode": state.get("mode", "unknown"),
            "phase": state.get("phase", PHASE_INIT),
            "waiting_for_user": bool(state.get("waiting_for_user", False)),
            "required_user_action": state.get("required_user_action"),
            "required_user_action_detail": state.get("required_user_action_detail"),
            "started_at": state.get("started_at"),
            "updated_at": state.get("updated_at", _utc_now_iso()),
            "latest_screenshot_path": state.get("latest_screenshot_path"),
            "snapshots": safe_snapshots,
            "events": safe_events,
            "error": state.get("error"),
        }


def set_submission_guidance(draft_id: str, guidance: str) -> str:
    normalized = _normalize_space(guidance)[:1200]
    with _PROGRESS_LOCK:
        _OPERATOR_GUIDANCE[draft_id] = normalized
    if normalized:
        _progress_event(draft_id, f"Operator guidance updated: {normalized[:220]}")
    else:
        _progress_event(draft_id, "Operator guidance cleared.")
    return normalized


def get_submission_guidance(draft_id: str) -> str:
    with _PROGRESS_LOCK:
        return _OPERATOR_GUIDANCE.get(draft_id, "")


def _parse_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_json_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_label_text(value: Any) -> str:
    text = _normalize_space(value)
    text = text.replace("*", " ")
    text = re.sub(r"\s+", " ", text).strip(" :.-")
    return text


def _label_variants(label: str) -> list[str]:
    base = _normalize_label_text(label)
    if not base:
        return []
    variants = [base]
    no_parens = re.sub(r"\([^)]*\)", " ", base)
    no_parens = re.sub(r"\s+", " ", no_parens).strip(" :.-")
    if no_parens and no_parens.lower() != base.lower():
        variants.append(no_parens)
    no_question = re.sub(r"\?$", "", base).strip(" :.-")
    if no_question and no_question.lower() not in {item.lower() for item in variants}:
        variants.append(no_question)
    words = base.split()
    if len(words) > 2:
        short = " ".join(words[:2]).strip()
        if short and short.lower() not in {item.lower() for item in variants}:
            variants.append(short)
    return variants


async def _locate_field_control(page, label: str):
    for variant in _label_variants(label):
        try:
            locator = page.get_by_label(variant, exact=False).first
            if await locator.count() > 0:
                return locator
        except Exception:
            continue
    for variant in _label_variants(label):
        try:
            locator = page.get_by_placeholder(variant, exact=False).first
            if await locator.count() > 0:
                return locator
        except Exception:
            continue
    return None


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(value, maximum))


def _submission_page_timeout_seconds() -> int:
    return _int_env("APPLICATION_PAGE_TIMEOUT_SECONDS", default=45, minimum=10, maximum=180)


def _ai_planning_timeout_seconds() -> int:
    return _int_env("APPLICATION_AI_PLANNING_TIMEOUT_SECONDS", default=12, minimum=3, maximum=45)


def _action_timeout_ms() -> int:
    return _int_env("APPLICATION_ACTION_TIMEOUT_MS", default=1500, minimum=250, maximum=10000)


def _user_action_wait_timeout_seconds() -> int:
    return _int_env("APPLICATION_USER_ACTION_WAIT_SECONDS", default=240, minimum=20, maximum=900)


def _resume_autofill_wait_seconds() -> int:
    return _int_env("APPLICATION_RESUME_AUTOFILL_WAIT_SECONDS", default=60, minimum=15, maximum=300)


def _strip_code_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text.strip()


async def _run_hook(hook: Any, *args: Any) -> None:
    if hook is None:
        return
    try:
        result = hook(*args)
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        logger.debug("Progress hook failed", exc_info=True)


def _summarize_answer_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        if "resume_file_path" in value:
            return "[FILE_PATH]"
        return "[OBJECT]"
    return _normalize_space(value)


def _describe_ai_action(action: dict[str, Any]) -> str:
    action_type = _normalize_space(action.get("type")).lower()
    if action_type == "fill":
        return f"Fill '{_normalize_space(action.get('label'))}'"
    if action_type == "select":
        return f"Select '{_normalize_space(action.get('value'))}' for '{_normalize_space(action.get('label'))}'"
    if action_type == "check":
        return f"Check '{_normalize_space(action.get('label'))}'"
    if action_type == "uncheck":
        return f"Uncheck '{_normalize_space(action.get('label'))}'"
    if action_type == "click_button":
        return f"Click button '{_normalize_space(action.get('button_text'))}'"
    if action_type == "wait":
        return f"Wait {int(action.get('milliseconds') or 0)}ms"
    return "Run AI action"


def _build_answer_targets(form_fields: list[dict[str, Any]], answers: dict[str, Any]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for field in form_fields:
        label = _normalize_label_text(field.get("label"))
        if not label:
            continue
        value = answers.get(_normalize_space(field.get("label")))
        if value is None:
            matched = _match_field_label(list(answers.keys()), label)
            if matched:
                value = answers.get(matched)
        if value is None:
            continue
        if isinstance(value, str) and value.startswith("[REQUIRES_REVIEW:"):
            continue

        field_type = _normalize_space(field.get("type")).lower() or "text"
        if field_type == "file":
            continue
        targets.append(
            {
                "label": label,
                "type": field_type,
                "value": _summarize_answer_value(value),
            }
        )
    return targets


async def _snapshot_form_controls(page) -> list[dict[str, Any]]:
    try:
        controls = await page.evaluate(
            """
            () => {
              const rows = [];
              const nodes = Array.from(document.querySelectorAll('input, textarea, select, button, [role="button"], a'));
              for (const el of nodes) {
                const tag = (el.tagName || '').toLowerCase();
                const type = (el.getAttribute('type') || '').toLowerCase();
                if (tag === 'input' && ['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;

                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;

                const id = el.getAttribute('id');
                let label = '';
                if (id) {
                  const bound = document.querySelector(`label[for="${id}"]`);
                  if (bound) label = bound.textContent || '';
                }
                if (!label) {
                  const parentLabel = el.closest('label');
                  if (parentLabel) label = parentLabel.textContent || '';
                }
                if (!label) {
                  label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
                }

                const text = tag === 'button' || el.getAttribute('role') === 'button'
                  ? (el.textContent || '')
                  : (tag === 'a' ? (el.textContent || '') : '');
                const href = tag === 'a' ? (el.getAttribute('href') || '') : '';

                rows.push({
                  tag,
                  type,
                  label: (label || '').replace(/\\s+/g, ' ').trim(),
                  text: (text || '').replace(/\\s+/g, ' ').trim(),
                  href: (href || '').replace(/\\s+/g, ' ').trim(),
                  required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
                });
                if (rows.length >= 150) break;
              }
              return rows;
            }
            """
        )
        if isinstance(controls, list):
            return [item for item in controls if isinstance(item, dict)][:AI_AGENT_MAX_CONTROLS]
        return []
    except Exception:
        logger.debug("Failed to snapshot form controls for AI agent", exc_info=True)
        return []


def _sanitize_ai_actions(raw_payload: Any) -> list[dict[str, Any]]:
    if isinstance(raw_payload, dict):
        raw_actions = raw_payload.get("actions")
    elif isinstance(raw_payload, list):
        raw_actions = raw_payload
    else:
        raw_actions = []

    if not isinstance(raw_actions, list):
        return []

    allowed = {"fill", "select", "check", "uncheck", "click_button", "click_link", "wait"}
    actions: list[dict[str, Any]] = []
    for item in raw_actions:
        if not isinstance(item, dict):
            continue
        action_type = _normalize_space(item.get("type")).lower()
        if action_type not in allowed:
            continue

        action: dict[str, Any] = {"type": action_type}
        if action_type == "click_button":
            button_text = _normalize_space(item.get("button_text") or item.get("text"))
            if not button_text:
                continue
            action["button_text"] = button_text
        elif action_type == "click_link":
            text = _normalize_space(item.get("text"))
            href = _normalize_space(item.get("href"))
            if not text and not href:
                continue
            if text:
                action["text"] = text
            if href:
                action["href"] = href
        elif action_type == "wait":
            try:
                ms = int(item.get("milliseconds", 900))
            except (TypeError, ValueError):
                ms = 900
            action["milliseconds"] = max(200, min(ms, 5000))
        else:
            label = _normalize_space(item.get("label"))
            if not label:
                continue
            action["label"] = label
            if action_type in {"fill", "select"}:
                action["value"] = _summarize_answer_value(item.get("value"))
        actions.append(action)
        if len(actions) >= AI_AGENT_MAX_ACTIONS_PER_TURN:
            break
    return actions


async def _plan_ai_actions(
    client: Any,
    page,
    *,
    job: dict[str, Any],
    answer_targets: list[dict[str, str]],
    turn: int,
    allow_submit_click: bool,
    operator_guidance: str = "",
    site_playbook_notes: str = "",
) -> list[dict[str, Any]]:
    controls = await _snapshot_form_controls(page)
    if not controls:
        return []

    prompt = (
        "You are an assistant controlling a job-application form in user-assisted mode.\n"
        "Choose the next browser actions as JSON only.\n"
        "Output format: {\"actions\":[...]}.\n"
        "Allowed action types: fill, select, check, uncheck, click_button, click_link, wait.\n"
        "Rules:\n"
        "- Prefer filling known answers by matching labels.\n"
        "- Use click_button or click_link for navigation only (Next, Continue, Review, Apply).\n"
        "- Use profile/resume context first; if missing, use best-effort safe defaults for required fields.\n"
        "- You may operate login/account/application steps when visible controls are available.\n"
        "- If operator guidance is provided, follow it when possible.\n"
        "- Use site playbook notes if available.\n"
        "- Keep actions concise and practical.\n"
        f"- Final submit clicks allowed: {str(allow_submit_click).lower()}.\n\n"
        f"Job context: {json.dumps({'title': job.get('title'), 'company': job.get('company')})}\n"
        f"Operator guidance: {json.dumps(operator_guidance or '')}\n"
        f"Site playbook notes: {json.dumps(site_playbook_notes or '')}\n"
        f"Known answers: {json.dumps(answer_targets)}\n"
        f"Visible controls (turn {turn}): {json.dumps(controls)}\n"
    )

    try:
        response = await asyncio.wait_for(
            client.generate_content_async(prompt),
            timeout=_ai_planning_timeout_seconds(),
        )
        raw = _strip_code_fences(_normalize_space(response.text))
        if not raw:
            return []
        parsed = json.loads(raw)
        return _sanitize_ai_actions(parsed)
    except Exception:
        logger.debug("AI planning step failed", exc_info=True)
        return []


async def _execute_ai_action(page, action: dict[str, Any], *, allow_submit_click: bool) -> bool:
    action_type = str(action.get("type") or "").strip().lower()
    try:
        if action_type == "wait":
            ms = int(action.get("milliseconds", 900))
            await page.wait_for_timeout(max(200, min(ms, 5000)))
            return True

        if action_type == "click_button":
            button_text = _normalize_space(action.get("button_text"))
            if not button_text:
                return False

            locator = page.get_by_role("button", name=re.compile(re.escape(button_text), re.IGNORECASE)).first
            if await locator.count() == 0:
                locator = page.get_by_text(button_text, exact=False).first
            if await locator.count() == 0:
                return False
            await locator.scroll_into_view_if_needed()
            await locator.click()
            return True

        if action_type == "click_link":
            link_text = _normalize_space(action.get("text"))
            link_href = _normalize_space(action.get("href"))
            if not link_text and not link_href:
                return False
            locator = None
            if link_href:
                locator = page.locator(f'a[href*="{link_href}"]').first
                if await locator.count() == 0:
                    locator = None
            if locator is None and link_text:
                locator = page.get_by_role("link", name=re.compile(re.escape(link_text), re.IGNORECASE)).first
                if await locator.count() == 0:
                    locator = page.get_by_text(link_text, exact=False).first
            if locator is None or await locator.count() == 0:
                return False
            await locator.scroll_into_view_if_needed()
            await locator.click()
            return True

        label = _normalize_label_text(action.get("label"))
        if not label:
            return False
        locator = await _locate_field_control(page, label)
        if locator is None:
            return False

        await locator.scroll_into_view_if_needed()

        if action_type == "fill":
            await locator.fill(str(action.get("value") or ""))
            return True
        if action_type == "select":
            value = str(action.get("value") or "").strip()
            if not value:
                return False
            try:
                await locator.select_option(label=value)
            except Exception:
                await locator.select_option(value=value)
            return True
        if action_type == "check":
            await locator.check()
            return True
        if action_type == "uncheck":
            await locator.uncheck()
            return True
    except Exception:
        logger.debug("AI action execution failed: %s", action, exc_info=True)
        return False
    return False


async def _run_ai_assisted_fill(
    page,
    *,
    job: dict[str, Any],
    form_fields: list[dict[str, Any]],
    answers: dict[str, Any],
    allow_submit_click: bool = False,
    on_event: Any = None,
    on_action_executed: Any = None,
    guidance_provider: Any = None,
    site_playbook_notes: str = "",
) -> None:
    client = get_gemini_client()
    if client is None:
        await _run_hook(on_event, "Gemini client unavailable; skipping AI-assisted step.")
        return

    answer_targets = _build_answer_targets(form_fields, answers)
    if not answer_targets:
        await _run_hook(
            on_event,
            "No known draft answers found for direct fill; running navigation-only AI actions.",
        )

    logger.info("Running AI-assisted apply operator for %s @ %s", job.get("title"), job.get("company"))
    await _run_hook(on_event, "AI operator started.")
    seen_actions: set[str] = set()

    for turn in range(1, AI_AGENT_MAX_TURNS + 1):
        operator_guidance = ""
        if guidance_provider is not None:
            try:
                operator_guidance = _normalize_space(guidance_provider())
            except Exception:
                operator_guidance = ""
        actions = await _plan_ai_actions(
            client,
            page,
            job=job,
            answer_targets=answer_targets,
            turn=turn,
            allow_submit_click=allow_submit_click,
            operator_guidance=operator_guidance,
            site_playbook_notes=site_playbook_notes,
        )
        if not actions:
            await _run_hook(on_event, f"AI operator stopped: no actions planned on turn {turn}.")
            return

        await _run_hook(on_event, f"AI planned {len(actions)} actions on turn {turn}.")
        executed = 0
        for action in actions:
            signature = json.dumps(action, sort_keys=True)
            if signature in seen_actions:
                continue
            seen_actions.add(signature)

            await _run_hook(on_event, f"AI step: {_describe_ai_action(action)}")
            ok = await _execute_ai_action(page, action, allow_submit_click=allow_submit_click)
            if ok:
                executed += 1
                await _run_hook(on_action_executed, action)
                await asyncio.sleep(random.uniform(0.2, 0.8))

        if executed == 0:
            await _run_hook(on_event, f"AI operator paused: all planned actions were skipped on turn {turn}.")
            return
    await _run_hook(on_event, "AI operator finished planned turns.")

def _load_draft_and_job(draft_id: str, db_conn: sqlite3.Connection) -> tuple[dict[str, Any], dict[str, Any]]:
    row = db_conn.execute(
        """
        SELECT
            a.*,
            j.id AS job_id_joined,
            j.source_url AS job_source_url,
            j.title AS job_title,
            j.company AS job_company,
            j.location AS job_location
        FROM application_drafts a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.id = ?
        """,
        (draft_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Application draft not found")

    draft = dict(row)
    job = {
        "id": draft.get("job_id_joined"),
        "source_url": draft.get("job_source_url"),
        "title": draft.get("job_title"),
        "company": draft.get("job_company"),
        "location": draft.get("job_location"),
    }
    return draft, job


def _get_daily_cap(db_conn: sqlite3.Connection) -> int:
    row = db_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
    ).fetchone()
    if row is None:
        return 10

    try:
        candidate = db_conn.execute("SELECT daily_submission_cap FROM settings LIMIT 1").fetchone()
    except sqlite3.Error:
        return 10
    if not candidate:
        return 10
    try:
        value = int(candidate[0])
    except (TypeError, ValueError):
        return 10
    return value if value > 0 else 10


def _assert_daily_cap(db_conn: sqlite3.Connection) -> None:
    daily_cap = _get_daily_cap(db_conn)
    count = db_conn.execute(
        """
        SELECT COUNT(*) FROM application_drafts
        WHERE submitted_at IS NOT NULL
          AND date(submitted_at) = date('now')
        """
    ).fetchone()[0]
    if int(count or 0) >= daily_cap:
        raise RateLimitError(f"Daily submission cap reached ({daily_cap})")


def _assert_can_submit(draft: dict[str, Any]) -> None:
    if draft.get("status") != "approved":
        raise ValueError("Draft must be approved before submission")


def _resolve_active_profile_id(db_conn: sqlite3.Connection) -> str:
    try:
        row = db_conn.execute("SELECT active_profile_id FROM settings WHERE id = 1").fetchone()
        candidate = str(row[0] or "").strip() if row is not None else ""
    except sqlite3.Error:
        candidate = ""
    return candidate or "local"


def _should_launch_headless() -> bool:
    value = os.environ.get("APPLICATION_BROWSER_HEADLESS", "").strip().lower()
    if value in {"1", "true", "yes"}:
        return True
    if value in {"0", "false", "no"}:
        return False
    return not bool(os.environ.get("DISPLAY", "").strip())


def _cdp_endpoint() -> str:
    value = os.environ.get("APPLICATION_CDP_ENDPOINT", "").strip()
    if value:
        return normalize_cdp_endpoint(value)
    return normalize_cdp_endpoint("http://host.docker.internal:9222")


def _normalize_manual_pause_seconds(value: int | None) -> int:
    try:
        seconds = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, min(seconds, 300))


def _split_full_name(value: Any) -> tuple[str, str]:
    full = _normalize_space(value)
    if not full:
        return "", ""
    parts = full.split(" ")
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _infer_country_from_text(value: Any) -> str:
    lowered = _normalize_space(value).lower()
    if not lowered:
        return ""
    canada_hints = {"canada", "alberta", "ontario", "quebec", "british columbia", "toronto", "vancouver", "edmonton", "calgary", "ottawa", "montreal"}
    if any(hint in lowered for hint in canada_hints):
        return "Canada"
    if "india" in lowered:
        return "India"
    if "united states" in lowered or " usa" in lowered or ", usa" in lowered:
        return "United States"
    if "united kingdom" in lowered or " uk" in lowered:
        return "United Kingdom"
    return ""


def _extract_postal_code(value: Any) -> str:
    text = _normalize_space(value)
    if not text:
        return ""
    canada = re.search(r"\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b", text, re.IGNORECASE)
    if canada:
        return _normalize_space(canada.group(0)).upper()
    usa = re.search(r"\b\d{5}(?:-\d{4})?\b", text)
    if usa:
        return _normalize_space(usa.group(0))
    return ""


def _infer_phone_code(country: str, phone: str) -> str:
    phone_text = _normalize_space(phone)
    if phone_text.startswith("+"):
        match = re.match(r"^\+(\d{1,3})", phone_text)
        if match:
            return f"+{match.group(1)}"
    lowered = _normalize_space(country).lower()
    if lowered == "canada" or lowered == "united states":
        return "+1"
    if lowered == "india":
        return "+91"
    if lowered == "united kingdom":
        return "+44"
    return ""


def _extract_city(value: Any) -> str:
    location = _normalize_space(value)
    if not location:
        return ""
    return _normalize_space(location.split(",", 1)[0])


def _safe_json_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except json.JSONDecodeError:
            return []
    return []


def _format_month_year(value: str) -> str:
    cleaned = _normalize_space(value)
    match = re.match(r"^(\d{4})-(\d{2})", cleaned)
    if not match:
        return cleaned
    year = match.group(1)
    month_num = int(match.group(2))
    month_map = {
        1: "January",
        2: "February",
        3: "March",
        4: "April",
        5: "May",
        6: "June",
        7: "July",
        8: "August",
        9: "September",
        10: "October",
        11: "November",
        12: "December",
    }
    month = month_map.get(month_num)
    if not month:
        return cleaned
    return f"{month} {year}"


def _expected_graduation_text(profile_row: dict[str, Any]) -> str:
    education = _safe_json_list(profile_row.get("education_json"))
    candidates: list[str] = []
    for item in education:
        end_date = _normalize_space(item.get("endDate") or item.get("end_date"))
        if end_date:
            candidates.append(end_date)
    if not candidates:
        parsed = _parse_json_obj(profile_row.get("resume_parsed_json"))
        parsed_education = parsed.get("education")
        for item in _safe_json_list(parsed_education):
            end_date = _normalize_space(item.get("endDate") or item.get("end_date"))
            if end_date:
                candidates.append(end_date)
    if not candidates:
        return ""
    latest = sorted(candidates)[-1]
    return _format_month_year(latest)


def _extract_gpa_percentage(profile_row: dict[str, Any]) -> str:
    resume_text = _normalize_space(profile_row.get("resume_text"))
    parsed = _parse_json_obj(profile_row.get("resume_parsed_json"))
    parsed_text = _normalize_space(parsed.get("raw_text"))
    blob = f"{resume_text}\n{parsed_text}".strip()
    if not blob:
        return ""

    direct_pct = re.search(r"\bgpa[^\n]{0,40}?(\d{2,3}(?:\.\d+)?)\s*%\b", blob, re.IGNORECASE)
    if direct_pct:
        return str(int(float(direct_pct.group(1))))

    ratio = re.search(r"\bgpa[^\n]{0,40}?(\d(?:\.\d+)?)\s*/\s*4(?:\.0+)?\b", blob, re.IGNORECASE)
    if ratio:
        raw = float(ratio.group(1))
        pct = int(round((raw / 4.0) * 100))
        return str(max(0, min(100, pct)))
    return ""


def _infer_current_study_year(profile_row: dict[str, Any]) -> str:
    education = _safe_json_list(profile_row.get("education_json"))
    parsed = _parse_json_obj(profile_row.get("resume_parsed_json"))
    if not education:
        education = _safe_json_list(parsed.get("education"))
    if not education:
        return ""

    latest = education[-1]
    start_date = _normalize_space(latest.get("startDate") or latest.get("start_date"))
    if not start_date:
        return ""
    match = re.match(r"^(\d{4})-(\d{2})", start_date)
    if not match:
        return ""
    start_year = int(match.group(1))
    start_month = int(match.group(2))
    now = datetime.utcnow()
    months = (now.year - start_year) * 12 + (now.month - start_month)
    if months < 0:
        return "1"
    # Clamp to common undergrad span to avoid absurd values for old profiles.
    year_num = max(1, min(6, (months // 12) + 1))
    return str(year_num)


def _infer_education_level(profile_row: dict[str, Any]) -> str:
    education = _safe_json_list(profile_row.get("education_json"))
    parsed = _parse_json_obj(profile_row.get("resume_parsed_json"))
    if not education:
        education = _safe_json_list(parsed.get("education"))
    if not education:
        return ""

    latest = education[-1]
    degree = _normalize_space(latest.get("degree") or latest.get("degreeName")).lower()
    end_date = _normalize_space(latest.get("endDate") or latest.get("end_date"))
    is_future = False
    match = re.match(r"^(\d{4})-(\d{2})", end_date)
    if match:
        end_year = int(match.group(1))
        end_month = int(match.group(2))
        now = datetime.utcnow()
        is_future = (end_year, end_month) >= (now.year, now.month)

    if "high school" in degree:
        return "High school"
    if "associate" in degree:
        return "Pursuing Associates" if is_future else "Associates"
    if "bachelor" in degree or "b.sc" in degree or "btech" in degree:
        return "Pursuing Bachelors" if is_future else "New Grad (Bachelors)"
    if "master" in degree or "m.sc" in degree or "mba" in degree or "phd" in degree or "doctor" in degree:
        return "Pursuing Masters / Doctorate" if is_future else "New Grad (Masters)"
    return ""


def _load_profile_row(db_conn: sqlite3.Connection, profile_id: str) -> dict[str, Any]:
    row = db_conn.execute("SELECT * FROM user_profile WHERE id = ?", (profile_id,)).fetchone()
    if row is None and profile_id != "local":
        row = db_conn.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    return dict(row) if row is not None else {}


def _derive_runtime_hints(profile_row: dict[str, Any], job: dict[str, Any]) -> dict[str, str]:
    name = _normalize_space(profile_row.get("name"))
    first_name, last_name = _split_full_name(name)
    resume_parsed = _parse_json_obj(profile_row.get("resume_parsed_json"))
    location = _normalize_space(profile_row.get("location") or resume_parsed.get("location"))
    resume_text = _normalize_space(profile_row.get("resume_text"))
    country = _infer_country_from_text(location)
    job_country = _infer_country_from_text(job.get("location"))
    phone_value = _normalize_space(profile_row.get("phone") or resume_parsed.get("phone"))
    work_auth = ""
    sponsorship = ""
    if country and job_country and country.lower() == job_country.lower():
        work_auth = "Yes"
        sponsorship = "No"

    gpa_percentage = _extract_gpa_percentage(profile_row)
    study_year = _infer_current_study_year(profile_row)

    return {
        "full_name": name,
        "first_name": first_name,
        "last_name": last_name,
        "email": _normalize_space(profile_row.get("email") or resume_parsed.get("email")),
        "phone": phone_value,
        "location": location,
        "city": _extract_city(location),
        "country": country,
        "address_line_1": location,
        "postal_code": _extract_postal_code(f"{location} {resume_text}"),
        "country_phone_code": _infer_phone_code(country, phone_value),
        "linkedin": _normalize_space(profile_row.get("linkedin_url") or resume_parsed.get("linkedin_url")),
        "github": _normalize_space(profile_row.get("github_url") or resume_parsed.get("github_url")),
        "portfolio": _normalize_space(profile_row.get("portfolio_url")),
        "work_auth": work_auth,
        "sponsorship": sponsorship,
        "graduation": _expected_graduation_text(profile_row),
        "education_level": _infer_education_level(profile_row),
        "current_study_year": study_year,
        "gpa_percentage": gpa_percentage,
        "summary": _normalize_space(profile_row.get("summary") or resume_parsed.get("summary")),
        "resume_text": resume_text,
        "resume_file_path": _normalize_space(profile_row.get("resume_file_path")),
    }


def _should_generate_essay(label: str) -> bool:
    lowered = _normalize_label_text(label).lower()
    return bool(
        "?" in lowered
        or any(token in lowered for token in ("why", "describe", "tell us", "what part", "how did", "explain"))
    )


def _generate_runtime_essay_answer(
    *,
    label: str,
    job: dict[str, Any],
    hints: dict[str, str],
) -> str | None:
    client = get_gemini_client()
    if client is None:
        return None
    prompt = (
        "Write a concise job-application response.\n"
        "Rules:\n"
        "- 2-4 sentences.\n"
        "- Use only given profile context.\n"
        "- No invented facts.\n"
        "- Plain text only.\n\n"
        f"Question: {label}\n"
        f"Job: {json.dumps({'title': job.get('title'), 'company': job.get('company')})}\n"
        f"Profile summary: {json.dumps(hints.get('summary') or '')}\n"
        f"Resume excerpt: {json.dumps((hints.get('resume_text') or '')[:2000])}\n"
    )
    try:
        response = client.generate_content(prompt)
        text = _normalize_space(getattr(response, "text", ""))
        if not text or text.startswith("[REQUIRES_REVIEW:"):
            return None
        return text[:700]
    except Exception:
        logger.debug("Runtime essay generation failed for label=%s", label, exc_info=True)
        return None


def _runtime_value_for_label(
    label: str,
    *,
    answers: dict[str, Any],
    remembered: dict[str, str],
    hints: dict[str, str],
    job: dict[str, Any],
) -> str | None:
    if label in remembered:
        return _normalize_space(remembered[label])

    matched_existing = _match_field_label(list(answers.keys()), label)
    if matched_existing:
        raw = answers.get(matched_existing)
        if isinstance(raw, str):
            cleaned = _normalize_space(raw)
            if cleaned and not _is_review_placeholder(cleaned):
                return cleaned

    lowered = _normalize_label_text(label).lower()
    if "first name" in lowered or "preferred first name" in lowered:
        return hints.get("first_name") or None
    if "last name" in lowered or "surname" in lowered:
        return hints.get("last_name") or None
    if lowered == "name" or "full name" in lowered:
        return hints.get("full_name") or None
    if "email" in lowered:
        return hints.get("email") or None
    if "phone" in lowered or "mobile" in lowered:
        return hints.get("phone") or None
    if "country" in lowered:
        return hints.get("country") or None
    if "city" in lowered:
        return hints.get("city") or hints.get("location") or None
    if "location" in lowered:
        return hints.get("location") or hints.get("city") or None
    if "address line 1" in lowered or "address line1" in lowered or lowered == "address" or "street address" in lowered:
        return hints.get("address_line_1") or hints.get("location") or None
    if "postal code" in lowered or "zip code" in lowered or lowered == "zip":
        return hints.get("postal_code") or None
    if "country phone code" in lowered or "phone code" in lowered or "dial code" in lowered:
        return hints.get("country_phone_code") or None
    if "linkedin" in lowered:
        return hints.get("linkedin") or None
    if "github" in lowered:
        return hints.get("github") or None
    if "resume" in lowered or lowered == "cv" or "resume/cv" in lowered:
        return hints.get("resume_file_path") or None
    if "portfolio" in lowered or "website" in lowered:
        return hints.get("portfolio") or hints.get("github") or hints.get("linkedin") or None
    if "legally authorized" in lowered or "work authorization" in lowered or "authorized to work" in lowered:
        return hints.get("work_auth") or None
    if "sponsorship" in lowered or "visa" in lowered:
        return hints.get("sponsorship") or None
    if "year of study" in lowered or "current year" in lowered:
        return hints.get("current_study_year") or None
    if "placements have you completed" in lowered or "internship placements" in lowered or "co-op placements" in lowered:
        return "0"
    if (
        "co-op" in lowered or "coop" in lowered or "intern placement" in lowered or "term length" in lowered
    ) and ("how long" in lowered or "seeking" in lowered):
        return "4 months"
    if "did you attach your transcript" in lowered or ("transcript" in lowered and ("attached" in lowered or "upload" in lowered)):
        return "No"
    if "gpa as a percentage" in lowered or ("gpa" in lowered and "percentage" in lowered):
        return hints.get("gpa_percentage") or "80"
    if "highest level of education" in lowered:
        return hints.get("education_level") or None
    if "graduation" in lowered and ("month" in lowered or "year" in lowered or "date" in lowered):
        return hints.get("graduation") or None

    if _should_generate_essay(label):
        return _generate_runtime_essay_answer(label=label, job=job, hints=hints)
    return None


def _default_postal_code(country: str) -> str:
    lowered = _normalize_space(country).lower()
    if lowered == "canada":
        return "A1A 1A1"
    if lowered in {"united states", "usa", "us"}:
        return "00000"
    if lowered == "india":
        return "110001"
    return "00000"


async def _best_effort_fill_required_controls(
    page,
    *,
    hints: dict[str, str],
    target_labels: list[str],
) -> dict[str, str]:
    try:
        payload = await page.evaluate(
            """
            ({ hints, targets }) => {
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
              const normalizedTargets = Array.isArray(targets)
                ? targets.map((item) => normalize(item).toLowerCase()).filter(Boolean)
                : [];
              const targetSet = new Set(normalizedTargets);

              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                if (rect.width <= 0 || rect.height <= 0) return false;
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
                const hiddenParent = el.closest('[hidden], [aria-hidden="true"], .hidden');
                return !hiddenParent;
              };

              const getLabel = (el) => {
                const id = el.getAttribute('id');
                if (id) {
                  const forLabel = document.querySelector(`label[for="${id}"]`);
                  if (forLabel) {
                    const text = normalize(forLabel.textContent || '');
                    if (text) return text;
                  }
                }
                const parentLabel = el.closest('label');
                if (parentLabel) {
                  const text = normalize(parentLabel.textContent || '');
                  if (text) return text;
                }
                const aria = normalize(el.getAttribute('aria-label') || '');
                if (aria) return aria;
                const placeholder = normalize(el.getAttribute('placeholder') || '');
                if (placeholder) return placeholder;
                const name = normalize(el.getAttribute('name') || '');
                if (name) return name;
                const type = normalize(el.getAttribute('type') || 'field');
                return `${String(el.tagName || '').toLowerCase()}:${type}`;
              };

              const isEmpty = (el) => {
                const type = String(el.getAttribute('type') || '').toLowerCase();
                if (type === 'checkbox' || type === 'radio') return !el.checked;
                if (String(el.tagName || '').toLowerCase() === 'select') {
                  const selected = (el.selectedOptions && el.selectedOptions.length) ? el.selectedOptions[0] : null;
                  const selectedText = normalize(selected?.textContent || '').toLowerCase();
                  const selectedValue = normalize(el.value || '').toLowerCase();
                  if (!selectedValue) return true;
                  if (/^(select|choose|please select|none|--)/i.test(selectedText)) return true;
                  if (/^(select|choose|none|n\\/a|na|--)/i.test(selectedValue)) return true;
                }
                return !normalize(el.value || '');
              };

              const matchesTarget = (label) => {
                if (!targetSet.size) return true;
                const lowered = normalize(label).toLowerCase();
                if (targetSet.has(lowered)) return true;
                for (const candidate of targetSet) {
                  if (!candidate) continue;
                  if (lowered.includes(candidate) || candidate.includes(lowered)) return true;
                }
                return false;
              };

              const pickOption = (el, preferred) => {
                const options = Array.from(el.querySelectorAll('option'))
                  .map((opt) => ({
                    value: normalize(opt.value || ''),
                    label: normalize(opt.textContent || ''),
                    disabled: !!opt.disabled,
                  }))
                  .filter((opt) => !opt.disabled);
                if (!options.length) return '';
                const loweredPreferred = normalize(preferred).toLowerCase();
                if (loweredPreferred) {
                  const exact = options.find((opt) => (
                    opt.value.toLowerCase() === loweredPreferred || opt.label.toLowerCase() === loweredPreferred
                  ));
                  if (exact) return exact.value || exact.label;
                  const partial = options.find((opt) => (
                    opt.value.toLowerCase().includes(loweredPreferred) || opt.label.toLowerCase().includes(loweredPreferred)
                  ));
                  if (partial) return partial.value || partial.label;
                }
                const fallback = options.find((opt) => {
                  const text = `${opt.value} ${opt.label}`.toLowerCase();
                  return !/(select|choose|please|none|--)/i.test(text);
                }) || options.find((opt) => !!(opt.value || opt.label));
                return fallback ? (fallback.value || fallback.label) : '';
              };

              const country = normalize(hints.country || 'Canada');
              const fallbackPostal = normalize(hints.postal_code || '') || (country.toLowerCase() === 'canada' ? 'A1A 1A1' : '00000');
              const fallbackCity = normalize(hints.city || hints.location || 'Toronto');
              const fallbackAddress = normalize(hints.address_line_1 || hints.location || `${fallbackCity}`);
              const fallbackPhoneCode = normalize(hints.country_phone_code || '+1');
              const fallbackPhone = normalize(hints.phone || '0000000000');
              const fallbackEmail = normalize(hints.email || 'applicant@example.com');
              const fallbackSummary = normalize(hints.summary || 'N/A');
              const fallbackEducationLevel = normalize(hints.education_level || '');

              const resolveValue = (label, el) => {
                const lowered = normalize(label).toLowerCase();
                const type = String(el.getAttribute('type') || '').toLowerCase();
                const tag = String(el.tagName || '').toLowerCase();

                if (/first\\s*name|preferred\\s*first\\s*name/.test(lowered)) return normalize(hints.first_name || '');
                if (/last\\s*name|surname|family\\s*name/.test(lowered)) return normalize(hints.last_name || '');
                if (/full\\s*name|name$/.test(lowered)) return normalize(hints.full_name || '');
                if (/email/.test(lowered)) return fallbackEmail;
                if (/country\\s*phone\\s*code|phone\\s*code|dial\\s*code/.test(lowered)) return fallbackPhoneCode;
                if (/phone|mobile|contact\\s*number/.test(lowered)) return fallbackPhone;
                if (/postal|zip/.test(lowered)) return fallbackPostal;
                if (/address\\s*line\\s*1|street\\s*address|address/.test(lowered)) return fallbackAddress;
                if (/country/.test(lowered)) return country;
                if (/city|location/.test(lowered)) return fallbackCity;
                if (/linkedin/.test(lowered)) return normalize(hints.linkedin || '');
                if (/github/.test(lowered)) return normalize(hints.github || '');
                if (/portfolio|website|url/.test(lowered)) return normalize(hints.portfolio || hints.github || hints.linkedin || '');
                if (/authorized\\s*to\\s*work|work\\s*authorization|legally\\s*authorized/.test(lowered)) return normalize(hints.work_auth || 'Yes');
                if (/sponsorship|visa/.test(lowered)) return normalize(hints.sponsorship || 'No');
                if (/graduation/.test(lowered)) return normalize(hints.graduation || '');

                if (tag === 'textarea') return fallbackSummary;
                if (type === 'email') return fallbackEmail;
                if (type === 'tel') return fallbackPhone;
                if (type === 'url') return normalize(hints.portfolio || hints.github || hints.linkedin || '');
                if (type === 'number') return '0';
                if (type === 'date' || type === 'month') return '';
                if (type === 'checkbox' || type === 'radio') return 'true';
                return 'N/A';
              };

              const controls = Array.from(document.querySelectorAll('input, textarea, select'));
              const filled = {};
              const radioHandled = new Set();

              for (const el of controls) {
                if (!isVisible(el)) continue;
                const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
                if (!required) continue;

                const type = String(el.getAttribute('type') || '').toLowerCase();
                if (type === 'hidden') continue;

                const label = getLabel(el);
                if (!matchesTarget(label)) continue;

                if (type === 'radio') {
                  const groupName = normalize(el.getAttribute('name') || label);
                  if (radioHandled.has(groupName)) continue;
                  const checked = document.querySelector(`input[type="radio"][name="${CSS.escape(groupName)}"]:checked`);
                  if (checked) {
                    radioHandled.add(groupName);
                    continue;
                  }
                  const groupRadios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]:not([disabled])`)).filter(isVisible);
                  let chosen = null;
                  const groupContext = normalize((groupRadios[0]?.closest('fieldset, section, div')?.textContent) || '');

                  if (!chosen && fallbackEducationLevel && /(education|degree|highest level|year of study)/i.test(`${label} ${groupName} ${groupContext}`)) {
                    chosen = groupRadios.find((radio) => {
                      const optionText = normalize(getLabel(radio)).toLowerCase();
                      if (!optionText) return false;
                      return optionText.includes(fallbackEducationLevel.toLowerCase()) || fallbackEducationLevel.toLowerCase().includes(optionText);
                    }) || null;
                  }

                  if (!chosen && /(authorized|entitled to work|legally authorized|willing|able to commute)/i.test(groupContext)) {
                    chosen = groupRadios.find((radio) => normalize(getLabel(radio)).toLowerCase() === 'yes') || null;
                  }
                  if (!chosen && /(sponsorship|visa|previous employee|contingent worker)/i.test(groupContext)) {
                    chosen = groupRadios.find((radio) => normalize(getLabel(radio)).toLowerCase() === 'no') || null;
                  }
                  if (!chosen && groupRadios.length) {
                    chosen = groupRadios[0];
                  }
                  if (chosen) {
                    chosen.click();
                    chosen.dispatchEvent(new Event('change', { bubbles: true }));
                    filled[label] = normalize(getLabel(chosen)) || 'selected';
                    radioHandled.add(groupName);
                    continue;
                  }
                }

                if (!isEmpty(el)) continue;

                if (type === 'checkbox') {
                  el.click();
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  filled[label] = 'true';
                  continue;
                }

                const desired = resolveValue(label, el);
                if (String(el.tagName || '').toLowerCase() === 'select') {
                  const selected = pickOption(el, desired);
                  if (!selected) continue;
                  el.value = selected;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  filled[label] = selected;
                  continue;
                }

                if (!normalize(desired)) continue;
                el.focus();
                el.value = desired;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                filled[label] = desired;
              }

              // Fallback for ATS pages where dropdowns are required but labels/targets don't map cleanly.
              for (const el of controls) {
                if (!isVisible(el)) continue;
                if (String(el.tagName || '').toLowerCase() !== 'select') continue;
                if (!isEmpty(el)) continue;
                const label = getLabel(el);
                const selected = pickOption(el, '');
                if (!selected) continue;
                el.value = selected;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                filled[label || `select:${Object.keys(filled).length + 1}`] = selected;
              }

              // Fallback for required checkbox groups often validated server-side (e.g., term-length pickers).
              const needsCheckboxFallback = Array.from(targetSet).some((label) =>
                /(how long|term length|varying term|placements|internship|co-?op)/i.test(label)
              );
              if (needsCheckboxFallback) {
                const visibleCheckboxes = controls.filter((el) => (
                  isVisible(el) && String(el.getAttribute('type') || '').toLowerCase() === 'checkbox'
                ));
                const anyChecked = visibleCheckboxes.some((el) => !!el.checked);
                if (!anyChecked && visibleCheckboxes.length) {
                  const first = visibleCheckboxes[0];
                  first.click();
                  first.dispatchEvent(new Event('change', { bubbles: true }));
                  const label = getLabel(first) || 'checkbox group';
                  filled[label] = 'true';
                }
              }

              // Fallback for visible Yes/No button groups (common in Workday custom widgets).
              const normalizeQuestion = (value) => normalize(value).toLowerCase();
              const isSelectedButton = (btn) => {
                const pressed = String(btn.getAttribute('aria-pressed') || '').toLowerCase();
                if (pressed === 'true') return true;
                const classes = String(btn.className || '').toLowerCase();
                return /(selected|active|checked|is-selected)/i.test(classes);
              };
              const yesNoContainers = Array.from(document.querySelectorAll('fieldset, section, div')).filter((node) => {
                if (!isVisible(node)) return false;
                const buttons = Array.from(node.querySelectorAll('button, [role="button"]')).filter(isVisible);
                if (!buttons.length) return false;
                const hasYes = buttons.some((btn) => normalize(btn.textContent || '').toLowerCase() === 'yes');
                const hasNo = buttons.some((btn) => normalize(btn.textContent || '').toLowerCase() === 'no');
                return hasYes && hasNo;
              });
              for (const container of yesNoContainers) {
                const question = normalizeQuestion(container.textContent || '');
                const buttons = Array.from(container.querySelectorAll('button, [role="button"]')).filter(isVisible);
                const yesBtn = buttons.find((btn) => normalize(btn.textContent || '').toLowerCase() === 'yes');
                const noBtn = buttons.find((btn) => normalize(btn.textContent || '').toLowerCase() === 'no');
                if (!yesBtn || !noBtn) continue;
                if (isSelectedButton(yesBtn) || isSelectedButton(noBtn) || container.querySelector('input[type="radio"]:checked')) {
                  continue;
                }
                let preferred = '';
                if (/(sponsorship|visa)/i.test(question)) preferred = 'no';
                else if (/(previous employee|contingent worker|worked here before)/i.test(question)) preferred = 'no';
                else if (/(authorized|entitled to work|legally authorized|willing|able to commute)/i.test(question)) preferred = 'yes';
                if (!preferred) continue;
                const targetBtn = preferred === 'yes' ? yesBtn : noBtn;
                targetBtn.click();
                targetBtn.dispatchEvent(new Event('click', { bubbles: true }));
                filled[`question:${question.slice(0, 60)}`] = preferred;
              }

              // Fallback for custom location combobox widgets.
              const comboInputs = Array.from(document.querySelectorAll('input[role="combobox"], [role="combobox"] input, input[aria-autocomplete]')).filter(isVisible);
              for (const input of comboInputs) {
                const label = getLabel(input);
                const lowered = normalize(label).toLowerCase();
                if (!/(location|city|country)/i.test(lowered)) continue;
                if (normalize(input.value || '')) continue;
                const desired = /(country)/i.test(lowered) ? country : fallbackCity;
                if (!desired) continue;
                input.focus();
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.value = desired;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                filled[label || `combobox:${Object.keys(filled).length + 1}`] = desired;
              }

              return filled;
            }
            """,
            {"hints": hints, "targets": target_labels},
        )
    except Exception:
        return {}

    if not isinstance(payload, dict):
        return {}
    filled: dict[str, str] = {}
    for key, value in payload.items():
        label = _normalize_label_text(key)
        answer = _normalize_space(value)
        if label and answer:
            filled[label] = answer
    return filled


async def _apply_value_to_control(locator, value: str) -> bool:
    normalized = _normalize_space(value)
    if not normalized:
        return False
    try:
        meta = await locator.evaluate(
            """
            (el) => ({
              tag: String(el.tagName || '').toLowerCase(),
              type: String(el.getAttribute('type') || '').toLowerCase(),
            })
            """
        )
    except Exception:
        meta = {"tag": "", "type": ""}

    tag = str(meta.get("tag") or "").lower()
    field_type = str(meta.get("type") or "").lower()
    try:
        if field_type == "file":
            file_path = Path(normalized).expanduser()
            if not file_path.exists():
                return False
            await locator.set_input_files(str(file_path))
            return True
        if tag == "select":
            try:
                await locator.select_option(label=normalized)
                return True
            except Exception:
                pass
            try:
                await locator.select_option(value=normalized)
                return True
            except Exception:
                pass
            try:
                option = await locator.evaluate(
                    """
                    (el, desired) => {
                      const target = String(desired || '').toLowerCase();
                      const options = Array.from(el.querySelectorAll('option'))
                        .map((opt) => ({
                          value: String(opt.value || '').trim(),
                          label: String(opt.textContent || '').replace(/\\s+/g, ' ').trim(),
                        }))
                        .filter((opt) => opt.value || opt.label);
                      for (const opt of options) {
                        if (opt.label.toLowerCase() === target || opt.value.toLowerCase() === target) {
                          return opt;
                        }
                      }
                      for (const opt of options) {
                        if (target && (opt.label.toLowerCase().includes(target) || target.includes(opt.label.toLowerCase()))) {
                          return opt;
                        }
                      }
                      return null;
                    }
                    """,
                    normalized,
                )
                if isinstance(option, dict):
                    value = _normalize_space(option.get("value"))
                    label = _normalize_space(option.get("label"))
                    if value:
                        await locator.select_option(value=value)
                        return True
                    if label:
                        await locator.select_option(label=label)
                        return True
            except Exception:
                pass
            return False
        if field_type == "checkbox":
            lowered = normalized.lower()
            if lowered in {"true", "yes", "1"}:
                await locator.check()
            elif lowered in {"false", "no", "0"}:
                await locator.uncheck()
            else:
                await locator.check()
            return True
        if field_type == "radio":
            await locator.check()
            return True
        await locator.fill(normalized)
        return True
    except Exception:
        return False


async def _set_resume_file_input(page, file_path: str) -> bool:
    normalized = _normalize_space(file_path)
    if not normalized:
        return False
    candidate = Path(normalized).expanduser()
    if not candidate.exists():
        return False
    selectors = [
        "input[type='file']",
        "input[type='file'][accept*='pdf']",
        "input[type='file'][accept*='doc']",
    ]
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.count() == 0:
                continue
            await locator.set_input_files(str(candidate))
            return True
        except Exception:
            continue
    return False


async def _autofill_live_required_fields(
    page,
    *,
    missing_labels: list[str],
    answers: dict[str, Any],
    profile_id: str,
    site_domain: str,
    profile_row: dict[str, Any],
    job: dict[str, Any],
) -> dict[str, str]:
    if not missing_labels:
        return {}

    remembered = recall_field_answers(profile_id, site_domain, missing_labels)
    hints = _derive_runtime_hints(profile_row, job)
    if not hints.get("postal_code"):
        hints["postal_code"] = _default_postal_code(hints.get("country", ""))
    if not hints.get("country_phone_code"):
        hints["country_phone_code"] = _infer_phone_code(hints.get("country", ""), hints.get("phone", "")) or "+1"
    if not hints.get("address_line_1"):
        hints["address_line_1"] = hints.get("location", "") or hints.get("city", "")
    filled: dict[str, str] = {}

    for label in missing_labels:
        value = _runtime_value_for_label(
            label,
            answers=answers,
            remembered=remembered,
            hints=hints,
            job=job,
        )
        if not value:
            continue
        locator = await _locate_field_control(page, label)
        if locator is None:
            if ("resume" in _normalize_label_text(label).lower() or "cv" in _normalize_label_text(label).lower()) and await _set_resume_file_input(page, value):
                filled[label] = value
                answers[label] = value
                await asyncio.sleep(0.2)
            continue
        if await _apply_value_to_control(locator, value):
            filled[label] = value
            answers[label] = value
            await asyncio.sleep(0.15)
        elif ("resume" in _normalize_label_text(label).lower() or "cv" in _normalize_label_text(label).lower()) and await _set_resume_file_input(page, value):
            filled[label] = value
            answers[label] = value
            await asyncio.sleep(0.2)

    remaining = [label for label in missing_labels if label not in filled]
    if remaining:
        best_effort = await _best_effort_fill_required_controls(
            page,
            hints=hints,
            target_labels=remaining,
        )
        for label, value in best_effort.items():
            matched = _match_field_label(remaining, label) or label
            normalized_value = _normalize_space(value)
            if not normalized_value:
                continue
            filled[matched] = normalized_value
            answers[matched] = normalized_value

    if filled:
        remember_field_answers(profile_id, site_domain, filled)
    return filled


async def _expand_repeatable_profile_sections(page, profile_row: dict[str, Any]) -> int:
    experiences = _safe_json_list(profile_row.get("experience_json"))
    education = _safe_json_list(profile_row.get("education_json"))
    wants_work = len(experiences) > 0
    wants_education = len(education) > 0
    if not wants_work and not wants_education:
        return 0
    try:
        result = await page.evaluate(
            """
            ({ wantsWork, wantsEducation }) => {
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
              };
              const clickAddNear = (pattern) => {
                const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,legend,label,strong,span,div,p'))
                  .filter((el) => isVisible(el) && pattern.test(normalize(el.textContent || '')));
                for (const heading of headings) {
                  let node = heading;
                  for (let depth = 0; depth < 4 && node; depth += 1) {
                    const region = node.parentElement || node;
                    const regionText = normalize(region.textContent || '');
                    // If the section already expanded with real fields/items, avoid adding duplicate empty blocks.
                    if (/(job title|work experience 1|school or university|degree|education 1)/i.test(regionText)) {
                      return false;
                    }
                    const buttons = Array.from(region.querySelectorAll('button, [role="button"], a'))
                      .filter((el) => isVisible(el) && normalize(el.textContent || '') === 'add');
                    if (buttons.length) {
                      buttons[0].click();
                      return true;
                    }
                    node = node.parentElement;
                  }
                }
                return false;
              };
              let clicks = 0;
              if (wantsWork && clickAddNear(/work experience/)) clicks += 1;
              if (wantsEducation && clickAddNear(/education/)) clicks += 1;
              return clicks;
            }
            """,
            {"wantsWork": wants_work, "wantsEducation": wants_education},
        )
    except Exception:
        return 0
    try:
        return int(result or 0)
    except Exception:
        return 0


def _is_review_placeholder(value: Any) -> bool:
    return isinstance(value, str) and value.strip().startswith("[REQUIRES_REVIEW:")


def _collect_unresolved_required_labels(
    form_fields: list[dict[str, Any]],
    answers: dict[str, Any],
) -> list[str]:
    labels: list[str] = []
    for field in form_fields:
        if not bool(field.get("required", False)):
            continue
        raw_label = _normalize_space(field.get("label"))
        label = _normalize_label_text(raw_label)
        if not label:
            continue
        value = answers.get(raw_label)
        if value is None:
            matched = _match_field_label(list(answers.keys()), label)
            if matched:
                value = answers.get(matched)
        if value is None or _is_review_placeholder(value):
            labels.append(label)
    deduped: list[str] = []
    seen: set[str] = set()
    for label in labels:
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(label)
    return deduped


def _normalize_label_key(label: str) -> str:
    lowered = _normalize_space(label).lower()
    return re.sub(r"[^a-z0-9]+", "", lowered)


def _match_field_label(target_labels: list[str], key: str) -> str | None:
    key_norm = _normalize_label_key(key)
    if not key_norm:
        return None
    best: str | None = None
    best_score = 0
    for label in target_labels:
        norm = _normalize_label_key(label)
        if not norm:
            continue
        score = 0
        if key_norm == norm:
            score = 100
        elif key_norm in norm:
            score = 70
        elif norm in key_norm:
            score = 60
        if score > best_score:
            best = label
            best_score = score
    return best


def _parse_label_value_pairs(text: str) -> dict[str, str]:
    stripped = str(text or "").strip()
    if not stripped:
        return {}
    parsed: dict[str, str] = {}
    try:
        obj = json.loads(stripped)
        if isinstance(obj, dict):
            for key, value in obj.items():
                label = _normalize_space(key)
                answer = _normalize_space(value)
                if label and answer:
                    parsed[label] = answer
            return parsed
    except json.JSONDecodeError:
        pass

    for line in re.split(r"[\n;]+", stripped):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        label = _normalize_space(key)
        answer = _normalize_space(value)
        if label and answer:
            parsed[label] = answer
    return parsed


def _freeform_value_for_label(text: str, label: str) -> str | None:
    lowered = _normalize_space(text).lower()
    label_lower = _normalize_label_text(label).lower()
    if not lowered or not label_lower:
        return None

    if any(token in label_lower for token in ("location", "city", "country")):
        if "canada" in lowered:
            return "Canada"
        if "united states" in lowered or re.search(r"\busa?\b", lowered):
            return "United States"
        if "india" in lowered:
            return "India"

    if any(token in label_lower for token in ("authorized", "legally authorized", "able to", "willing", "eligib")):
        if re.search(r"\byes\b", lowered):
            return "Yes"
        if re.search(r"\bno\b", lowered):
            return "No"

    if any(token in label_lower for token in ("sponsorship", "visa")):
        if re.search(r"\bno\b", lowered):
            return "No"
        if re.search(r"\byes\b", lowered):
            return "Yes"

    if "education" in label_lower or "degree" in label_lower:
        if "bachelor" in lowered:
            return "Pursuing Bachelors"
        if "master" in lowered:
            return "Pursuing Masters / Doctorate"
        if "high school" in lowered:
            return "High school"

    if "gpa" in label_lower:
        numeric = re.search(r"\b(\d{1,3}(?:\.\d+)?)\b", lowered)
        if numeric:
            return numeric.group(1)

    return None


def _user_signal(text: str) -> str:
    lowered = _normalize_space(text).lower()
    if not lowered:
        return "none"
    if re.search(r"\b(done|finished|all set|i submitted|submitted)\b", lowered):
        return "done"
    if re.search(r"\b(stop|cancel|abort|quit)\b", lowered):
        return "stop"
    if re.search(r"\b(force continue|continue anyway|skip check|override)\b", lowered):
        return "continue_force"
    if re.search(r"\b(fill them|autofill|you fill|fill it|fill now)\b", lowered):
        return "fill"
    if re.search(r"\b(continue|done|completed|resolved|go ahead|resume|proceed|ok)\b", lowered):
        return "continue"
    return "none"


def _latest_user_messages(draft_id: str) -> list[dict[str, str]]:
    return [msg for msg in get_chat_messages(draft_id) if msg.get("role") == "user"]


def _extract_clarifications_from_chat(draft_id: str, target_labels: list[str]) -> dict[str, str]:
    if not target_labels:
        return {}
    resolved: dict[str, str] = {}
    for msg in _latest_user_messages(draft_id):
        text = str(msg.get("text") or "")
        pairs = _parse_label_value_pairs(text)
        for key, value in pairs.items():
            label = _match_field_label(target_labels, key)
            if label and value:
                resolved[label] = value
        # Fallback: infer values from free-form replies for any still-unresolved target.
        for label in target_labels:
            if label in resolved:
                continue
            inferred = _freeform_value_for_label(text, label)
            if inferred:
                resolved[label] = inferred
    return resolved


def _apply_chat_clarifications(
    draft_id: str,
    *,
    target_labels: list[str],
    answers: dict[str, Any],
    profile_id: str,
    site_domain: str,
) -> int:
    if not target_labels:
        return 0
    updates = _extract_clarifications_from_chat(draft_id, target_labels)
    changed = 0
    for label, value in updates.items():
        normalized = _normalize_space(value)
        if not normalized:
            continue
        current = _normalize_space(answers.get(label))
        if current == normalized:
            continue
        answers[label] = normalized
        changed += 1
    if changed:
        remember_field_answers(profile_id, site_domain, {label: answers[label] for label in updates if label in answers})
    return changed


async def _wait_for_user_action(
    draft_id: str,
    *,
    action: str,
    detail: str,
    timeout_seconds: int,
    resolution_checker: Any = None,
    allow_timeout: bool = False,
    require_continue_ack: bool = False,
) -> str:
    _progress_phase(draft_id, PHASE_WAITING_USER)
    _progress_require_user_action(draft_id, action, detail)
    _progress_event(draft_id, f"Waiting for user action: {detail}", level="warn")
    _chat_push_ai(draft_id, detail)
    start = asyncio.get_running_loop().time()
    seen_user_count = len(_latest_user_messages(draft_id))
    prompted_for_continue = False
    last_unresolved_notice = 0.0

    while True:
        if resolution_checker is not None:
            try:
                resolved = resolution_checker()
                if asyncio.iscoroutine(resolved):
                    resolved = await resolved
                if resolved:
                    if require_continue_ack:
                        if not prompted_for_continue:
                            _chat_push_ai(
                                draft_id,
                                "I detected the page state is ready. Type 'continue' and I'll proceed.",
                            )
                            _progress_event(
                                draft_id,
                                "Detected ready state, waiting for explicit continue from user.",
                                level="debug",
                            )
                            prompted_for_continue = True
                        # Keep waiting for explicit user continue
                        pass
                    else:
                        _progress_clear_user_action(draft_id)
                        _progress_event(draft_id, "User action resolved. Continuing.")
                        return "resolved"
            except Exception:
                logger.debug("User action resolution checker failed", exc_info=True)

        user_messages = _latest_user_messages(draft_id)
        if len(user_messages) > seen_user_count:
            new_messages = user_messages[seen_user_count:]
            seen_user_count = len(user_messages)
            for msg in new_messages:
                signal = _user_signal(str(msg.get("text") or ""))
                if signal == "stop":
                    raise ValueError("Application run stopped by operator guidance")
                if signal == "continue_force":
                    _progress_clear_user_action(draft_id)
                    _progress_event(
                        draft_id,
                        "User forced continue despite unresolved checks.",
                        level="warn",
                    )
                    return "continue"
                if signal == "done":
                    _progress_clear_user_action(draft_id)
                    _progress_event(draft_id, "User marked this run as done.")
                    return "done"
                if signal in {"continue", "fill"}:
                    if resolution_checker is not None:
                        try:
                            resolved_now = resolution_checker()
                            if asyncio.iscoroutine(resolved_now):
                                resolved_now = await resolved_now
                        except Exception:
                            resolved_now = False
                        if not resolved_now:
                            now = asyncio.get_running_loop().time()
                            if now - last_unresolved_notice >= 8:
                                if signal == "fill":
                                    _chat_push_ai(
                                        draft_id,
                                        "I retried auto-filling required fields and some are still unresolved. "
                                        "I'll keep trying; if you want me to proceed anyway, type 'continue anyway'.",
                                    )
                                else:
                                    _chat_push_ai(
                                        draft_id,
                                        "Still detecting unresolved required fields after an auto-fill retry. "
                                        "You can type 'continue anyway' to force proceed.",
                                    )
                                last_unresolved_notice = now
                            continue
                    _progress_clear_user_action(draft_id)
                    _progress_event(draft_id, "User confirmed to continue.")
                    return "continue"

        if asyncio.get_running_loop().time() - start >= timeout_seconds:
            if allow_timeout:
                _progress_clear_user_action(draft_id)
                _progress_event(draft_id, "No user response received. Continuing with current state.", level="warn")
                return "timeout"
            raise ValueError(f"Timed out waiting for user action: {detail}")
        await asyncio.sleep(1.0)


async def _request_required_clarifications(
    draft_id: str,
    *,
    form_fields: list[dict[str, Any]],
    answers: dict[str, Any],
    profile_id: str,
    site_domain: str,
) -> bool:
    unresolved = _collect_unresolved_required_labels(form_fields, answers)
    if not unresolved:
        return False

    # Reuse previously confirmed user answers before asking again.
    recalled = recall_field_answers(profile_id, site_domain, unresolved)
    reused = 0
    for label, value in recalled.items():
        existing = answers.get(label)
        if existing is None or _is_review_placeholder(existing):
            answers[label] = value
            reused += 1
    if reused:
        unresolved = [
            label
            for label in unresolved
            if answers.get(label) in {None} or _is_review_placeholder(answers.get(label))
        ]
        _progress_event(
            draft_id,
            f"Reused {reused} saved answer(s) from prior runs for {site_domain}.",
            level="debug",
        )
        if not unresolved:
            _chat_push_ai(
                draft_id,
                "I reused previously confirmed answers for required fields and will continue.",
            )
            return False

    details = (
        "I need answers for required fields before continuing: "
        + ", ".join(unresolved[:8])
        + ". Reply in chat using 'Field: value' (multiple lines supported)."
    )
    _progress_phase(draft_id, PHASE_WAITING_USER)
    _progress_require_user_action(draft_id, USER_ACTION_CLARIFICATION, details)
    _chat_push_ai(draft_id, details)
    _progress_event(draft_id, details, level="warn")

    timeout_seconds = _user_action_wait_timeout_seconds()
    start = asyncio.get_running_loop().time()
    while True:
        updates = _extract_clarifications_from_chat(draft_id, unresolved)
        changed = 0
        for label, value in updates.items():
            existing = answers.get(label)
            if existing is None or _is_review_placeholder(existing):
                answers[label] = value
                changed += 1
        unresolved = [label for label in unresolved if answers.get(label) in {None} or _is_review_placeholder(answers.get(label))]
        if changed:
            _progress_event(draft_id, f"Applied {changed} clarification answer(s) from operator chat.")
            remembered = remember_field_answers(
                profile_id,
                site_domain,
                {label: answers[label] for label in updates if label in answers},
            )
            if remembered:
                _progress_event(
                    draft_id,
                    f"Saved {remembered} reusable answer(s) for future applications.",
                    level="debug",
                )
        if not unresolved:
            _progress_clear_user_action(draft_id)
            _progress_event(draft_id, "All required clarification fields resolved.")
            _chat_push_ai(draft_id, "Thanks. I have the missing required answers and will continue.")
            return True

        latest = _latest_user_messages(draft_id)
        if latest and _user_signal(str(latest[-1].get("text") or "")) == "stop":
            raise ValueError("Application run stopped by operator guidance")
        if asyncio.get_running_loop().time() - start >= timeout_seconds:
            raise ValueError(
                "Required draft answers are still missing. Provide values in chat as 'Field: value' and try again."
            )
        await asyncio.sleep(1.0)


async def _inspect_user_gate(page) -> tuple[str, str]:
    try:
        state = await page.evaluate(
            """
            () => {
              const bodyText = String(document.body?.innerText || '').toLowerCase();
              const visiblePasswordInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter((el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
              });
              const hasPassword = visiblePasswordInputs.length > 0;
              const hasAccountText = /(create account|sign up|register|new account)/i.test(bodyText);
              const hasLoginText = /(sign in|log in|login)/i.test(bodyText);
              const actionables = Array.from(
                document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')
              );
              const hasResumeAutofill = actionables.some((el) => {
                const text = String(el.textContent || el.value || '').toLowerCase();
                return /(autofill|use resume|upload resume|parse resume|apply with resume)/i.test(text);
              });
              return { hasPassword, hasAccountText, hasLoginText, hasResumeAutofill };
            }
            """
        )
    except Exception:
        return USER_ACTION_NONE, ""

    if not isinstance(state, dict):
        return USER_ACTION_NONE, ""

    has_password = bool(state.get("hasPassword"))
    has_account_text = bool(state.get("hasAccountText"))
    has_login_text = bool(state.get("hasLoginText"))
    has_resume_autofill = bool(state.get("hasResumeAutofill"))

    if has_password and has_account_text:
        return USER_ACTION_ACCOUNT, "Please create/sign in to your account in the browser, then type 'continue'."
    if has_password and has_login_text:
        return USER_ACTION_LOGIN, "Sign in in the browser, then type 'continue' so I can keep filling."
    if has_resume_autofill:
        return (
            USER_ACTION_RESUME_AUTOFILL,
            "Resume autofill is available on this page. If possible, use it now, then type 'continue'.",
        )
    return USER_ACTION_NONE, ""


async def _detect_missing_required_fields(page) -> list[str]:
    try:
        raw = await page.evaluate(
            """
            () => {
              const controls = Array.from(document.querySelectorAll('input, textarea, select'));
              const labels = [];
              for (const el of controls) {
                const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
                if (!required) continue;
                const tag = String(el.tagName || '').toLowerCase();
                const type = String(el.getAttribute('type') || '').toLowerCase();
                if (type === 'hidden') continue;

                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                const hiddenByStyle =
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  style.opacity === '0' ||
                  rect.width <= 0 ||
                  rect.height <= 0;
                if (hiddenByStyle) continue;
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;

                // Skip controls hidden by collapsed/hidden parents.
                const hiddenParent = el.closest('[hidden], [aria-hidden="true"], .hidden');
                if (hiddenParent) continue;

                const selectLooksUnchosen = (() => {
                  if (tag !== 'select') return false;
                  const selected = (el.selectedOptions && el.selectedOptions.length) ? el.selectedOptions[0] : null;
                  const selectedText = String(selected?.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                  const selectedValue = String(el.value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                  if (!selectedValue) return true;
                  if (/^(select|choose|please select|none|--)/i.test(selectedText)) return true;
                  if (/^(select|choose|none|n\\/a|na|--)/i.test(selectedValue)) return true;
                  return false;
                })();

                const isEmpty =
                  type === 'checkbox' || type === 'radio'
                    ? !el.checked
                    : (!String(el.value || '').trim() || selectLooksUnchosen);
                if (type === 'radio' && el.name) {
                  const groupChecked = document.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
                  if (groupChecked) continue;
                }
                if (!isEmpty) continue;

                const id = el.getAttribute('id');
                let label = '';
                if (id) {
                  const forLabel = document.querySelector(`label[for="${id}"]`);
                  if (forLabel) label = forLabel.textContent || '';
                }
                if (!label) {
                  const parent = el.closest('label');
                  if (parent) label = parent.textContent || '';
                }
                if (!label) {
                  label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
                }
                if (!label) {
                  label = el.getAttribute('name') || '';
                }
                label = String(label || '').replace(/\\*/g, ' ').replace(/\\s+/g, ' ').trim();
                label = label.replace(/[:\\-\\.]$/, '').trim();
                if (!label) {
                  label = `${tag}:${type || 'field'}`;
                }
                labels.push(label);
                if (labels.length >= 25) break;
              }

              // Workday/ATS validation summaries often include explicit required-field messages.
              // Capture those labels as unresolved even when underlying control values look non-empty.
              try {
                const bodyText = String(document.body?.innerText || '');
                const patterns = [
                  /The field\\s+(.+?)\\s+is required and must have a value/gi,
                  /Error\\s*[-:]*\\s*(.+?)\\s+is required and must have a value/gi,
                ];
                for (const pattern of patterns) {
                  let match;
                  while ((match = pattern.exec(bodyText)) !== null) {
                    const label = String(match[1] || '')
                      .replace(/\\s+/g, ' ')
                      .replace(/\\*+/g, ' ')
                      .trim()
                      .replace(/[:\\-\\.]$/, '')
                      .trim();
                    if (label) labels.push(label);
                    if (labels.length >= 50) break;
                  }
                  if (labels.length >= 50) break;
                }
              } catch (_) {
                // ignore
              }

              return labels;
            }
            """
        )
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in raw:
        label = _normalize_space(item)
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(label)
    return deduped


async def _detect_empty_fillable_fields(page) -> list[str]:
    try:
        raw = await page.evaluate(
            """
            () => {
              const controls = Array.from(document.querySelectorAll('input, textarea, select'));
              const labels = [];
              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                if (rect.width <= 0 || rect.height <= 0) return false;
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
                const hiddenParent = el.closest('[hidden], [aria-hidden="true"], .hidden, nav, header');
                return !hiddenParent;
              };
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
              const keyword = /(name|email|phone|mobile|country|city|location|address|postal|zip|authorized|sponsor|visa|study|education|degree|gpa|transcript|resume|cv|experience|company|title|school|university|skills?)/i;

              for (const el of controls) {
                if (!isVisible(el)) continue;
                const tag = String(el.tagName || '').toLowerCase();
                const type = String(el.getAttribute('type') || '').toLowerCase();
                if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;

                const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
                let label = '';
                const id = el.getAttribute('id');
                if (id) {
                  const bound = document.querySelector(`label[for="${id}"]`);
                  if (bound) label = normalize(bound.textContent || '');
                }
                if (!label) {
                  const parent = el.closest('label');
                  if (parent) label = normalize(parent.textContent || '');
                }
                if (!label) label = normalize(el.getAttribute('aria-label') || '');
                if (!label) label = normalize(el.getAttribute('placeholder') || '');
                if (!label) label = normalize(el.getAttribute('name') || '');
                if (!label) label = `${tag}:${type || 'field'}`;
                label = label.replace(/\\*/g, ' ').replace(/\\s+/g, ' ').trim().replace(/[:\\-\\.]$/, '').trim();

                let empty = false;
                if (type === 'checkbox' || type === 'radio') {
                  empty = false;
                } else if (type === 'file') {
                  const files = el.files;
                  empty = !files || files.length === 0;
                } else if (tag === 'select') {
                  const selected = (el.selectedOptions && el.selectedOptions.length) ? el.selectedOptions[0] : null;
                  const selectedText = normalize(selected?.textContent || '').toLowerCase();
                  const selectedValue = normalize(el.value || '').toLowerCase();
                  empty = !selectedValue || /^(select|choose|please select|none|--)/i.test(selectedText) || /^(select|choose|none|n\\/a|na|--)/i.test(selectedValue);
                } else {
                  empty = !normalize(el.value || '');
                }
                if (!empty) continue;

                const lowered = label.toLowerCase();
                const include = required || tag === 'select' || tag === 'textarea' || keyword.test(lowered);
                if (!include) continue;

                labels.push(label);
                if (labels.length >= 40) break;
              }
              return labels;
            }
            """
        )
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in raw:
        label = _normalize_space(item)
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(label)
    return deduped


async def _detect_fill_targets(page) -> list[str]:
    required = await _detect_missing_required_fields(page)
    empty = await _detect_empty_fillable_fields(page)
    combined: list[str] = []
    seen: set[str] = set()
    for label in [*required, *empty]:
        normalized = _normalize_space(label)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        combined.append(normalized)
        if len(combined) >= 50:
            break
    return combined


async def _click_progress_continue_button(page) -> str | None:
    # Safe progression buttons only. Never click submit/apply/sign-in controls here.
    candidates = [
        r"^\s*continue\s*$",
        r"^\s*next\s*$",
        r"^\s*save\s+and\s+continue\s*$",
        r"^\s*review\s*$",
        r"^\s*proceed\s*$",
    ]
    for pattern in candidates:
        locator = page.get_by_role("button", name=re.compile(pattern, re.IGNORECASE)).first
        try:
            if await locator.count() == 0:
                continue
            try:
                if not await locator.is_enabled():
                    continue
            except Exception:
                pass
            await locator.scroll_into_view_if_needed()
            label = _normalize_space(await locator.inner_text())
            await locator.click()
            return label or pattern
        except Exception:
            continue

    # Fallback: common submit-like input for wizard steps
    fallback = page.locator("input[type='submit'][value='Continue'], input[type='button'][value='Continue']").first
    try:
        if await fallback.count() > 0:
            await fallback.scroll_into_view_if_needed()
            await fallback.click()
            return "Continue"
    except Exception:
        pass

    # Last resort: click the first visible actionable with common wizard-step labels.
    try:
        clicked = await page.evaluate(
            """
            () => {
              const nodes = Array.from(
                document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')
              );
              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                if (rect.width <= 0 || rect.height <= 0) return false;
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
                return true;
              };
              const getText = (el) => String(el.textContent || el.value || el.getAttribute('aria-label') || '')
                .replace(/\\s+/g, ' ')
                .trim();
              for (const el of nodes) {
                if (!isVisible(el)) continue;
                const text = getText(el);
                if (!text) continue;
                const lowered = text.toLowerCase();
                const allowed = /(save\\s+and\\s+continue|continue|next|review|proceed)/i.test(lowered);
                const blocked = /(submit|apply now|apply$|sign in|log in|create account|register)/i.test(lowered);
                if (!allowed || blocked) continue;
                el.scrollIntoView({ block: 'center', inline: 'center' });
                el.click();
                return text;
              }
              return '';
            }
            """
        )
        clicked_text = _normalize_space(clicked)
        if clicked_text:
            return clicked_text
    except Exception:
        pass
    return None


async def _detect_apply_entry_state(page) -> tuple[bool, str]:
    try:
        state = await page.evaluate(
            """
            () => {
              const controls = Array.from(document.querySelectorAll('input, textarea, select')).filter((el) => {
                const type = String(el.getAttribute('type') || '').toLowerCase();
                if (type === 'hidden') return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
              });
              const requiredControls = controls.filter((el) => (
                el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
              ));
              const actionables = Array.from(
                document.querySelectorAll('button, a, [role=\"button\"], input[type=\"button\"], input[type=\"submit\"]')
              );
              const candidates = [];
              for (const el of actionables) {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;
                const text = String(el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
                if (!text) continue;
                const lowered = text.toLowerCase();
                const applyLike = /(easy apply|autofill with resume|use resume|apply now|apply manually|apply|start application|continue application|submit application)/i.test(lowered);
                const blocked = /(sign in|log in|login|create account|register|sign up|talent community|job alert)/i.test(lowered);
                if (applyLike && !blocked) candidates.push(text);
              }
              return {
                controlCount: controls.length,
                requiredCount: requiredControls.length,
                hasApply: candidates.length > 0,
                firstApply: candidates.length ? candidates[0] : ''
              };
            }
            """
        )
    except Exception:
        return False, ""
    if not isinstance(state, dict):
        return False, ""
    control_count = int(state.get("controlCount") or 0)
    required_count = int(state.get("requiredCount") or 0)
    has_apply = bool(state.get("hasApply"))
    first_apply = _normalize_space(state.get("firstApply"))
    # Entry page heuristic: has Apply CTA but not yet on a required application form.
    # Some ATS pages include a few generic/search controls in headers, so avoid ultra-low thresholds.
    is_entry = has_apply and required_count == 0 and control_count <= 220
    return is_entry, first_apply


async def _click_apply_entry_action(page) -> str | None:
    selectors = [
        "button:has-text('Autofill with Resume')",
        "button:has-text('Use Resume')",
        "button:has-text('Apply Manually')",
        "button:has-text('Easy Apply')",
        "button:has-text('Apply now')",
        "button:has-text('Apply')",
        "button:has-text('Start application')",
        "button:has-text('Continue application')",
        "a:has-text('Autofill with Resume')",
        "a:has-text('Use Resume')",
        "a:has-text('Easy Apply')",
        "a:has-text('Apply now')",
        "a:has-text('Apply')",
        "a:has-text('Start application')",
        "a:has-text('Continue application')",
        "[role='button']:has-text('Apply')",
    ]
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.count() == 0:
                continue
            await locator.scroll_into_view_if_needed()
            text = _normalize_space(await locator.inner_text())
            await locator.click()
            return text or selector
        except Exception:
            continue
    return None


async def _click_resume_autofill_action(page) -> str | None:
    selectors = [
        "button:has-text('Autofill with Resume')",
        "button:has-text('Use Resume')",
        "button:has-text('Apply with Resume')",
        "a:has-text('Autofill with Resume')",
        "a:has-text('Use Resume')",
        "a:has-text('Apply with Resume')",
    ]
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.count() == 0:
                continue
            await locator.scroll_into_view_if_needed()
            text = _normalize_space(await locator.inner_text())
            await locator.click()
            return text or selector
        except Exception:
            continue
    return None


async def _fill_known_fields(
    page,
    form_fields: list[dict[str, Any]],
    answers: dict[str, Any],
    *,
    only_labels: set[str] | None = None,
) -> None:
    for field in form_fields:
        raw_label = str(field.get("label") or "").strip()
        label = _normalize_label_text(raw_label)
        if not label:
            continue
        if only_labels is not None and raw_label not in only_labels and label not in only_labels:
            continue

        value = answers.get(raw_label)
        if value is None:
            matched_label = _match_field_label(list(answers.keys()), label)
            if matched_label:
                value = answers.get(matched_label)
        if value is None:
            continue
        if isinstance(value, str) and value.startswith("[REQUIRES_REVIEW:"):
            continue

        field_type = str(field.get("type") or "").lower()
        await asyncio.sleep(random.uniform(0.3, 1.2))

        try:
            locator = await _locate_field_control(page, label)
            if locator is None:
                logger.warning("Skipping unfillable field label=%s", label)
                continue
            await locator.scroll_into_view_if_needed()
            if field_type == "dropdown":
                await locator.select_option(label=str(value))
            elif field_type == "checkbox":
                if bool(value):
                    await locator.check()
                else:
                    await locator.uncheck()
            elif field_type == "file":
                if isinstance(value, dict):
                    file_path = value.get("resume_file_path")
                    if file_path and Path(file_path).exists():
                        await locator.set_input_files(file_path)
            else:
                await locator.fill(str(value))
        except Exception:
            logger.warning("Skipping unfillable field label=%s", label)


def _site_key_from_url(url: str) -> str:
    """Derive a per-site cookie state key from the job URL so sessions stay separate."""
    if "linkedin.com" in url:
        return "linkedin"
    if "indeed.com" in url:
        return "indeed"
    if "greenhouse.io" in url:
        return "greenhouse"
    if "lever.co" in url:
        return "lever"
    if "workday.com" in url:
        return "workday"
    return "visible_session"


def _site_domain_from_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").strip().lower()
    except Exception:
        host = ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _summarize_navigation_notes(notes: list[str], *, max_items: int = 24) -> list[str]:
    summary: list[str] = []
    seen: set[str] = set()
    for raw in notes:
        note = _normalize_space(raw)
        if not note:
            continue
        lowered = note.lower()
        if lowered.startswith("loaded site playbook notes"):
            continue
        if lowered.startswith("captured browser snapshot"):
            continue
        if lowered.startswith("persisted ") and "login cookies" in lowered:
            continue
        key = lowered
        if key in seen:
            continue
        seen.add(key)
        summary.append(note)
        if len(summary) >= max_items:
            break
    return summary


def _evaluate_playbook_memory_write(
    *,
    run_status: str,
    ai_actions_executed: int,
    note_count: int,
    user_gates_triggered: int,
    clarification_rounds: int,
    had_missing_required_block: bool,
) -> tuple[bool, float, str]:
    status = _normalize_space(run_status).lower()
    if status not in {"submitted", "ready_for_final_approval"}:
        return False, 0.0, "run did not finish in a reusable completion state"
    if ai_actions_executed <= 0:
        return False, 0.0, "agent did not execute meaningful actions"
    if note_count < 3:
        return False, 0.0, "insufficient navigation notes"

    confidence = 0.40
    confidence += 0.30 if status == "submitted" else 0.24
    if ai_actions_executed >= 8:
        confidence += 0.18
    elif ai_actions_executed >= 4:
        confidence += 0.12
    else:
        confidence += 0.08

    if note_count >= 10:
        confidence += 0.10
    elif note_count >= 6:
        confidence += 0.07
    else:
        confidence += 0.04

    if user_gates_triggered > 1:
        confidence -= 0.04
    if clarification_rounds > 0:
        confidence -= min(0.08, clarification_rounds * 0.03)
    if had_missing_required_block:
        confidence -= 0.08

    confidence = max(0.0, min(confidence, 0.99))
    should_write = confidence >= 0.72
    reason = (
        f"{'accepted' if should_write else 'rejected'} "
        f"(status={status}, confidence={confidence:.2f}, actions={ai_actions_executed}, notes={note_count})"
    )
    return should_write, confidence, reason


async def _maybe_open_linkedin_apply_destination(
    context,
    page,
    *,
    draft_id: str,
    capture_hook: Any = None,
    navigation_notes: list[str] | None = None,
):
    if page is None:
        return page
    current_url = _normalize_space(getattr(page, "url", ""))
    if "linkedin.com" not in current_url.lower():
        return page

    try:
        has_apply = await page.evaluate(
            """
            () => {
              const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
              return nodes.some((node) => {
                const text = String(node.textContent || '').toLowerCase();
                const aria = String(node.getAttribute('aria-label') || '').toLowerCase();
                return /(easy apply|apply now|apply)/i.test(text) || /(easy apply|apply now|apply)/i.test(aria);
              });
            }
            """
        )
    except Exception:
        has_apply = False
    if not has_apply:
        return page

    _progress_phase(draft_id, PHASE_LINKEDIN_HANDOFF)
    _progress_event(draft_id, "LinkedIn source detected. Opening Apply flow.")
    _chat_push_ai(
        draft_id,
        "I’m on LinkedIn and will open the Apply flow now, then continue on the destination form.",
    )
    if navigation_notes is not None:
        navigation_notes.append("Opened apply flow from LinkedIn job page.")

    before_page_ids = {id(p) for p in list(getattr(context, "pages", []) or [])}
    clicked = False
    selectors = [
        "button:has-text('Easy Apply')",
        "button:has-text('Apply now')",
        "button:has-text('Apply')",
        "a:has-text('Apply now')",
        "a:has-text('Apply')",
    ]
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.count() == 0:
                continue
            await locator.scroll_into_view_if_needed()
            await locator.click()
            clicked = True
            break
        except Exception:
            continue
    if not clicked:
        return page

    await _run_hook(capture_hook, "linkedin-apply-clicked")
    await page.wait_for_timeout(1200)

    # If LinkedIn opened a new tab for external apply, switch to that tab.
    new_pages = [p for p in list(getattr(context, "pages", []) or []) if id(p) not in before_page_ids]
    for candidate in reversed(new_pages):
        try:
            target_url = _normalize_space(getattr(candidate, "url", ""))
            if target_url and "linkedin.com" not in target_url.lower():
                await candidate.bring_to_front()
                _progress_event(draft_id, f"Switched to external application site: {target_url}")
                if navigation_notes is not None:
                    navigation_notes.append(f"External destination opened from LinkedIn: {target_url}")
                await _run_hook(capture_hook, "external-apply-opened")
                return candidate
        except Exception:
            continue

    # Same-tab handoff
    same_tab_url = _normalize_space(getattr(page, "url", ""))
    if same_tab_url and "linkedin.com" not in same_tab_url.lower():
        _progress_event(draft_id, f"LinkedIn Apply redirected in the same tab to: {same_tab_url}")
        if navigation_notes is not None:
            navigation_notes.append(f"LinkedIn apply redirected same tab to {same_tab_url}")
        await _run_hook(capture_hook, "external-apply-opened")
    else:
        _progress_event(
            draft_id,
            "Apply action stayed on LinkedIn (likely Easy Apply modal). Continuing in current page.",
        )
    return page


async def _handle_user_gates(
    draft_id: str,
    page,
    *,
    use_visible_browser: bool,
    capture_hook: Any = None,
) -> str:
    action, detail = await _inspect_user_gate(page)
    if action == USER_ACTION_NONE:
        _progress_clear_user_action(draft_id)
        return USER_ACTION_NONE

    if action in {USER_ACTION_LOGIN, USER_ACTION_ACCOUNT}:
        _progress_event(
            draft_id,
            "Login/account step detected. Continuing in autonomous mode with browser actions.",
            level="warn",
        )
        _chat_push_ai(
            draft_id,
            "I detected a login/account step and will continue operating automatically where possible.",
        )
        await _run_hook(capture_hook, "login-detected-autonomous")
        _progress_phase(draft_id, PHASE_FILLING)
        return action

    if action == USER_ACTION_RESUME_AUTOFILL:
        clicked_resume = await _click_resume_autofill_action(page)
        if clicked_resume:
            _progress_event(draft_id, f"Preferred resume autofill via '{clicked_resume}'.")
            _chat_push_ai(draft_id, f"I selected '{clicked_resume}' to prefer resume autofill.")
            await page.wait_for_timeout(1200)
            await _run_hook(capture_hook, "resume-autofill-clicked")
            _progress_phase(draft_id, PHASE_FILLING)
            return action

        _progress_event(
            draft_id,
            "Resume autofill option detected but direct click was not reliable; continuing autonomous fill.",
            level="debug",
        )
        clicked = await _click_progress_continue_button(page)
        if clicked:
            _progress_event(draft_id, f"Advanced to next application step via '{clicked}'.")
            await page.wait_for_timeout(900)
            await _run_hook(capture_hook, "resume-autofill-advanced")
        _progress_phase(draft_id, PHASE_FILLING)
        return action

    return action


async def _ensure_entered_application_form(
    draft_id: str,
    page,
    *,
    use_visible_browser: bool,
    capture_hook: Any = None,
    navigation_notes: list[str] | None = None,
) -> None:
    # Some ATS pages first show a job details page with an Apply CTA, not the form.
    # Enter the form before attempting fill.
    for _ in range(3):
        is_entry, cta_text = await _detect_apply_entry_state(page)
        if not is_entry:
            return

        clicked_label = await _click_apply_entry_action(page)
        if clicked_label:
            _progress_event(draft_id, f"Opened application form via '{clicked_label}'.")
            if navigation_notes is not None:
                navigation_notes.append(f"Clicked apply entry CTA: {clicked_label}")
            await page.wait_for_timeout(1200)
            await _run_hook(capture_hook, "opened-application-form")
            continue

        _progress_event(
            draft_id,
            f"Apply entry CTA still detected ({cta_text or 'Apply'}) but click was not reliable on this attempt. "
            "Continuing autonomously.",
            level="warn",
        )
        await _run_hook(capture_hook, "opened-application-form-autonomous-retry")
        await page.wait_for_timeout(800)
        return


async def _click_submit_button(page) -> None:
    submit_btn = page.get_by_role("button", name=re.compile("submit|apply|send", re.IGNORECASE)).first
    if await submit_btn.count() == 0:
        raise ValueError("Could not find submit button for final confirmation")
    await submit_btn.click()


async def _run_submission(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    click_submit: bool,
    use_visible_browser: bool = False,
    pause_for_manual_input_seconds: int = 0,
) -> dict[str, Any]:
    draft, job = _load_draft_and_job(draft_id, db_conn)
    _assert_can_submit(draft)
    _assert_daily_cap(db_conn)

    job_url = str(job.get("source_url") or "").strip()
    if not job_url:
        raise ValueError("Job source URL is required for submission")

    form_fields = _parse_json_list(draft.get("form_structure_json"))
    filled_answers = _parse_json_obj(draft.get("filled_answers_json"))

    playwright = None
    browser = None
    context = None
    page = None
    close_page = True
    close_context = True
    close_browser = True
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    screenshot_path = SCREENSHOT_DIR / f"{draft_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.png"
    live_screenshot_path = SCREENSHOT_DIR / f"{draft_id}-live.png"
    manual_pause_seconds = _normalize_manual_pause_seconds(pause_for_manual_input_seconds)
    run_mode = "visible_browser_cdp" if use_visible_browser else ("headless" if _should_launch_headless() else "headed")
    _progress_start(draft_id, mode=run_mode)
    _progress_phase(draft_id, PHASE_INIT)
    set_submission_guidance(draft_id, "")
    _progress_event(draft_id, f"Starting operator in {run_mode} mode.")

    # Derive site-specific state key so linkedin/indeed/greenhouse cookies stay separate
    _site_state_key = _site_key_from_url(job_url)
    site_domain = _site_domain_from_url(job_url) or _site_state_key
    site_playbook_notes = load_apply_playbook_notes(job_url)
    navigation_notes: list[str] = []
    run_status = "failed"
    ai_actions_executed = 0
    ai_action_step_counter = 0
    user_gates_triggered = 0
    clarification_rounds = 0
    had_missing_required_block = False
    repeatables_expanded = False
    run_profile_id = _normalize_space(draft.get("profile_id")) or _resolve_active_profile_id(db_conn)
    profile_row = _load_profile_row(db_conn, run_profile_id)

    async def _restore_visible_state() -> None:
        if context is None:
            return
        state = load_browser_storage_state(_site_state_key)
        cookies = state.get("cookies")
        if isinstance(cookies, list) and cookies:
            try:
                await context.add_cookies(cookies)
                _progress_event(draft_id, f"Loaded persisted {_site_state_key} login state.")
            except Exception:
                logger.debug("Could not restore persisted browser state", exc_info=True)

    async def _persist_visible_state() -> None:
        if context is None:
            return
        try:
            cookies = await context.cookies()
            if isinstance(cookies, list):
                save_browser_storage_state({"cookies": cookies}, _site_state_key)
                _progress_event(draft_id, f"Persisted {_site_state_key} login cookies.")
        except Exception:
            logger.debug("Could not persist visible browser state", exc_info=True)

    async def _capture_live_screenshot(label: str) -> None:
        if page is None:
            return
        try:
            await page.screenshot(path=str(live_screenshot_path), full_page=True)
            _progress_snapshot(draft_id, str(live_screenshot_path))
            _progress_event(draft_id, f"Captured browser snapshot ({label}).")
        except Exception:
            logger.debug("Live screenshot capture failed for %s", draft_id, exc_info=True)

    async def _set_phase(phase: str, label: str) -> None:
        _progress_phase(draft_id, phase)
        await _capture_live_screenshot(f"phase:{label}")

    try:
        playwright = await async_playwright().start()
        if use_visible_browser:
            cdp_endpoint = _cdp_endpoint()
            _progress_event(draft_id, f"Connecting to your Chrome browser via CDP ({cdp_endpoint}).")
            try:
                browser = await playwright.chromium.connect_over_cdp(cdp_endpoint)
            except Exception as cdp_exc:
                raise BrowserUnavailableError(
                    f"Could not connect to your Chrome browser at {cdp_endpoint}. "
                    "Start Chrome with remote debugging enabled:\n"
                    "  macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n"
                    "  Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n"
                    "If backend runs in Docker, set APPLICATION_CDP_ENDPOINT=http://host.docker.internal:9222. "
                    "If backend runs on your host directly, set APPLICATION_CDP_ENDPOINT=http://localhost:9222."
                ) from cdp_exc

            close_browser = False
            if browser.contexts:
                context = browser.contexts[0]
                close_context = False
                _progress_event(draft_id, "Attached to existing browser context.")
            else:
                context = await browser.new_context()
                close_context = True
                _progress_event(draft_id, "Created a new browser context.")
            await _restore_visible_state()
            page = await context.new_page()
            close_page = False
        else:
            user_data_dir = get_chrome_user_profile_dir()
            executable = get_chrome_executable_path()
            try:
                if user_data_dir:
                    # Launch with user's real Chrome profile — inherits all saved logins/sessions
                    _progress_event(draft_id, f"Launching Chrome with user profile from {user_data_dir}.")
                    launch_kwargs: dict[str, Any] = {
                        "headless": _should_launch_headless(),
                        "args": ["--no-first-run", "--no-default-browser-check", "--no-sandbox"],
                    }
                    if executable:
                        launch_kwargs["executable_path"] = executable
                    context = await playwright.chromium.launch_persistent_context(
                        user_data_dir,
                        **launch_kwargs,
                    )
                    browser = None
                    close_browser = False
                    close_context = True
                else:
                    # No Chrome profile found — use cookie injection fallback
                    _progress_event(draft_id, "No Chrome profile found; using managed Chromium with saved cookies.")
                    browser = await playwright.chromium.launch(headless=_should_launch_headless())
                    context = await browser.new_context()
                    await _restore_visible_state()
                    close_browser = True
                    close_context = True
            except Exception as exc:
                message = str(exc)
                if "Executable doesn't exist" in message:
                    raise BrowserUnavailableError(
                        "Playwright Chromium is missing in backend container. Rebuild backend image."
                    ) from exc
                if "Missing X server" in message or "missing x server" in message.lower():
                    raise BrowserUnavailableError(
                        "Headed browser launch is unavailable in this environment. "
                        "Set APPLICATION_BROWSER_HEADLESS=true."
                    ) from exc
                raise
            page = await context.new_page()
            close_page = True

        page.set_default_timeout(_action_timeout_ms())
        await _set_phase(PHASE_NAVIGATE, "navigate")
        _progress_event(draft_id, "Navigating to job page.")
        if site_playbook_notes:
            _progress_event(draft_id, f"Loaded apply playbook for {site_domain}.", level="debug")
            navigation_notes.append(f"Loaded site playbook notes for {site_domain}.")
        await asyncio.wait_for(
            page.goto(job_url, wait_until="domcontentloaded"),
            timeout=_submission_page_timeout_seconds(),
        )
        navigation_notes.append(f"Opened source URL: {job_url}")
        await _capture_live_screenshot("page-loaded")

        page = await _maybe_open_linkedin_apply_destination(
            context,
            page,
            draft_id=draft_id,
            capture_hook=_capture_live_screenshot,
            navigation_notes=navigation_notes,
        )
        await _ensure_entered_application_form(
            draft_id,
            page,
            use_visible_browser=use_visible_browser,
            capture_hook=_capture_live_screenshot,
            navigation_notes=navigation_notes,
        )
        first_gate = await _handle_user_gates(
            draft_id,
            page,
            use_visible_browser=use_visible_browser,
            capture_hook=_capture_live_screenshot,
        )
        if first_gate != USER_ACTION_NONE:
            user_gates_triggered += 1

        if use_visible_browser and manual_pause_seconds > 0:
            _progress_event(
                draft_id,
                (
                    f"Waiting {manual_pause_seconds}s for manual intervention "
                    "(you can type in the browser now)."
                ),
            )
            await page.wait_for_timeout(manual_pause_seconds * 1000)
            await _capture_live_screenshot("after-manual-pause")

        _progress_event(
            draft_id,
            "Skipping strict clarification gate; continuing with autonomous required-field filling.",
            level="debug",
        )

        if not repeatables_expanded:
            expand_clicks = await _expand_repeatable_profile_sections(page, profile_row)
            if expand_clicks > 0:
                repeatables_expanded = True
                _progress_event(
                    draft_id,
                    f"Expanded {expand_clicks} repeatable profile section(s) (work/education).",
                    level="debug",
                )
                await page.wait_for_timeout(700)
                await _capture_live_screenshot("after-expand-repeatables")

        await _set_phase(PHASE_FILLING, "fill-known")
        _progress_event(draft_id, "Filling known draft fields.")
        await _fill_known_fields(page, form_fields, filled_answers)
        await _capture_live_screenshot("after-known-fields")
        second_gate = await _handle_user_gates(
            draft_id,
            page,
            use_visible_browser=use_visible_browser,
            capture_hook=_capture_live_screenshot,
        )
        if second_gate != USER_ACTION_NONE:
            user_gates_triggered += 1

        await _set_phase(PHASE_AI_OPERATING, "ai-operating")

        async def _on_ai_action(action: dict[str, Any]) -> None:
            nonlocal ai_actions_executed, ai_action_step_counter
            desc = _describe_ai_action(action)
            navigation_notes.append(f"AI action: {desc}")
            ai_actions_executed += 1
            ai_action_step_counter += 1
            if ai_action_step_counter % 3 == 0:
                await _capture_live_screenshot(f"action:{desc}")

        await _run_ai_assisted_fill(
            page,
            job=job,
            form_fields=form_fields,
            answers=filled_answers,
            allow_submit_click=False,
            on_event=lambda msg: _progress_event(draft_id, msg),
            on_action_executed=_on_ai_action,
            guidance_provider=lambda: get_submission_guidance(draft_id),
            site_playbook_notes=site_playbook_notes,
        )
        third_gate = await _handle_user_gates(
            draft_id,
            page,
            use_visible_browser=use_visible_browser,
            capture_hook=_capture_live_screenshot,
        )
        if third_gate != USER_ACTION_NONE:
            user_gates_triggered += 1

        # Safety: do not mark run complete while still on an entry page with an Apply CTA.
        # Try one more time to enter the actual form before final review.
        await _ensure_entered_application_form(
            draft_id,
            page,
            use_visible_browser=use_visible_browser,
            capture_hook=_capture_live_screenshot,
            navigation_notes=navigation_notes,
        )

        progressed_label = await _click_progress_continue_button(page)
        if progressed_label:
            _progress_event(draft_id, f"Advanced wizard step using '{progressed_label}'.")
            navigation_notes.append(f"Clicked progress CTA: {progressed_label}")
            await page.wait_for_timeout(900)
            await _capture_live_screenshot("progressed-wizard-step")
            fourth_gate = await _handle_user_gates(
                draft_id,
                page,
                use_visible_browser=use_visible_browser,
                capture_hook=_capture_live_screenshot,
            )
            if fourth_gate != USER_ACTION_NONE:
                user_gates_triggered += 1

        fill_targets = await _detect_fill_targets(page)
        if fill_targets:
            changed_from_chat = _apply_chat_clarifications(
                draft_id,
                target_labels=fill_targets,
                answers=filled_answers,
                profile_id=run_profile_id,
                site_domain=site_domain,
            )
            if changed_from_chat:
                _progress_event(
                    draft_id,
                    f"Applied {changed_from_chat} clarification answer(s) from operator chat.",
                )
            autofilled_required = await _autofill_live_required_fields(
                page,
                missing_labels=fill_targets,
                answers=filled_answers,
                profile_id=run_profile_id,
                site_domain=site_domain,
                profile_row=profile_row,
                job=job,
            )
            if autofilled_required:
                labels = ", ".join(list(autofilled_required.keys())[:8])
                _progress_event(
                    draft_id,
                    f"Auto-filled {len(autofilled_required)} required field(s): {labels}.",
                )
                navigation_notes.append(
                    f"Auto-filled required fields: {', '.join(list(autofilled_required.keys())[:8])}"
                )
                await page.wait_for_timeout(500)
                await _capture_live_screenshot("after-required-autofill")
                fill_targets = await _detect_fill_targets(page)

        if fill_targets:
            had_missing_required_block = True
            pending_missing: list[str] = list(fill_targets)
            for attempt in range(1, 5):
                changed_from_chat = _apply_chat_clarifications(
                    draft_id,
                    target_labels=pending_missing,
                    answers=filled_answers,
                    profile_id=run_profile_id,
                    site_domain=site_domain,
                )
                if changed_from_chat:
                    _progress_event(
                        draft_id,
                        f"Autonomous retry {attempt}: applied {changed_from_chat} clarification answer(s).",
                        level="debug",
                    )
                retried = await _autofill_live_required_fields(
                    page,
                    missing_labels=pending_missing,
                    answers=filled_answers,
                    profile_id=run_profile_id,
                    site_domain=site_domain,
                    profile_row=profile_row,
                    job=job,
                )
                if retried:
                    _progress_event(
                        draft_id,
                        f"Autonomous retry {attempt}: filled {len(retried)} additional required field(s).",
                        level="debug",
                    )
                progressed = await _click_progress_continue_button(page)
                if progressed:
                    _progress_event(draft_id, f"Autonomous retry {attempt}: clicked '{progressed}'.", level="debug")
                    await page.wait_for_timeout(700)
                pending_missing = await _detect_fill_targets(page)
                if not pending_missing:
                    break

            if pending_missing:
                prompt_labels = ", ".join(pending_missing[:8])
                _progress_event(
                    draft_id,
                    "Proceeding with unresolved required fields after autonomous retries: "
                    + prompt_labels,
                    level="warn",
                )
                await _capture_live_screenshot("needs-clarification")
                _chat_push_ai(
                    draft_id,
                    "I still need your exact choices for: "
                    + prompt_labels
                    + ". Reply as `Field: value` (one per line), then type `continue`.",
                )
            await _capture_live_screenshot("after-required-fields-autonomous-retries")

        _progress_event(draft_id, "AI-assisted fill stage completed.")
        await _set_phase(PHASE_REVIEW, "review")
        await page.screenshot(path=str(screenshot_path), full_page=True)
        _progress_snapshot(draft_id, str(screenshot_path))
        _progress_event(draft_id, "Captured review screenshot for final confirmation.")

        if click_submit:
            await _set_phase(PHASE_SUBMITTING, "submitting")
            _progress_event(draft_id, "Attempting final submit click.")
            await _click_submit_button(page)
            _progress_finish(draft_id, status="submitted")
            run_status = "submitted"
            _chat_push_ai(draft_id, "✅ Application submitted successfully!")
            navigation_notes.append("Final submit clicked successfully.")
            return {
                "status": "submitted",
                "screenshot_path": str(screenshot_path),
                "mode": run_mode,
            }

        if use_visible_browser:
            # Keep the run alive until operator explicitly marks done.
            max_continue_cycles = _int_env(
                "APPLICATION_OPERATOR_CONTINUE_MAX_CYCLES",
                default=40,
                minimum=6,
                maximum=200,
            )
            cycle = 0
            while cycle < max_continue_cycles:
                decision = await _wait_for_user_action(
                    draft_id,
                    action=USER_ACTION_FINAL_REVIEW,
                    detail=(
                        "I can continue operating this application. "
                        "Type 'continue' to keep going, or type 'done' when you want to end this session."
                    ),
                    timeout_seconds=_user_action_wait_timeout_seconds(),
                    resolution_checker=None,
                    allow_timeout=True,
                    require_continue_ack=False,
                )
                if decision == "timeout":
                    _progress_event(
                        draft_id,
                        "No new operator input yet. Keeping browser session active.",
                        level="debug",
                    )
                    continue
                if decision == "done":
                    break
                if decision != "continue":
                    break

                cycle += 1
                _progress_event(draft_id, f"Operator requested continue cycle {cycle}.")
                await _set_phase(PHASE_AI_OPERATING, f"operator-continue-{cycle}")

                if not repeatables_expanded:
                    expand_clicks = await _expand_repeatable_profile_sections(page, profile_row)
                    if expand_clicks > 0:
                        repeatables_expanded = True
                        _progress_event(
                            draft_id,
                            f"Expanded {expand_clicks} repeatable profile section(s) (work/education).",
                            level="debug",
                        )
                        await page.wait_for_timeout(650)

                pre_missing = await _detect_fill_targets(page)
                if pre_missing:
                    changed_from_chat = _apply_chat_clarifications(
                        draft_id,
                        target_labels=pre_missing,
                        answers=filled_answers,
                        profile_id=run_profile_id,
                        site_domain=site_domain,
                    )
                    if changed_from_chat:
                        _progress_event(
                            draft_id,
                            f"Applied {changed_from_chat} operator-provided clarification value(s).",
                        )
                    pre_filled = await _autofill_live_required_fields(
                        page,
                        missing_labels=pre_missing,
                        answers=filled_answers,
                        profile_id=run_profile_id,
                        site_domain=site_domain,
                        profile_row=profile_row,
                        job=job,
                    )
                    if pre_filled:
                        _progress_event(
                            draft_id,
                            f"Cycle {cycle}: auto-filled {len(pre_filled)} field(s) before navigation.",
                            level="debug",
                        )
                        await page.wait_for_timeout(350)

                progressed_label = await _click_progress_continue_button(page)
                if progressed_label:
                    _progress_event(draft_id, f"Advanced wizard step using '{progressed_label}'.")
                    await page.wait_for_timeout(700)

                await _run_ai_assisted_fill(
                    page,
                    job=job,
                    form_fields=form_fields,
                    answers=filled_answers,
                    allow_submit_click=False,
                    on_event=lambda msg: _progress_event(draft_id, msg),
                    on_action_executed=_on_ai_action,
                    guidance_provider=lambda: get_submission_guidance(draft_id),
                    site_playbook_notes=site_playbook_notes,
                )

                missing_cycle = await _detect_fill_targets(page)
                if missing_cycle:
                    changed_from_chat = _apply_chat_clarifications(
                        draft_id,
                        target_labels=missing_cycle,
                        answers=filled_answers,
                        profile_id=run_profile_id,
                        site_domain=site_domain,
                    )
                    if changed_from_chat:
                        _progress_event(
                            draft_id,
                            f"Cycle {cycle}: applied {changed_from_chat} operator clarification value(s).",
                            level="debug",
                        )
                    cycle_filled = await _autofill_live_required_fields(
                        page,
                        missing_labels=missing_cycle,
                        answers=filled_answers,
                        profile_id=run_profile_id,
                        site_domain=site_domain,
                        profile_row=profile_row,
                        job=job,
                    )
                    if cycle_filled:
                        _progress_event(
                            draft_id,
                            f"Cycle {cycle}: auto-filled {len(cycle_filled)} additional field(s).",
                            level="debug",
                        )
                    await page.wait_for_timeout(450)
                    progressed_cycle = await _click_progress_continue_button(page)
                    if progressed_cycle:
                        _progress_event(draft_id, f"Advanced wizard step using '{progressed_cycle}'.")
                        await page.wait_for_timeout(650)
                    remaining_cycle = await _detect_fill_targets(page)
                    if remaining_cycle:
                        await _capture_live_screenshot(f"cycle-{cycle}-needs-answer")
                        _chat_push_ai(
                            draft_id,
                            "I still need your exact choices for: "
                            + ", ".join(remaining_cycle[:8])
                            + ". Reply as `Field: value`, then type `continue`.",
                        )

                await _capture_live_screenshot(f"operator-continue-{cycle}-result")

            if cycle >= max_continue_cycles:
                _progress_event(
                    draft_id,
                    f"Reached max continue cycles ({max_continue_cycles}). Waiting for your final review.",
                    level="warn",
                )
                _chat_push_ai(
                    draft_id,
                    "I reached the max background continue cycles for this run. "
                    "You can start another run to continue from here, or finalize this one.",
                )

        _progress_require_user_action(
            draft_id,
            USER_ACTION_FINAL_REVIEW,
            "Review the browser state and submit on your side when ready. Type 'done' to close this run.",
        )
        _progress_finish(draft_id, status="ready_for_final_approval")
        run_status = "ready_for_final_approval"
        _chat_push_ai(
            draft_id,
            "✅ I've finished filling the form. Please review the screenshot above — "
            "check that all fields look correct. Submit in your browser when ready, "
            "then confirm from the app (or use Final Submit if you want me to click it). "
            "Type here if anything needs fixing."
        )
        navigation_notes.append("Reached final review stage without clicking submit.")
        return {
            "status": "ready_for_final_approval",
            "screenshot_path": str(screenshot_path),
            "mode": run_mode,
        }
    except asyncio.TimeoutError as exc:
        _progress_event(draft_id, "Submission timed out.", level="error")
        _progress_finish(draft_id, status="failed", error="Timed out loading or operating on the job page")
        _chat_push_ai(draft_id, "❌ Timed out while loading or operating on the job page. Please try again.")
        raise ValueError("Timed out loading or operating on the job page") from exc
    except BrowserUnavailableError as exc:
        _progress_event(draft_id, str(exc), level="error")
        _progress_finish(draft_id, status="failed", error=str(exc))
        _chat_push_ai(draft_id, f"❌ Browser connection failed: {exc}")
        raise
    except Exception:
        _progress_event(draft_id, "Submission engine failed.", level="error")
        _progress_finish(draft_id, status="failed", error="Submission engine failed")
        _chat_push_ai(draft_id, "❌ Something went wrong during the application process. Check the agent log for details.")
        logger.exception("Submission engine failed for draft_id=%s", draft_id)
        raise
    finally:
        # Always persist cookies so next session reuses the login state
        await _persist_visible_state()
        if navigation_notes:
            try:
                playbook_notes = _summarize_navigation_notes(navigation_notes)
                should_write, confidence, decision_reason = _evaluate_playbook_memory_write(
                    run_status=run_status,
                    ai_actions_executed=ai_actions_executed,
                    note_count=len(playbook_notes),
                    user_gates_triggered=user_gates_triggered,
                    clarification_rounds=clarification_rounds,
                    had_missing_required_block=had_missing_required_block,
                )
                if should_write:
                    persisted = append_apply_playbook_notes_with_score(
                        job_url,
                        playbook_notes,
                        outcome=run_status,
                        confidence=confidence,
                        helpful=True,
                    )
                    if persisted:
                        _progress_event(
                            draft_id,
                            f"Saved apply memory for {site_domain} (confidence {confidence:.2f}).",
                            level="debug",
                        )
                else:
                    _progress_event(
                        draft_id,
                        f"Skipped apply memory update: {decision_reason}.",
                        level="debug",
                    )
            except Exception:
                logger.debug("Failed to persist apply playbook notes for %s", job_url, exc_info=True)
        if page is not None and close_page:
            await page.close()
        if context is not None and close_context:
            await context.close()
        if browser is not None and close_browser:
            await browser.close()
        if playwright is not None:
            await playwright.stop()


async def submit_application(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    use_visible_browser: bool = False,
    pause_for_manual_input_seconds: int = 0,
) -> dict[str, Any]:
    return await _run_submission(
        draft_id,
        db_conn,
        click_submit=False,
        use_visible_browser=use_visible_browser,
        pause_for_manual_input_seconds=pause_for_manual_input_seconds,
    )


async def confirm_submit_application(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    use_visible_browser: bool = False,
) -> dict[str, Any]:
    return await _run_submission(
        draft_id,
        db_conn,
        click_submit=True,
        use_visible_browser=use_visible_browser,
        pause_for_manual_input_seconds=0,
    )

import asyncio
import logging
from typing import Any

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)


SCAN_TIMEOUT_SECONDS = 15


def _normalize_type(raw_type: str) -> str:
    lowered = (raw_type or "").lower()
    if lowered in {"textarea"}:
        return "textarea"
    if lowered in {"select-one", "select-multiple", "select", "dropdown"}:
        return "dropdown"
    if lowered in {"checkbox"}:
        return "checkbox"
    if lowered in {"file"}:
        return "file"
    return "text"


async def analyze_form(job_url: str) -> list[dict[str, Any]]:
    """Read-only form scan. Never fills or submits."""
    if not job_url:
        return []

    browser = None
    context = None
    page = None
    playwright = None
    try:
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await asyncio.wait_for(page.goto(job_url, wait_until="domcontentloaded"), timeout=SCAN_TIMEOUT_SECONDS)

        handles = await page.query_selector_all(
            "input[type='text'], input[type='email'], textarea, select, input[type='file'], input[type='checkbox']"
        )
        fields: list[dict[str, Any]] = []
        seen_keys: set[tuple[str, str]] = set()

        for handle in handles:
            meta = await handle.evaluate(
                """
                (el) => {
                  const type = el.tagName.toLowerCase() === 'textarea'
                    ? 'textarea'
                    : el.tagName.toLowerCase() === 'select'
                      ? 'dropdown'
                      : (el.getAttribute('type') || 'text');

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

                  const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
                  const options = el.tagName.toLowerCase() === 'select'
                    ? Array.from(el.querySelectorAll('option'))
                        .map((opt) => (opt.textContent || '').trim())
                        .filter(Boolean)
                    : undefined;

                  return {
                    type,
                    label: (label || '').replace(/\\s+/g, ' ').trim(),
                    required,
                    options,
                  };
                }
                """
            )
            if not isinstance(meta, dict):
                continue

            field_type = _normalize_type(str(meta.get("type") or "text"))
            label = str(meta.get("label") or "").strip() or f"{field_type.title()} Field"
            key = (field_type, label.lower())
            if key in seen_keys:
                continue
            seen_keys.add(key)

            fields.append(
                {
                    "type": field_type,
                    "label": label,
                    "required": bool(meta.get("required", False)),
                    "options": meta.get("options"),
                }
            )

        return fields
    except (PlaywrightTimeoutError, TimeoutError, asyncio.TimeoutError):
        logger.exception("Form analyzer timed out for url=%s", job_url)
        return []
    except Exception:
        logger.exception("Form analyzer failed for url=%s", job_url)
        return []
    finally:
        if page is not None:
            await page.close()
        if context is not None:
            await context.close()
        if browser is not None:
            await browser.close()
        if playwright is not None:
            await playwright.stop()

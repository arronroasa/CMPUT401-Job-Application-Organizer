import asyncio
import json
import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote_plus

from playwright.async_api import async_playwright

from ...browser_cdp import (
    get_chrome_executable_path,
    get_chrome_user_profile_dir,
    load_browser_storage_state,
    normalize_cdp_endpoint,
    save_browser_storage_state,
)
from ....clients.gemini import get_gemini_client
from .base import JobSourceAdapter, RawJobData

logger = logging.getLogger(__name__)

_STATE_DIR = Path(__file__).resolve().parents[4] / "data" / "browser_state"
_DESCRIPTION_FORMAT_CACHE: dict[str, str] = {}


def _browser_headless() -> bool:
    value = os.environ.get("DISCOVERY_BROWSER_HEADLESS", "").strip().lower()
    return value in {"1", "true", "yes"}


def _manual_wait_ms() -> int:
    raw = os.environ.get("DISCOVERY_USER_ASSISTED_WAIT_SECONDS", "20").strip()
    try:
        seconds = int(raw)
    except ValueError:
        seconds = 20
    return max(seconds, 5) * 1000


def _discovery_cdp_endpoint() -> str:
    value = os.environ.get("DISCOVERY_BROWSER_CDP_ENDPOINT", "").strip()
    if value:
        return value
    return "http://host.docker.internal:9222"


def _discovery_visible_browser_default() -> bool:
    value = os.environ.get("DISCOVERY_USE_VISIBLE_BROWSER", "").strip().lower()
    if value in {"0", "false", "no"}:
        return False
    if value in {"1", "true", "yes"}:
        return True
    return True


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _clean_description_text(value: Any) -> str:
    raw = str(value or "").replace("\r", "\n")
    raw = re.sub(r"[ \t]+\n", "\n", raw)
    raw = re.sub(r"\n[ \t]+", "\n", raw)
    raw = re.sub(r"[ \t]{2,}", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()


def _extract_gemini_text(response: Any) -> str:
    text = str(getattr(response, "text", "") or "").strip()
    if text:
        return text
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        fragments: list[str] = []
        for part in parts:
            value = str(getattr(part, "text", "") or "").strip()
            if value:
                fragments.append(value)
        if fragments:
            return "\n".join(fragments).strip()
    return ""


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        parsed = json.loads(text[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return {}
    return {}


def _format_description_with_ai(text: str) -> str:
    cleaned = _clean_description_text(text)
    if len(cleaned) < 180:
        return cleaned

    flag = os.environ.get("DISCOVERY_AI_DESCRIPTION_FORMAT", "true").strip().lower()
    if flag in {"0", "false", "no"}:
        return cleaned

    cache_key = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
    cached = _DESCRIPTION_FORMAT_CACHE.get(cache_key)
    if cached:
        return cached

    client = get_gemini_client()
    if client is None:
        return cleaned

    prompt = (
        "You are cleaning extracted job description text from a browser page.\n"
        "Rewrite into clean plain text with short sections and bullets.\n"
        "Preserve all specific technologies/skills exactly as written (e.g. Python, C++, Node.js, FastAPI).\n"
        "Do not invent or drop requirements. Remove UI boilerplate and duplicated fragments.\n"
        "Return plain text only.\n\n"
        f"RAW_TEXT:\n{cleaned}"
    )
    try:
        response = client.generate_content(prompt)
        formatted = _clean_description_text(_extract_gemini_text(response))
        if formatted:
            _DESCRIPTION_FORMAT_CACHE[cache_key] = formatted
            return formatted
    except Exception:
        logger.debug("AI formatting failed; using raw cleaned description", exc_info=True)
    return cleaned


def _absolute_url(base: str, href: str) -> str:
    candidate = href.strip()
    if not candidate:
        return ""
    if candidate.startswith("http://") or candidate.startswith("https://"):
        return candidate
    if candidate.startswith("/"):
        return f"{base}{candidate}"
    return f"{base}/{candidate}"


class _UserAssistedBrowserAdapter(JobSourceAdapter):
    site_name: str = ""
    base_url: str = ""
    search_template: str = ""
    source_label: str = ""
    last_error: str | None = None

    def __init__(
        self,
        *,
        use_visible_browser: bool | None = None,
        cdp_endpoint: str | None = None,
        manual_wait_seconds: int | None = None,
        event_hook: Callable[[str, str], None] | None = None,
        guidance_provider: Callable[[], str] | None = None,
        stop_requested: Callable[[], bool] | None = None,
        use_ai_navigator: bool = False,
    ) -> None:
        self.use_visible_browser = (
            _discovery_visible_browser_default() if use_visible_browser is None else bool(use_visible_browser)
        )
        raw_endpoint = (
            cdp_endpoint.strip()
            if isinstance(cdp_endpoint, str) and cdp_endpoint.strip()
            else _discovery_cdp_endpoint()
        )
        self.cdp_endpoint = normalize_cdp_endpoint(raw_endpoint)
        if manual_wait_seconds is None:
            self.manual_wait_ms = _manual_wait_ms()
        else:
            try:
                seconds = int(manual_wait_seconds)
            except (TypeError, ValueError):
                seconds = 20
            self.manual_wait_ms = max(5, min(seconds, 180)) * 1000
        self._event_hook = event_hook
        self._guidance_provider = guidance_provider
        self._stop_requested = stop_requested
        self._use_ai_navigator = bool(use_ai_navigator)

    def _emit_event(self, message: str, *, level: str = "info") -> None:
        hook = self._event_hook
        if hook is None:
            return
        text = _clean_text(message)
        if not text:
            return
        try:
            hook(text, level)
        except Exception:
            logger.debug("Discovery event hook failed", exc_info=True)

    def _latest_guidance(self) -> str:
        provider = self._guidance_provider
        if provider is None:
            return ""
        try:
            return _clean_text(provider())
        except Exception:
            logger.debug("Discovery guidance provider failed", exc_info=True)
            return ""

    def _should_stop(self) -> bool:
        check = self._stop_requested
        if check is None:
            return False
        try:
            return bool(check())
        except Exception:
            logger.debug("Discovery stop callback failed", exc_info=True)
            return False

    def _state_file(self) -> Path:
        _STATE_DIR.mkdir(parents=True, exist_ok=True)
        return _STATE_DIR / f"{self.site_name}.json"

    def _build_search_url(self, query: str) -> str:
        return self.search_template.format(query=quote_plus(query))

    async def _extract_rows(self, page) -> list[dict[str, str]]:  # pragma: no cover - adapter specific
        raise NotImplementedError

    def _format_description(self, text: str) -> str:
        return _clean_description_text(text)

    async def _resolve_control_page(self, context) -> tuple[Any, bool]:
        """
        Prefer the currently visible tab in user's Chrome so they can watch AI actions.
        Returns (page, close_page_when_done).
        """
        pages = list(getattr(context, "pages", []) or [])
        for candidate in reversed(pages):
            try:
                state = await candidate.evaluate("() => document.visibilityState")
                if state == "visible":
                    return candidate, False
            except Exception:
                continue
        if pages:
            return pages[-1], False
        page = await context.new_page()
        return page, True

    async def _pick_visible_context(self, browser) -> tuple[Any, bool]:
        """
        Pick the browser context that corresponds to the currently visible user window.
        Returns (context, close_context_when_done).
        """
        try:
            contexts = list(getattr(browser, "contexts", []) or [])
        except Exception:
            contexts = []
        for candidate_context in contexts:
            pages = list(getattr(candidate_context, "pages", []) or [])
            for candidate_page in reversed(pages):
                try:
                    state = await candidate_page.evaluate("() => document.visibilityState")
                    if state == "visible":
                        return candidate_context, False
                except Exception:
                    continue
        if contexts:
            ranked = sorted(
                contexts,
                key=lambda ctx: len(list(getattr(ctx, "pages", []) or [])),
                reverse=True,
            )
            return ranked[0], False
        return await browser.new_context(), True

    async def _scroll_visible_results(self, page) -> bool:
        """
        Scroll site-specific results panes first; fallback to page scroll.
        Returns True if an in-page scroll container was moved.
        """
        return bool(
            await page.evaluate(
                """
                () => {
                  const selectors = [
                    '.jobs-search-results-list',
                    '.scaffold-layout__list-container',
                    '.scaffold-layout__list',
                    '[data-testid="jobsearch-ResultsList"]',
                    '#mosaic-provider-jobcards',
                    '.jobsearch-LeftPane',
                  ];
                  for (const selector of selectors) {
                    const node = document.querySelector(selector);
                    if (!node) continue;
                    const el = node;
                    const scrollable = el.scrollHeight > el.clientHeight + 40;
                    if (!scrollable) continue;
                    const before = el.scrollTop;
                    const delta = Math.max(700, Math.floor(el.clientHeight * 0.9));
                    el.scrollTop = before + delta;
                    if (el.scrollTop !== before) return true;
                  }
                  window.scrollBy(0, 900);
                  return false;
                }
                """
            )
        )

    async def _discover_rows(
        self,
        page,
        query: str,
        max_results: int,
        on_rows_progress: Callable[[list[dict[str, str]]], None] | None = None,
    ) -> list[dict[str, str]]:
        last_guidance = ""
        prev_count = 0
        stale_scrolls = 0
        rows: list[dict[str, str]] = []
        scroll_pause_ms = 450 if self.use_visible_browser else 320

        for attempt in range(10):  # hard ceiling of 10 scrolls
            if self._should_stop():
                self.last_error = "Search stopped by operator request."
                self._emit_event("Stopping search because operator requested stop/cancel.", level="warn")
                return []
            guidance = self._latest_guidance()
            if guidance and guidance != last_guidance:
                last_guidance = guidance
                self._emit_event(f"Applying operator guidance: {guidance[:200]}")
            if attempt == 0 or attempt % 2 == 0:
                self._emit_event(f"Scanning results pass {attempt + 1}/10.", level="debug")

            await page.bring_to_front()
            moved_container = await self._scroll_visible_results(page)
            if not moved_container:
                await page.mouse.wheel(0, 1200)
            await page.wait_for_timeout(scroll_pause_ms)
            rows = await self._extract_rows(page)
            if on_rows_progress is not None and rows:
                try:
                    on_rows_progress(rows)
                except Exception:
                    logger.debug("Discovery rows progress callback failed", exc_info=True)
            if len(rows) and len(rows) != prev_count:
                self._emit_event(
                    f"Observed {len(rows)} candidate rows on {self.site_name.title()} so far.",
                    level="debug",
                )
            if len(rows) >= max_results:
                break
            if len(rows) == prev_count:
                stale_scrolls += 1
                if stale_scrolls >= 3:
                    break  # no new rows loading — relevance exhausted
            else:
                stale_scrolls = 0
            prev_count = len(rows)

        if not rows:
            rows = await self._extract_rows(page)
            if on_rows_progress is not None and rows:
                try:
                    on_rows_progress(rows)
                except Exception:
                    logger.debug("Discovery rows progress callback failed", exc_info=True)
        return rows

    def _rows_to_raw_jobs(self, rows: list[dict[str, str]], max_results: int) -> list[RawJobData]:
        parsed: list[RawJobData] = []
        for row in rows:
            source_url = _clean_text(row.get("source_url"))
            if not source_url:
                continue
            title = _clean_text(row.get("title"))
            if not title:
                desc_head = str(row.get("description") or "").strip().splitlines()
                if desc_head:
                    title = _clean_text(desc_head[0])
            if not title:
                title = f"{self.site_name.title()} Role"
            parsed.append(
                RawJobData(
                    title=title,
                    company=_clean_text(row.get("company")) or self.site_name.title(),
                    location=_clean_text(row.get("location")) or "Remote",
                    description=self._format_description(str(row.get("description") or "")),
                    source_url=_absolute_url(self.base_url, source_url),
                    source=self.source_label,
                    posted_date=_clean_text(row.get("posted_date")) or None,
                )
            )
            if len(parsed) >= max_results:
                break
        return parsed[:max_results]

    async def search(
        self,
        query: str,
        max_results: int = 20,
        on_parsed_progress: Callable[[list[RawJobData]], None] | None = None,
    ) -> list[RawJobData]:
        self.last_error = None
        if not query.strip():
            return []

        state_file = self._state_file()
        context_state: str | None = str(state_file) if state_file.exists() else None
        search_url = self._build_search_url(query)
        wait_ms = self.manual_wait_ms

        playwright = None
        browser = None
        context = None
        page = None
        close_browser = True
        close_context = True
        close_page = True
        emitted_urls: set[str] = set()

        def _emit_parsed_progress(rows: list[dict[str, str]]) -> None:
            if on_parsed_progress is None or not rows:
                return
            try:
                parsed_rows = self._rows_to_raw_jobs(rows, max_results)
            except Exception:
                logger.debug("Discovery row parsing for progress failed", exc_info=True)
                return
            if not parsed_rows:
                return
            batch: list[RawJobData] = []
            for job in parsed_rows:
                source_url = _clean_text(getattr(job, "source_url", ""))
                if not source_url or source_url in emitted_urls:
                    continue
                emitted_urls.add(source_url)
                batch.append(job)
            if not batch:
                return
            try:
                on_parsed_progress(batch)
            except Exception:
                logger.debug("Discovery parsed progress callback failed", exc_info=True)

        async def _restore_visible_state() -> None:
            if context is None:
                return
            # Use site-specific key so linkedin/indeed sessions are stored separately
            state = load_browser_storage_state(self.site_name)
            cookies = state.get("cookies")
            if isinstance(cookies, list) and cookies:
                await context.add_cookies(cookies)

        async def _persist_visible_state() -> None:
            if context is None:
                return
            cookies = await context.cookies()
            if isinstance(cookies, list):
                save_browser_storage_state({"cookies": cookies}, self.site_name)

        try:
            self._emit_event(
                f"Thinking: open {self.site_name.title()} and search for '{query.strip()}' in your connected browser."
            )
            playwright = await async_playwright().start()

            if self.use_visible_browser:
                try:
                    browser = await playwright.chromium.connect_over_cdp(self.cdp_endpoint)
                except Exception as cdp_exc:
                    raise RuntimeError(
                        f"Could not connect to your Chrome browser at {self.cdp_endpoint}. "
                        "Start Chrome with remote debugging enabled:\n"
                        '  macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n'
                        '  Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n'
                        "If backend runs in Docker, set DISCOVERY_BROWSER_CDP_ENDPOINT=http://host.docker.internal:9222. "
                        "If backend runs on your host directly, set DISCOVERY_BROWSER_CDP_ENDPOINT=http://localhost:9222."
                    ) from cdp_exc
                self._emit_event("Connected to your local Chrome CDP session.")
                close_browser = False
                context, close_context = await self._pick_visible_context(browser)
                tabs_count = len(list(getattr(context, "pages", []) or []))
                self._emit_event(f"Attached to browser context ({tabs_count} existing tab(s)).", level="debug")
                await _restore_visible_state()
            else:
                user_data_dir = get_chrome_user_profile_dir()
                executable = get_chrome_executable_path()
                if user_data_dir:
                    # Launch with the user's real Chrome profile — keeps all saved logins/sessions
                    launch_kwargs: dict[str, Any] = {
                        "headless": _browser_headless(),
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
                    # Fall back to cookie-injection mode (no Chrome profile found)
                    browser = await playwright.chromium.launch(headless=_browser_headless())
                    context_kwargs: dict[str, Any] = {}
                    if context_state:
                        context_kwargs["storage_state"] = context_state
                    context = await browser.new_context(**context_kwargs)
                    close_browser = True
                    close_context = True

            if context is None:
                raise RuntimeError("Could not create browser context for discovery.")
            self._emit_event("Browser context ready. Navigating to search results.")
            if self.use_visible_browser:
                page = await context.new_page()
                close_page = False
                self._emit_event("Opened a new visible tab for AI discovery.")
            else:
                page = await context.new_page()
                close_page = True

            await page.bring_to_front()

            logger.info(
                "User-assisted discovery opening %s. Complete login/search review in browser (%ds).",
                self.site_name,
                wait_ms // 1000,
            )
            self._emit_event(f"Opening {self.site_name.title()} results page.")

            try:
                await asyncio.wait_for(page.goto(search_url, wait_until="domcontentloaded"), timeout=35)
            except asyncio.TimeoutError:
                self._emit_event(
                    "Search page load timed out on domcontentloaded; retrying with lightweight load.",
                    level="warn",
                )
                await page.goto(search_url, wait_until="commit")
            self._emit_event(
                f"Page loaded. Waiting {wait_ms // 1000}s for login checks and dynamic content before extraction."
            )
            await page.wait_for_timeout(wait_ms)

            rows = await self._discover_rows(
                page,
                query.strip(),
                max_results,
                on_rows_progress=_emit_parsed_progress if on_parsed_progress is not None else None,
            )
            if on_parsed_progress is not None and rows:
                _emit_parsed_progress(rows)
            self._emit_event(f"Extracted {len(rows)} raw rows from {self.site_name.title()}.")
            parsed = self._rows_to_raw_jobs(rows, max_results)

            # Persist session state keyed by site name so linkedin/indeed don't overwrite each other
            if close_context:
                await context.storage_state(path=str(state_file))
            self._emit_event(f"Parsed {len(parsed)} jobs for {self.site_name.title()}.")
            return parsed[:max_results]
        except Exception as exc:
            self.last_error = str(exc)
            self._emit_event(f"{self.site_name.title()} search failed: {self.last_error}", level="error")
            logger.exception("User-assisted %s discovery failed for query=%s", self.site_name, query)
            return []
        finally:
            if self.use_visible_browser:
                try:
                    await _persist_visible_state()
                except Exception:
                    logger.debug("Could not persist browser discovery state", exc_info=True)
            if page is not None and close_page:
                await page.close()
            if context is not None and close_context:
                await context.close()
            if browser is not None and close_browser:
                await browser.close()
            if playwright is not None:
                await playwright.stop()


class LinkedInUserAssistedAdapter(_UserAssistedBrowserAdapter):
    site_name = "linkedin"
    base_url = "https://www.linkedin.com"
    search_template = "https://www.linkedin.com/jobs/search/?keywords={query}"
    source_label = "linkedin_browser"

    def _format_description(self, text: str) -> str:
        return _format_description_with_ai(text)

    async def _read_cached_rows(self, page) -> list[dict[str, str]]:
        try:
            rows = await page.evaluate(
                """
                () => {
                  const cache = window.__onFileLinkedInRowCache || {};
                  return Object.values(cache);
                }
                """
            )
        except Exception:
            return []
        if not isinstance(rows, list):
            return []
        return [item for item in rows if isinstance(item, dict)]

    async def _snapshot_visible_cards(self, page) -> list[dict[str, str]]:
        # NOTE (2026): LinkedIn's job rows are no longer <a href="/jobs/view/...">
        # elements with semantic BEM class names. They ship atomic/hashed CSS
        # classes (e.g. "_006c53c9") that regenerate on every deploy, and each
        # row is now a non-anchor `[role=button]` div identified by a stable
        # `componentkey="job-card-component-ref-<jobId>"` attribute instead.
        # We key off that attribute (confirmed live against linkedin.com) and
        # synthesize the /jobs/view/<id>/ href ourselves rather than reading it
        # off an anchor that usually doesn't exist for unselected rows.
        cards = await page.evaluate(
            """
            () => {
              const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
              const dedupeDoubled = (value) => {
                // LinkedIn concatenates an sr-only "Selected, " prefix and a
                // "(Verified job)" badge with a visually-duplicated title, e.g.
                // "Selected, X (Verified job)X". Stripping the marker text can
                // leave a single stray space between the two copies, so try
                // both a 0-char and 1-char separator when checking for the
                // duplicate half rather than requiring an even-length exact
                // concatenation.
                const text = clean(
                  clean(value)
                    .replace(/^Selected,\\s*/i, '')
                    .replace(/\\(Verified job\\)/gi, '')
                );
                const len = text.length;
                for (const sep of [0, 1]) {
                  const half = (len - sep) / 2;
                  if (!Number.isInteger(half) || half <= 0) continue;
                  const first = text.slice(0, half);
                  const second = text.slice(half + sep);
                  if (first && first === second) return first;
                }
                return text;
              };
              const isNoise = (text) =>
                /^[•·]$/.test(text) ||
                /^\\$[\\d,.]+K?\\/?(yr|hr)/i.test(text) ||
                /^(viewed|promoted|easy apply|\\d+\\s*applicants?)$/i.test(text) ||
                /benefit$/i.test(text) ||
                /\\bago\\b/i.test(text);

              const nodes = Array.from(
                document.querySelectorAll('[componentkey^="job-card-component-ref-"]')
              );
              // Each job id can render more than once in the DOM (e.g. a hidden
              // duplicate) — dedupe by id, keep first occurrence.
              const byId = new Map();
              for (const node of nodes) {
                const match = (node.getAttribute('componentkey') || '').match(
                  /job-card-component-ref-(\\d+)/
                );
                if (!match) continue;
                if (!byId.has(match[1])) byId.set(match[1], node);
              }

              const out = [];
              for (const [id, card] of byId) {
                const href = `https://www.linkedin.com/jobs/view/${id}/`;
                const paragraphs = Array.from(card.querySelectorAll('p'))
                  .map((p) => clean(p.textContent))
                  .filter(Boolean)
                  .filter((text) => !isNoise(text));
                const title = paragraphs[0] ? dedupeDoubled(paragraphs[0]) : '';
                const company = paragraphs[1] || '';
                const location = paragraphs[2] || '';
                out.push({ href, title, company, location });
                if (out.length >= 120) break;
              }
              return out;
            }
            """
        )
        if not isinstance(cards, list):
            return []
        return [item for item in cards if isinstance(item, dict)]

    async def _open_card_by_href(self, page, href: str) -> bool:
        target = _clean_text(href)
        if not target:
            return False
        try:
            return bool(
                await page.evaluate(
                    """
                    (targetHref) => {
                      const idMatch = String(targetHref || '').match(/\\/jobs\\/view\\/(\\d+)/);
                      const jobId = idMatch ? idMatch[1] : '';

                      // Preferred (2026 markup): non-anchor [role=button] row
                      // tagged componentkey="job-card-component-ref-<id>".
                      if (jobId) {
                        const card = document.querySelector(
                          `[componentkey="job-card-component-ref-${jobId}"]`
                        );
                        if (card) {
                          const clickable =
                            card.matches('[role="button"]')
                              ? card
                              : card.closest('[role="button"]') || card;
                          clickable.scrollIntoView({ block: 'center', behavior: 'instant' });
                          ['mousedown', 'mouseup', 'click'].forEach((type) => {
                            clickable.dispatchEvent(
                              new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
                            );
                          });
                          return true;
                        }
                      }

                      // Fallback: older LinkedIn markup used a plain <a href>.
                      const normHref = (value) => {
                        const raw = String(value || '').trim();
                        if (!raw) return '';
                        try {
                          const u = new URL(raw, window.location.origin);
                          return `${u.origin}${u.pathname}`;
                        } catch {
                          return raw.split('?')[0];
                        }
                      };
                      const target = normHref(targetHref);
                      if (!target) return false;
                      const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
                      const matched = anchors.find((a) => normHref(a.getAttribute('href') || '') === target);
                      if (!matched) return false;
                      matched.scrollIntoView({ block: 'center', behavior: 'instant' });
                      // Dispatch a real mouse click sequence so LinkedIn's React
                      // event handlers fire (JS .click() alone sometimes misses them)
                      ['mousedown', 'mouseup', 'click'].forEach((type) => {
                        matched.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                      });
                      return true;
                    }
                    """,
                    target,
                )
            )
        except Exception:
            return False

    async def _scroll_visible_results(self, page) -> bool:
        """
        LinkedIn's list-container class names are hashed/build-generated and
        change across deploys, so rather than hardcoding a selector, find the
        nearest scrollable ancestor of an actual job card at runtime and
        scroll that. Falls back to the shared class-based/window scroll if no
        card is on the page yet (e.g. before first render).
        """
        moved = await page.evaluate(
            """
            () => {
              const card = document.querySelector('[componentkey^="job-card-component-ref-"]');
              if (!card) return null;
              let node = card.parentElement;
              for (let i = 0; i < 12 && node; i++, node = node.parentElement) {
                const style = getComputedStyle(node);
                const scrollable =
                  node.scrollHeight > node.clientHeight + 40 && /(auto|scroll)/.test(style.overflowY);
                if (!scrollable) continue;
                const before = node.scrollTop;
                const delta = Math.max(700, Math.floor(node.clientHeight * 0.9));
                node.scrollTop = before + delta;
                return node.scrollTop !== before;
              }
              return null;
            }
            """
        )
        if moved is not None:
            return bool(moved)
        return await super()._scroll_visible_results(page)

    async def _capture_active_detail(self, page, target_href: str) -> dict[str, str] | None:
        """
        Capture job details from LinkedIn's right-side detail panel.

        Finds the card anchor by href, then reads the detail panel content.
        The card anchor gives us title/company/location from the left list.
        The detail panel gives us the full description from the right pane.
        """
        data = await page.evaluate(
            """
            (targetHref) => {
              const normHref = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return '';
                try {
                  const u = new URL(raw, window.location.origin);
                  return `${u.origin}${u.pathname}`;
                } catch {
                  return raw.split('?')[0];
                }
              };
              const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
              const cleanText = (value) => String(value || '').replace(/\\r/g, '\\n').replace(/[ \\t]+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
              const cache = window.__onFileLinkedInRowCache || (window.__onFileLinkedInRowCache = {});

              const targetNorm = normHref(targetHref);

              // Find the card for this href. Preferred (2026 markup): the
              // componentkey="job-card-component-ref-<id>" row (see
              // _snapshot_visible_cards for why). Fall back to the older
              // <a href="/jobs/view/..."> markup for resilience.
              const idMatch = String(targetHref || '').match(/\\/jobs\\/view\\/(\\d+)/);
              const jobId = idMatch ? idMatch[1] : '';
              const card = jobId
                ? document.querySelector(`[componentkey="job-card-component-ref-${jobId}"]`)
                : null;
              const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
              const anchor = anchors.find((a) => normHref(a.getAttribute('href') || '') === targetNorm) || null;
              const legacyCard = anchor?.closest('li, article, [data-occludable-job-id]');

              const dedupeDoubled = (value) => {
                // LinkedIn concatenates an sr-only "Selected, " prefix and a
                // "(Verified job)" badge with a visually-duplicated title, e.g.
                // "Selected, X (Verified job)X". Stripping the marker text can
                // leave a single stray space between the two copies, so try
                // both a 0-char and 1-char separator when checking for the
                // duplicate half rather than requiring an even-length exact
                // concatenation.
                const text = clean(
                  clean(value)
                    .replace(/^Selected,\\s*/i, '')
                    .replace(/\\(Verified job\\)/gi, '')
                );
                const len = text.length;
                for (const sep of [0, 1]) {
                  const half = (len - sep) / 2;
                  if (!Number.isInteger(half) || half <= 0) continue;
                  const first = text.slice(0, half);
                  const second = text.slice(half + sep);
                  if (first && first === second) return first;
                }
                return text;
              };
              const isNoise = (text) =>
                /^[•·]$/.test(text) ||
                /^\\$[\\d,.]+K?\\/?(yr|hr)/i.test(text) ||
                /^(viewed|promoted|easy apply|\\d+\\s*applicants?)$/i.test(text) ||
                /benefit$/i.test(text) ||
                /\\bago\\b/i.test(text);
              const cardParagraphs = card
                ? Array.from(card.querySelectorAll('p'))
                    .map((p) => clean(p.textContent))
                    .filter(Boolean)
                    .filter((text) => !isNoise(text))
                : [];

              // href to use as key — always the target
              const href = targetNorm;
              if (!href) return null;

              // Title: detail panel first (most accurate), then card
              const title = clean(
                document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.textContent ||
                document.querySelector('.job-details-jobs-unified-top-card__job-title a')?.textContent ||
                document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent ||
                document.querySelector('.jobs-unified-top-card__job-title h1')?.textContent ||
                document.querySelector('.jobs-unified-top-card__job-title')?.textContent ||
                document.querySelector('a.job-card-list__title--link[aria-current="true"]')?.textContent ||
                (cardParagraphs[0] ? dedupeDoubled(cardParagraphs[0]) : '') ||
                anchor?.getAttribute('aria-label') ||
                anchor?.textContent ||
                legacyCard?.querySelector('.job-card-list__title')?.textContent ||
                ''
              );

              // Company: detail panel, then card
              const company = clean(
                document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.textContent ||
                document.querySelector('.job-details-jobs-unified-top-card__company-name')?.textContent ||
                document.querySelector('.jobs-unified-top-card__company-name a')?.textContent ||
                document.querySelector('.jobs-unified-top-card__company-name')?.textContent ||
                cardParagraphs[1] ||
                legacyCard?.querySelector('.artdeco-entity-lockup__subtitle')?.textContent ||
                legacyCard?.querySelector('.job-card-container__company-name')?.textContent ||
                ''
              );

              // Location: detail panel, then card
              const location = clean(
                document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.textContent ||
                document.querySelector('.jobs-unified-top-card__bullet')?.textContent ||
                document.querySelector('.tvm__text')?.textContent ||
                cardParagraphs[2] ||
                legacyCard?.querySelector('.job-card-container__metadata-item')?.textContent ||
                legacyCard?.querySelector('.artdeco-entity-lockup__caption')?.textContent ||
                ''
              );

              const date = clean(
                document.querySelector('.jobs-unified-top-card__posted-date')?.textContent ||
                legacyCard?.querySelector('time')?.textContent ||
                ''
              );

              // Description: right-side detail panel only
              const descNodes = [
                document.querySelector('.jobs-description-content__text'),
                document.querySelector('.jobs-box__html-content'),
                document.querySelector('.jobs-description__content'),
                document.querySelector('.jobs-description'),
                document.querySelector('.jobs-search__job-details--wrapper'),
                document.querySelector('.jobs-details__main-content'),
              ];
              let description = '';
              for (const node of descNodes) {
                const text = cleanText(node?.innerText || '');
                if (text && text.length > 80) { description = text; break; }
              }

              // Merge with any previously cached data for this href
              const prev = cache[href] || {};
              cache[href] = {
                title: title || prev.title || '',
                company: company || prev.company || '',
                location: location || prev.location || '',
                description: description || prev.description || '',
                source_url: href,
                posted_date: date || prev.posted_date || '',
              };
              return cache[href];
            }
            """,
            target_href,
        )
        if isinstance(data, dict):
            return data
        return None

    async def _plan_navigation_action(
        self,
        client: Any | None,
        *,
        query: str,
        turn: int,
        max_results: int,
        captured_count: int,
        seen_count: int,
        stale_turns: int,
        candidates: list[dict[str, str]],
        guidance: str,
    ) -> dict[str, str]:
        unseen = []
        seen_urls: set[str] = set()
        for card in candidates:
            href = _clean_text(card.get("href"))
            if href and href not in seen_urls:
                seen_urls.add(href)
                unseen.append(card)

        if not unseen:
            return {"action": "scroll"}
        if client is None:
            return {"action": "open_card", "href": _clean_text(unseen[0].get("href"))}

        prompt = (
            "You are an autonomous browser navigator for LinkedIn job search.\n"
            "Choose exactly one next action as JSON only.\n"
            "Allowed actions:\n"
            "{\"action\":\"open_card\",\"href\":\"<one href from visible_cards>\"}\n"
            "{\"action\":\"scroll\"}\n"
            "{\"action\":\"done\",\"reason\":\"short reason\"}\n"
            "Rules:\n"
            "- Prefer opening unseen visible cards before scrolling.\n"
            "- Never invent href; use a href from visible_cards.\n"
            "- Use done only when list appears exhausted or captured_count reached target.\n\n"
            f"query: {json.dumps(query)}\n"
            f"turn: {turn}\n"
            f"target_results: {max_results}\n"
            f"captured_count: {captured_count}\n"
            f"seen_count: {seen_count}\n"
            f"stale_turns: {stale_turns}\n"
            f"operator_guidance: {json.dumps(guidance or '')}\n"
            f"visible_cards: {json.dumps(unseen[:12])}\n"
        )
        try:
            response = await asyncio.to_thread(client.generate_content, prompt)
            payload = _extract_json_object(_extract_gemini_text(response))
            action = _clean_text(payload.get("action")).lower()
            if action == "open_card":
                href = _clean_text(payload.get("href"))
                if href:
                    return {"action": "open_card", "href": href}
            if action == "done":
                return {"action": "done", "reason": _clean_text(payload.get("reason")) or "done"}
            if action == "scroll":
                return {"action": "scroll"}
        except Exception:
            logger.debug("LinkedIn AI navigator planning failed", exc_info=True)
        return {"action": "open_card", "href": _clean_text(unseen[0].get("href"))}

    async def _discover_rows(
        self,
        page,
        query: str,
        max_results: int,
        on_rows_progress: Callable[[list[dict[str, str]]], None] | None = None,
    ) -> list[dict[str, str]]:
        if not self._use_ai_navigator:
            self._emit_event("Deterministic Playwright navigator active for LinkedIn search.")
            seen_hrefs: set[str] = set()
            failed_hrefs: dict[str, int] = {}
            stale_turns = 0
            max_turns = max(24, min(200, max_results * 2))

            for turn in range(1, max_turns + 1):
                if self._should_stop():
                    self.last_error = "Search stopped by operator request."
                    self._emit_event("Stopping search because operator requested stop/cancel.", level="warn")
                    break

                await page.bring_to_front()
                candidates = await self._snapshot_visible_cards(page)
                guidance = self._latest_guidance()
                if guidance:
                    self._emit_event(f"Applying operator guidance: {guidance[:180]}", level="debug")

                cached_rows = await self._read_cached_rows(page)
                if len(cached_rows) >= max_results:
                    break

                captured_in_turn = 0
                tried_this_turn: set[str] = set()
                for card in candidates:
                    href = _clean_text(card.get("href"))
                    if not href or href in seen_hrefs or href in tried_this_turn:
                        continue
                    # Only skip if tried in this turn already — do NOT permanently blacklist
                    # across turns based on failed_hrefs count, so every card gets a fresh
                    # chance each turn (LinkedIn sometimes needs a second click to load).
                    tried_this_turn.add(href)
                    opened = await self._open_card_by_href(page, href)
                    if not opened:
                        failed_hrefs[href] = failed_hrefs.get(href, 0) + 1
                        self._emit_event(f"Could not find card in DOM for {href}", level="debug")
                        continue

                    # Wait for the detail panel to appear, then capture.
                    try:
                        await page.wait_for_selector(
                            ".jobs-description-content__text, .jobs-box__html-content,"
                            " .jobs-search__job-details--wrapper, .jobs-details__main-content,"
                            " .job-details-jobs-unified-top-card__job-title",
                            timeout=3000,
                        )
                    except Exception:
                        pass
                    await page.wait_for_timeout(350 if self.use_visible_browser else 200)

                    # Retry up to 3 times with 400ms gaps for ID-mismatch cases.
                    detail = None
                    for _attempt in range(3):
                        detail = await self._capture_active_detail(page, href)
                        if isinstance(detail, dict) and detail.get("description"):
                            break
                        if _attempt < 2:
                            await page.wait_for_timeout(400)

                    if isinstance(detail, dict) and (detail.get("title") or detail.get("description")):
                        seen_hrefs.add(href)
                        detail_href = _clean_text(detail.get("source_url"))
                        if detail_href:
                            seen_hrefs.add(detail_href)
                        if on_rows_progress is not None:
                            try:
                                on_rows_progress([detail])
                            except Exception:
                                logger.debug("LinkedIn rows progress callback failed", exc_info=True)
                        self._emit_event(
                            f"Captured: {_clean_text(detail.get('title')) or href}",
                            level="debug",
                        )
                        captured_in_turn += 1
                    else:
                        failed_hrefs[href] = failed_hrefs.get(href, 0) + 1
                        self._emit_event(
                            f"Could not capture details for {href}; will retry next turn.",
                            level="debug",
                        )
                    if len(await self._read_cached_rows(page)) >= max_results:
                        break

                before_scroll_count = len(await self._read_cached_rows(page))
                moved = await self._scroll_visible_results(page)
                if not moved:
                    await page.mouse.wheel(0, 1200)
                await page.wait_for_timeout(420 if self.use_visible_browser else 280)
                after_scroll_count = len(await self._read_cached_rows(page))
                if after_scroll_count > before_scroll_count or captured_in_turn > 0:
                    stale_turns = 0
                    self._emit_event(
                        f"Observed {after_scroll_count} candidate rows on LinkedIn so far.",
                        level="debug",
                    )
                else:
                    stale_turns += 1
                if stale_turns >= 8:
                    self._emit_event("LinkedIn results look exhausted; stopping scan.", level="warn")
                    break

            rows = await self._read_cached_rows(page)
            if rows:
                if on_rows_progress is not None:
                    try:
                        on_rows_progress(rows)
                    except Exception:
                        logger.debug("LinkedIn rows progress callback failed", exc_info=True)
                return rows[:max_results]
            return await super()._discover_rows(page, query, max_results, on_rows_progress=on_rows_progress)

        client = get_gemini_client()
        if client is None:
            self._emit_event("Gemini unavailable for autonomous navigation; using deterministic flow.", level="warn")
            return await super()._discover_rows(page, query, max_results, on_rows_progress=on_rows_progress)

        self._emit_event("AI navigator active: deciding each click/scroll step from the current page.")
        seen_hrefs: set[str] = set()
        stale_turns = 0
        last_count = 0
        max_turns = max(8, min(14, max_results + 4))

        for turn in range(1, max_turns + 1):
            if self._should_stop():
                self.last_error = "Search stopped by operator request."
                self._emit_event("Stopping search because operator requested stop/cancel.", level="warn")
                break

            await page.bring_to_front()
            candidates = await self._snapshot_visible_cards(page)
            unseen_candidates = [card for card in candidates if _clean_text(card.get("href")) not in seen_hrefs]
            guidance = self._latest_guidance()
            cached_rows = await self._read_cached_rows(page)
            if len(cached_rows) >= max_results:
                break

            action = await self._plan_navigation_action(
                client,
                query=query,
                turn=turn,
                max_results=max_results,
                captured_count=len(cached_rows),
                seen_count=len(seen_hrefs),
                stale_turns=stale_turns,
                candidates=unseen_candidates,
                guidance=guidance,
            )

            action_type = _clean_text(action.get("action")).lower()
            if action_type == "done":
                self._emit_event("AI navigator finished: no more useful actions.")
                break

            if action_type == "open_card":
                href = _clean_text(action.get("href"))
                if not href:
                    stale_turns += 1
                    continue
                if href in seen_hrefs:
                    stale_turns += 1
                    continue
                opened = await self._open_card_by_href(page, href)
                if not opened:
                    stale_turns += 1
                    continue
                seen_hrefs.add(href)
                try:
                    await page.wait_for_selector(
                        ".jobs-description-content__text, .jobs-box__html-content, .jobs-search__job-details--wrapper, .jobs-details__main-content",
                        timeout=1500,
                    )
                except Exception:
                    pass
                await page.wait_for_timeout(220 if self.use_visible_browser else 140)
                detail = await self._capture_active_detail(page, href)
                if isinstance(detail, dict):
                    detail_href = _clean_text(detail.get("source_url"))
                    if detail_href:
                        seen_hrefs.add(detail_href)
                    if on_rows_progress is not None:
                        try:
                            on_rows_progress([detail])
                        except Exception:
                            logger.debug("LinkedIn rows progress callback failed", exc_info=True)
                    self._emit_event(
                        f"AI opened and captured: {_clean_text(detail.get('title')) or 'job card'}",
                        level="debug",
                    )
                await page.wait_for_timeout(100 if self.use_visible_browser else 80)
            else:
                moved = await self._scroll_visible_results(page)
                if not moved:
                    await page.mouse.wheel(0, 1200)
                await page.wait_for_timeout(360 if self.use_visible_browser else 240)

            cached_rows = await self._read_cached_rows(page)
            count = len(cached_rows)
            if count > last_count:
                stale_turns = 0
                self._emit_event(
                    f"Observed {count} candidate rows on {self.site_name.title()} so far.",
                    level="debug",
                )
            else:
                stale_turns += 1
            last_count = count
            if stale_turns >= 6:
                self._emit_event("AI navigator reached stale limit; stopping.", level="warn")
                break

        rows = await self._read_cached_rows(page)
        if not rows:
            return await super()._discover_rows(page, query, max_results, on_rows_progress=on_rows_progress)
        if on_rows_progress is not None:
            try:
                on_rows_progress(rows)
            except Exception:
                logger.debug("LinkedIn rows progress callback failed", exc_info=True)
        return rows[:max_results]

    async def _extract_rows(self, page) -> list[dict[str, str]]:
        return await page.evaluate(
            """
            async () => {
              const rowCache = window.__onFileLinkedInRowCache || (window.__onFileLinkedInRowCache = {});
              const normalizeTitle = (value) => {
                let title = String(value || '').replace(/\\s+/g, ' ').trim();
                title = title.replace(/\\s+with verification$/i, '').trim();
                const words = title.split(' ').filter(Boolean);
                if (words.length >= 6 && words.length % 2 === 0) {
                  const half = words.length / 2;
                  const first = words.slice(0, half).join(' ');
                  const second = words.slice(half).join(' ');
                  if (first.toLowerCase() === second.toLowerCase()) {
                    title = first;
                  }
                }
                return title;
              };
              const cardSelectors = [
                '.jobs-search-results-list li',
                '.scaffold-layout__list-item',
                '.jobs-search-results__list-item',
                '[data-occludable-job-id]',
                '[data-job-id]'
              ];
              const cards = Array.from(
                new Set(cardSelectors.flatMap((sel) => Array.from(document.querySelectorAll(sel))))
              );

              const collectRow = (container, anchor) => {
                if (!anchor) return;
                const hrefRaw = anchor.getAttribute('href') || '';
                const href = hrefRaw.split('?')[0].trim();
                if (!href || !href.includes('/jobs/view/')) return;
                if (rowCache[href]) return;

                const clickable =
                  container?.querySelector('a.job-card-list__title--link') ||
                  container?.querySelector('.artdeco-entity-lockup__title a') ||
                  anchor;

                const titleNode =
                  container?.querySelector('.job-card-list__title') ||
                  container?.querySelector('.base-search-card__title') ||
                  container?.querySelector('.artdeco-entity-lockup__title a') ||
                  anchor;
                const rawTitle =
                  titleNode?.getAttribute?.('aria-label') ||
                  titleNode?.textContent ||
                  anchor?.getAttribute?.('aria-label') ||
                  anchor?.textContent ||
                  '';
                const companyNode =
                  container?.querySelector('.artdeco-entity-lockup__subtitle') ||
                  container?.querySelector('.job-card-container__company-name') ||
                  container?.querySelector('.base-search-card__subtitle') ||
                  container?.querySelector('h4');
                const locationNode =
                  container?.querySelector('.job-card-container__metadata-item') ||
                  container?.querySelector('.artdeco-entity-lockup__caption') ||
                  container?.querySelector('.job-search-card__location');
                const dateNode =
                  container?.querySelector('time') ||
                  container?.querySelector('.job-search-card__listdate') ||
                  container?.querySelector('.job-card-container__footer-item');
                const descNode =
                  container?.querySelector('.job-card-list__description') ||
                  container?.querySelector('.base-search-card__metadata') ||
                  container?.querySelector('.job-card-container__job-insight-text');
                rowCache[href] = {
                  title: normalizeTitle(rawTitle),
                  company: (companyNode?.textContent || '').trim(),
                  location: (locationNode?.textContent || '').trim(),
                  description: (descNode?.textContent || container?.innerText || '').trim(),
                  source_url: href,
                  posted_date: (dateNode?.textContent || '').trim(),
                };
              };

              for (const card of cards) {
                const anchor =
                  card.querySelector('a.job-card-list__title--link') ||
                  card.querySelector('.artdeco-entity-lockup__title a') ||
                  card.querySelector('a[href*="/jobs/view/"]');
                collectRow(card, anchor);
              }

              if (Object.keys(rowCache).length < 5) {
                const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
                for (const anchor of anchors) {
                  collectRow(anchor.closest('li, article, div'), anchor);
                }
              }

              return Object.values(rowCache);
            }
            """
        )


class IndeedUserAssistedAdapter(_UserAssistedBrowserAdapter):
    site_name = "indeed"
    base_url = "https://www.indeed.com"
    search_template = "https://www.indeed.com/jobs?q={query}"
    source_label = "indeed_browser"

    async def _extract_rows(self, page) -> list[dict[str, str]]:
        return await page.evaluate(
            """
            () => {
              const rows = [];
              const seen = new Set();
              const anchors = Array.from(document.querySelectorAll('a[href*="/viewjob"]'));
              for (const anchor of anchors) {
                const href = anchor.getAttribute('href') || '';
                if (!href || seen.has(href)) continue;
                seen.add(href);
                const card = anchor.closest('[data-jk], [data-testid="slider_item"], .job_seen_beacon, article, div');
                const companyNode =
                  card?.querySelector('[data-testid="company-name"]') ||
                  card?.querySelector('.companyName');
                const locationNode =
                  card?.querySelector('[data-testid="text-location"]') ||
                  card?.querySelector('.companyLocation');
                const snippetNode =
                  card?.querySelector('.job-snippet') ||
                  card?.querySelector('.summary');
                const dateNode =
                  card?.querySelector('.date') ||
                  card?.querySelector('[data-testid="myJobsStateDate"]');
                rows.push({
                  title: (anchor.textContent || '').trim(),
                  company: (companyNode?.textContent || '').trim(),
                  location: (locationNode?.textContent || '').trim(),
                  description: (snippetNode?.textContent || card?.innerText || '').trim(),
                  source_url: href,
                  posted_date: (dateNode?.textContent || '').trim(),
                });
              }
              return rows;
            }
            """
        )

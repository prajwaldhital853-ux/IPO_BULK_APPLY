"""Server-side CDSC client.

Uses a persistent headless Chromium session so requests carry the same cookies /
TLS fingerprint Chrome gets after the F5 BIG-IP WAF challenge. All portal calls
run via page.evaluate(fetch) inside the loaded origin, exactly like the in-app
WebView bridge (mobile/src/components/IpoResultWebBridge.tsx).

Pure response parsing lives in app/parsing.py (testable without a browser).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import unquote, urlparse

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from .config import get_settings
from .parsing import (
    Captcha,
    CdscBlockedError,
    CdscSessionError,
    CheckResult,
    Company,
    interpret_check,
    looks_blocked,
    parse_captcha_reload,
    parse_companies,
    parse_home_captcha,
)

log = logging.getLogger("cdsc-session")


def _playwright_proxy(proxy_url: str) -> dict[str, str] | None:
    """Build Playwright proxy dict; auth must be separate from server URL."""
    raw = (proxy_url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "http://" + raw
    parsed = urlparse(raw)
    if not parsed.hostname:
        log.warning("CDSC_PROXY has no hostname: %s", proxy_url)
        return None
    port = parsed.port
    server = f"{parsed.scheme}://{parsed.hostname}" + (f":{port}" if port else "")
    out: dict[str, str] = {"server": server}
    if parsed.username:
        out["username"] = unquote(parsed.username)
    if parsed.password is not None:
        out["password"] = unquote(parsed.password)
    return out

__all__ = [
    "Captcha",
    "CdscBlockedError",
    "CdscSessionError",
    "CheckResult",
    "Company",
    "CdscSession",
    "interpret_check",
]

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# Hide common Playwright fingerprints before any page script runs.
_STEALTH_INIT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
"""


class CdscSession:
    """Persistent, serialized CDSC browser session."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._pw = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._lock = asyncio.Lock()
        self._ready = False
        self._owns_browser = True  # False when attached via CDP
        self._last_captcha_id: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    async def start(self) -> None:
        if self._ready:
            return
        async with self._lock:
            await self._start_unlocked()

    async def _start_unlocked(self) -> None:
        if self._ready:
            return
        if self._pw is None:
            self._pw = await async_playwright().start()
        cdp = (self._settings.chrome_cdp_url or "").strip()
        if cdp:
            await self._attach_cdp(cdp)
        else:
            await self._launch_browser()
        await self._warm_up()
        self._ready = True

    async def _reconnect_unlocked(self) -> None:
        """Reconnect browser/CDP without acquiring _lock (caller must hold it)."""
        await self._hard_reset_unlocked()
        await self._start_unlocked()

    def _cdsc_base(self) -> str:
        return self._settings.cdsc_base.rstrip("/")

    async def _pick_cdsc_page(self) -> Page | None:
        base = self._cdsc_base()
        if self._context:
            for page in self._context.pages:
                if base in (page.url or ""):
                    return page
        return None

    async def _focus_cdsc_page(self) -> Page:
        assert self._page is not None
        base = self._cdsc_base()
        picked = await self._pick_cdsc_page()
        if picked is not None:
            self._page = picked
            return picked
        if base not in (self._page.url or ""):
            await self._page.goto(base + "/", wait_until="domcontentloaded", timeout=60000)
        return self._page

    async def _attach_cdp(self, cdp_url: str) -> None:
        """Attach to a real Chrome started with --remote-debugging-port."""
        assert self._pw is not None
        self._browser = await self._pw.chromium.connect_over_cdp(cdp_url)
        self._owns_browser = False
        contexts = self._browser.contexts
        self._context = contexts[0] if contexts else await self._browser.new_context()
        picked = await self._pick_cdsc_page()
        if picked is not None:
            self._page = picked
        else:
            pages = self._context.pages
            self._page = pages[0] if pages else await self._context.new_page()

    async def _launch_browser(self) -> None:
        assert self._pw is not None
        launch_kwargs: dict[str, Any] = {
            "headless": self._settings.headless,
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
            "ignore_default_args": ["--enable-automation"],
        }
        channel = (self._settings.chrome_channel or "").strip()
        if channel:
            launch_kwargs["channel"] = channel
        if self._settings.cdsc_proxy:
            proxy = _playwright_proxy(self._settings.cdsc_proxy)
            if proxy:
                launch_kwargs["proxy"] = proxy
                log.info(
                    "Launching Chromium via proxy %s (auth=%s)",
                    proxy.get("server"),
                    "yes" if proxy.get("username") else "no",
                )
        self._browser = await self._pw.chromium.launch(**launch_kwargs)
        self._owns_browser = True
        self._context = await self._browser.new_context(
            user_agent=CHROME_UA,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        await self._context.add_init_script(_STEALTH_INIT)
        self._page = await self._context.new_page()

    async def _fetch_text_on_page(
        self,
        page: Page,
        path: str,
        method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> str:
        result = await asyncio.wait_for(
            page.evaluate(
                """
                async ({ path, method, body }) => {
                  const opts = {
                    method,
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json, text/plain, */*' },
                  };
                  if (body) {
                    opts.headers['Content-Type'] = 'application/json';
                    opts.body = JSON.stringify(body);
                  }
                  try {
                    const res = await fetch(path, opts);
                    const text = await res.text();
                    return { status: res.status, text };
                  } catch (e) {
                    return { status: 0, text: String(e && e.message ? e.message : e) };
                  }
                }
                """,
                {"path": path, "method": method, "body": body},
            ),
            timeout=25.0,
        )
        return str(result.get("text", ""))

    async def _warm_up(self) -> None:
        assert self._page is not None
        base = self._settings.cdsc_base.rstrip("/")
        # Residential proxies are slower; give them more time than direct.
        nav_timeout = 120_000 if (self._settings.cdsc_proxy or "").strip() else 60_000
        # Reuse an already-open CDSC tab when attached via CDP.
        if base not in (self._page.url or ""):
            for p in self._context.pages if self._context else []:
                if base in (p.url or ""):
                    self._page = p
                    break
            else:
                await self._page.goto(
                    base + "/",
                    wait_until="domcontentloaded",
                    timeout=nav_timeout,
                )

        # CDP + real Chrome already on CDSC: don't fail boot on a grumpy probe.
        # First API call will reload/reconnect via _fetch_home_payload().
        if not self._owns_browser:
            page = await self._focus_cdsc_page()
            try:
                text = await self._fetch_text_on_page(
                    page, "/result/companyShares/fileUploaded"
                )
                if not looks_blocked(text) and "companyShare" in text:
                    self._remember_captcha(text)
                    return
            except Exception:  # noqa: BLE001
                pass
            return

        # Wait for the real app shell before hitting the API (avoids poisoning the WAF).
        for _ in range(15):
            title = (await self._page.title() or "").lower()
            if "rejected" in title:
                await asyncio.sleep(1.0)
                continue
            body = ""
            try:
                body = (await self._page.inner_text("body")).lower()
            except Exception:  # noqa: BLE001
                pass
            if any(k in body for k in ("boid", "captcha", "company", "ipo")):
                break
            await asyncio.sleep(1.0)

        for _ in range(12):
            text = await self._fetch_text_on_page(
                self._page, "/result/companyShares/fileUploaded"
            )
            if not looks_blocked(text) and "companyShare" in text:
                return
            await asyncio.sleep(1.0)
        raise CdscBlockedError(
            "CDSC WAF did not clear during warm-up. If Chrome works normally, "
            "start Chrome with --remote-debugging-port=9222, open the CDSC site, "
            "set CHROME_CDP_URL=http://127.0.0.1:9222, and retry. "
            "Otherwise set CDSC_PROXY to a residential proxy."
        )

    async def _hard_reset_unlocked(self) -> None:
        """Drop stale browser/CDP handles (caller must hold _lock)."""
        try:
            if self._owns_browser:
                if self._context:
                    await self._context.close()
                if self._browser:
                    await self._browser.close()
            elif self._browser:
                await self._browser.close()
            if self._pw:
                await self._pw.stop()
        except Exception:  # noqa: BLE001
            pass
        finally:
            self._ready = False
            self._page = None
            self._context = None
            self._browser = None
            self._pw = None
            self._owns_browser = True

    @staticmethod
    def _is_driver_disconnect(exc: BaseException) -> bool:
        msg = str(exc).lower()
        return any(
            k in msg
            for k in (
                "connection closed",
                "target closed",
                "browser has been closed",
                "context was destroyed",
                "session closed",
                "disconnected",
            )
        )

    async def _recover_from_waf(self, attempt: int) -> None:
        """Refresh the real Chrome tab or fully reconnect after WAF blocks."""
        if attempt < 2 and self._page is not None:
            try:
                page = await self._focus_cdsc_page()
                await page.reload(wait_until="domcontentloaded", timeout=45_000)
                await asyncio.sleep(1.0 + attempt * 0.75)
                return
            except Exception:  # noqa: BLE001
                pass
        await self._reconnect_unlocked()

    def _remember_captcha(self, text: str) -> None:
        try:
            captcha = parse_home_captcha(text)
        except Exception:  # noqa: BLE001
            return
        if captcha:
            self._last_captcha_id = captcha.identifier

    async def _fetch_home_payload(self) -> str:
        last_err = "CDSC WAF blocked the home payload"
        for attempt in range(4):
            text = await self._fetch_text("/result/companyShares/fileUploaded")
            if looks_blocked(text) or "companyShare" not in text:
                last_err = "CDSC WAF blocked the home payload"
                await self._recover_from_waf(attempt)
                continue
            self._remember_captcha(text)
            return text
        raise CdscBlockedError(last_err)

    async def _fetch_text_with_recovery(
        self,
        path: str,
        method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> str:
        last_err = "CDSC WAF blocked the request"
        for attempt in range(3):
            text = await self._fetch_text(path, method, body)
            if not looks_blocked(text):
                return text
            last_err = "CDSC WAF blocked the request"
            await self._recover_from_waf(attempt)
        raise CdscBlockedError(last_err)

    async def _fetch_text(
        self,
        path: str,
        method: str = "GET",
        body: dict[str, Any] | None = None,
        *,
        _retried: bool = False,
    ) -> str:
        page = await self._ensure()
        try:
            result = await asyncio.wait_for(
                page.evaluate(
                    """
                    async ({ path, method, body }) => {
                      const opts = {
                        method,
                        credentials: 'include',
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json, text/plain, */*' },
                      };
                      if (body) {
                        opts.headers['Content-Type'] = 'application/json';
                        opts.body = JSON.stringify(body);
                      }
                      try {
                        const res = await fetch(path, opts);
                        const text = await res.text();
                        return { status: res.status, text };
                      } catch (e) {
                        return { status: 0, text: String(e && e.message ? e.message : e) };
                      }
                    }
                    """,
                    {"path": path, "method": method, "body": body},
                ),
                timeout=25.0,
            )
            return str(result.get("text", ""))
        except TimeoutError as exc:
            if not _retried:
                await self._reconnect_unlocked()
                return await self._fetch_text(
                    path, method, body, _retried=True
                )
            raise CdscSessionError("CDSC fetch timed out") from exc
        except Exception as exc:  # noqa: BLE001
            if not _retried and self._is_driver_disconnect(exc):
                await self._reconnect_unlocked()
                return await self._fetch_text(
                    path, method, body, _retried=True
                )
            raise CdscSessionError(str(exc)) from exc

    async def _ensure(self) -> Page:
        if not self._ready or self._page is None:
            await self._start_unlocked()
        assert self._page is not None
        return self._page

    async def get_companies(self) -> list[Company]:
        async with self._lock:
            if not self._ready:
                await self._start_unlocked()
            text = await self._fetch_home_payload()
            return parse_companies(text)

    async def get_captcha(self) -> Captcha:
        """Fresh captcha via home payload, with reload fallback."""
        async with self._lock:
            if not self._ready:
                await self._start_unlocked()
            try:
                text = await self._fetch_home_payload()
                captcha = parse_home_captcha(text)
                if captcha:
                    return captcha
            except CdscBlockedError:
                pass
            if self._last_captcha_id:
                return await self._reload_captcha_unlocked(self._last_captcha_id)
            raise CdscBlockedError("Captcha fetch blocked by WAF")

    async def _reload_captcha_unlocked(self, identifier: str) -> Captcha:
        text = await self._fetch_text_with_recovery(
            f"/result/captcha/reload/{identifier}", method="POST"
        )
        captcha = parse_captcha_reload(text)
        self._last_captcha_id = captcha.identifier
        return captcha

    async def reload_captcha(self, identifier: str) -> Captcha:
        async with self._lock:
            if not self._ready:
                await self._start_unlocked()
            return await self._reload_captcha_unlocked(identifier)

    async def check_raw(
        self,
        company_share_id: int | str,
        boid: str,
        user_captcha: str,
        captcha_identifier: str,
    ) -> dict[str, Any]:
        import json

        async with self._lock:
            if not self._ready:
                await self._start_unlocked()
            text = await self._fetch_text_with_recovery(
                "/result/result/check",
                method="POST",
                body={
                    "companyShareId": str(company_share_id),
                    "boid": boid,
                    "userCaptcha": user_captcha,
                    "captchaIdentifier": captcha_identifier,
                },
            )
            return json.loads(text)

    async def close(self) -> None:
        async with self._lock:
            await self._hard_reset_unlocked()

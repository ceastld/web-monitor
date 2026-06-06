from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.async_api import Browser, BrowserContext, Page, Playwright, Route, async_playwright

from app.config import settings
from app.services.component_capture import COMPONENT_CAPTURE_JS


@dataclass
class FetchResult:
    content: str | None
    screenshot_path: str | None
    error: str | None = None


@dataclass
class PreviewResult:
    screenshot_path: str | None
    final_url: str | None
    page_title: str | None
    selector_content: str | None
    profile_id: int | None
    error: str | None = None


@dataclass
class _ContextEntry:
    context: BrowserContext
    profile_id: int | None
    storage_mtime: float | None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


@dataclass
class _PageEntry:
    page: Page
    monitor_id: int
    url: str
    profile_id: int | None
    routes_ready: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class BrowserManager:
    """Manages a shared Playwright browser with optional pooled contexts/pages."""

    def __init__(self) -> None:
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._login_sessions: dict[int, _LoginSession] = {}
        self._context_pool: dict[str, _ContextEntry] = {}
        self._page_pool: dict[int, _PageEntry] = {}

    async def start(self) -> None:
        async with self._lock:
            if self._browser is not None:
                return
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(headless=settings.headless)

    async def stop(self) -> None:
        for session in list(self._login_sessions.values()):
            await session.close()
        self._login_sessions.clear()
        await self._clear_pools()

        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None

    async def _ensure_browser(self) -> Browser:
        if self._browser is None:
            await self.start()
        assert self._browser is not None
        return self._browser

    def profile_storage_path(self, profile_id: int) -> Path:
        return settings.profiles_dir / str(profile_id) / "storage_state.json"

    def _pool_key(self, profile_id: int | None) -> str:
        return f"profile:{profile_id}" if profile_id is not None else "profile:none"

    def _storage_mtime(self, profile_id: int | None) -> float | None:
        if profile_id is None:
            return None
        storage_path = self.profile_storage_path(profile_id)
        return storage_path.stat().st_mtime if storage_path.exists() else None

    async def _clear_pools(self) -> None:
        for monitor_id in list(self._page_pool):
            await self._discard_page(monitor_id)
        for key in list(self._context_pool):
            await self._discard_context(key)

    async def _discard_page(self, monitor_id: int) -> None:
        entry = self._page_pool.pop(monitor_id, None)
        if entry is None:
            return
        async with entry.lock:
            if not entry.page.is_closed():
                await entry.page.close()

    async def _discard_context(self, key: str) -> None:
        entry = self._context_pool.pop(key, None)
        if entry is None:
            return
        for monitor_id, page_entry in list(self._page_pool.items()):
            if page_entry.page.context == entry.context:
                await self._discard_page(monitor_id)
        async with entry.lock:
            await entry.context.close()

    async def invalidate_profile(self, profile_id: int) -> None:
        """Drop pooled browser state after login cookies change."""
        if not settings.browser_keep_alive:
            return
        key = self._pool_key(profile_id)
        for monitor_id, page_entry in list(self._page_pool.items()):
            if page_entry.profile_id == profile_id:
                await self._discard_page(monitor_id)
        await self._discard_context(key)

    async def create_isolated_context(
        self,
        profile_id: int | None = None,
        *,
        headless: bool | None = None,
    ) -> BrowserContext:
        browser = await self._ensure_browser()
        context_options: dict[str, Any] = {
            "viewport": {"width": 1280, "height": 720},
            "locale": "zh-CN",
        }

        if profile_id is not None:
            storage_path = self.profile_storage_path(profile_id)
            if storage_path.exists():
                context_options["storage_state"] = str(storage_path)

        if headless is False:
            assert self._playwright is not None
            headed_browser = await self._playwright.chromium.launch(headless=False)
            return await headed_browser.new_context(**context_options)

        return await browser.new_context(**context_options)

    async def _get_context_entry(self, profile_id: int | None) -> _ContextEntry:
        assert settings.browser_keep_alive
        key = self._pool_key(profile_id)
        storage_mtime = self._storage_mtime(profile_id)

        entry = self._context_pool.get(key)
        if entry is not None:
            stale_storage = entry.storage_mtime != storage_mtime
            context_dead = entry.context.browser is None
            if stale_storage or context_dead:
                await self._discard_context(key)
                entry = None

        if entry is None:
            context = await self.create_isolated_context(profile_id)
            entry = _ContextEntry(
                context=context,
                profile_id=profile_id,
                storage_mtime=storage_mtime,
            )
            self._context_pool[key] = entry
        return entry

    async def _get_page_entry(
        self,
        *,
        monitor_id: int | None,
        url: str,
        profile_id: int | None,
    ) -> tuple[_PageEntry, bool]:
        """Return a page entry and whether the caller must close it after use."""
        if not settings.browser_keep_alive:
            context = await self.create_isolated_context(profile_id)
            page = await context.new_page()
            ephemeral = _PageEntry(
                page=page,
                monitor_id=monitor_id or -1,
                url=url,
                profile_id=profile_id,
            )
            return ephemeral, True

        if monitor_id is None:
            context_entry = await self._get_context_entry(profile_id)
            async with context_entry.lock:
                page = await context_entry.context.new_page()
            ephemeral = _PageEntry(
                page=page,
                monitor_id=-1,
                url=url,
                profile_id=profile_id,
            )
            return ephemeral, True

        existing = self._page_pool.get(monitor_id)
        if existing is not None:
            if existing.url != url or existing.profile_id != profile_id or existing.page.is_closed():
                await self._discard_page(monitor_id)
                existing = None

        if existing is not None:
            return existing, False

        context_entry = await self._get_context_entry(profile_id)
        async with context_entry.lock:
            page = await context_entry.context.new_page()
        page_entry = _PageEntry(
            page=page,
            monitor_id=monitor_id,
            url=url,
            profile_id=profile_id,
        )
        self._page_pool[monitor_id] = page_entry
        return page_entry, False

    async def fetch_content(
        self,
        url: str,
        selector: str,
        selector_type: str = "css",
        extract_mode: str = "text",
        profile_id: int | None = None,
        monitor_id: int | None = None,
    ) -> FetchResult:
        page_entry, ephemeral = await self._get_page_entry(
            monitor_id=monitor_id,
            url=url,
            profile_id=profile_id,
        )
        screenshot_path: str | None = None

        try:
            async with page_entry.lock:
                timeout_ms = settings.browser_timeout_ms
                page_entry.page.set_default_timeout(timeout_ms)
                await self._refresh_page(page_entry, url, timeout_ms=timeout_ms)

                locator = self._resolve_locator(page_entry.page, selector, selector_type)
                await locator.first.wait_for(
                    state="visible",
                    timeout=settings.preview_selector_timeout_ms,
                )

                if extract_mode == "component":
                    payload = await page_entry.page.evaluate(
                        COMPONENT_CAPTURE_JS,
                        {"selector": selector, "selectorType": selector_type},
                    )
                    if payload is None:
                        raise ValueError(f"未找到匹配元素: {selector}")
                    content = json.dumps(payload, ensure_ascii=False)
                elif extract_mode == "html":
                    content = await locator.first.inner_html()
                else:
                    content = await locator.first.inner_text()

                if monitor_id is not None:
                    screenshot_file = (
                        settings.screenshots_dir
                        / f"monitor_{monitor_id}_{int(asyncio.get_event_loop().time())}.png"
                    )
                    await locator.first.screenshot(path=str(screenshot_file))
                    screenshot_path = str(screenshot_file)

            return FetchResult(content=content.strip() if content else "", screenshot_path=screenshot_path)
        except Exception as exc:  # noqa: BLE001 - surface browser errors to caller
            if monitor_id is not None and settings.browser_keep_alive:
                await self._discard_page(monitor_id)
            return FetchResult(content=None, screenshot_path=None, error=str(exc))
        finally:
            if ephemeral:
                context = page_entry.page.context
                if not page_entry.page.is_closed():
                    await page_entry.page.close()
                if not settings.browser_keep_alive:
                    await context.close()

    def _resolve_locator(self, page: Page, selector: str, selector_type: str):
        if selector_type == "xpath":
            return page.locator(f"xpath={selector}")
        return page.locator(selector)

    @staticmethod
    def _same_target(current_url: str, target_url: str) -> bool:
        current = urlparse(current_url)
        target = urlparse(target_url)
        return (
            current.scheme == target.scheme
            and current.netloc == target.netloc
            and current.path.rstrip("/") == target.path.rstrip("/")
        )

    async def _ensure_routes(self, page_entry: _PageEntry) -> None:
        if page_entry.routes_ready:
            return

        async def _block_heavy_assets(route: Route) -> None:
            if route.request.resource_type in {"image", "media", "font"}:
                await route.abort()
            else:
                await route.continue_()

        await page_entry.page.route("**/*", _block_heavy_assets)
        page_entry.routes_ready = True

    async def _refresh_page(self, page_entry: _PageEntry, url: str, *, timeout_ms: int) -> None:
        await self._ensure_routes(page_entry)
        page = page_entry.page
        current_url = page.url
        if current_url in ("about:blank", "") or not self._same_target(current_url, url):
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        else:
            await page.reload(wait_until="domcontentloaded", timeout=timeout_ms)
        await page.wait_for_timeout(settings.preview_render_wait_ms)

    def profile_has_storage(self, profile_id: int) -> bool:
        return self.profile_storage_path(profile_id).exists()

    async def preview_page(
        self,
        url: str,
        *,
        profile_id: int | None = None,
        selector: str | None = None,
        selector_type: str = "css",
        monitor_id: int | None = None,
    ) -> PreviewResult:
        if profile_id is not None and not self.profile_has_storage(profile_id):
            return PreviewResult(
                screenshot_path=None,
                final_url=None,
                page_title=None,
                selector_content=None,
                profile_id=profile_id,
                error="该监控关联的配置档尚未保存登录状态，请先在「登录配置档」中登录并保存",
            )

        page_entry, ephemeral = await self._get_page_entry(
            monitor_id=monitor_id,
            url=url,
            profile_id=profile_id,
        )

        try:
            async with page_entry.lock:
                timeout_ms = settings.preview_timeout_ms
                page_entry.page.set_default_timeout(timeout_ms)
                await self._refresh_page(page_entry, url, timeout_ms=timeout_ms)

                selector_content: str | None = None
                if selector:
                    locator = self._resolve_locator(page_entry.page, selector, selector_type)
                    try:
                        await locator.first.wait_for(
                            state="visible",
                            timeout=settings.preview_selector_timeout_ms,
                        )
                        selector_content = (await locator.first.inner_text()).strip()
                    except Exception:
                        selector_content = None

                stamp = int(asyncio.get_event_loop().time())
                suffix = f"monitor_{monitor_id}" if monitor_id is not None else "page"
                screenshot_file = settings.screenshots_dir / f"preview_{suffix}_{stamp}.png"
                await page_entry.page.screenshot(path=str(screenshot_file), full_page=False)

                return PreviewResult(
                    screenshot_path=str(screenshot_file),
                    final_url=page_entry.page.url,
                    page_title=await page_entry.page.title(),
                    selector_content=selector_content,
                    profile_id=profile_id,
                )
        except Exception as exc:  # noqa: BLE001
            if monitor_id is not None and settings.browser_keep_alive:
                await self._discard_page(monitor_id)
            return PreviewResult(
                screenshot_path=None,
                final_url=None,
                page_title=None,
                selector_content=None,
                profile_id=profile_id,
                error=str(exc),
            )
        finally:
            if ephemeral:
                context = page_entry.page.context
                if not page_entry.page.is_closed():
                    await page_entry.page.close()
                if not settings.browser_keep_alive:
                    await context.close()

    async def start_login_session(
        self,
        profile_id: int,
        start_url: str | None = None,
    ) -> None:
        if profile_id in self._login_sessions:
            raise RuntimeError("该配置档已有进行中的登录会话")

        session = _LoginSession(profile_id, start_url)
        self._login_sessions[profile_id] = session
        await session.open()

    async def save_login_session(self, profile_id: int) -> Path:
        session = self._login_sessions.get(profile_id)
        if session is None:
            raise RuntimeError("没有进行中的登录会话")

        storage_path = self.profile_storage_path(profile_id)
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        await session.save(storage_path)
        await session.close()
        del self._login_sessions[profile_id]
        await self.invalidate_profile(profile_id)
        return storage_path

    async def cancel_login_session(self, profile_id: int) -> None:
        session = self._login_sessions.pop(profile_id, None)
        if session is not None:
            await session.close()

    def login_session_status(self, profile_id: int) -> str | None:
        session = self._login_sessions.get(profile_id)
        return session.status if session else None


class _LoginSession:
    def __init__(self, profile_id: int, start_url: str | None) -> None:
        self.profile_id = profile_id
        self.start_url = start_url or "about:blank"
        self.status = "starting"
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None

    async def open(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=False)

        context_options: dict[str, Any] = {
            "viewport": {"width": 1280, "height": 800},
            "locale": "zh-CN",
        }
        storage_path = settings.profiles_dir / str(self.profile_id) / "storage_state.json"
        if storage_path.exists():
            context_options["storage_state"] = str(storage_path)

        self._context = await self._browser.new_context(**context_options)
        page = await self._context.new_page()
        await page.goto(self.start_url, wait_until="domcontentloaded")
        self.status = "active"

    async def save(self, storage_path: Path) -> None:
        if self._context is None:
            raise RuntimeError("登录会话未启动")
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        await self._context.storage_state(path=str(storage_path))
        self.status = "saved"

    async def close(self) -> None:
        if self._context is not None:
            await self._context.close()
            self._context = None
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None
        if self.status != "saved":
            self.status = "closed"


browser_manager = BrowserManager()

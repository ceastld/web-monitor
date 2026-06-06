"""Convert bingleimuzi balance monitor to component mode."""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.request

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8765"
MONITOR_ID = 3
URL = "https://api.bingleimuzi.eu.cc/dashboard"
STORAGE = "data/profiles/2/storage_state.json"
SELECTOR = "//p[normalize-space(.)='余额']/ancestor::div[contains(@class,'card')][1]"


def request(method: str, path: str, data: dict | None = None) -> dict | list | None:
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"} if body else {},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


async def verify_selector() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=STORAGE)
        page = await context.new_page()
        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.goto(URL, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1_500)
        locator = page.locator(f"xpath={SELECTOR}")
        print("selector count:", await locator.count())
        if await locator.count():
            box = await locator.first.bounding_box()
            text = (await locator.first.inner_text()).strip()
            print("preview text:", text.replace("\n", " | "))
            print("bounding box:", box)
            await locator.first.screenshot(path="data/screenshots/bingleimuzi_component_probe.png")
        await browser.close()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(verify_selector())
    updated = request(
        "PATCH",
        f"/api/monitors/{MONITOR_ID}",
        {
            "name": "冰雷木子 API 余额",
            "extract_mode": "component",
            "selector_type": "xpath",
            "selector": SELECTOR,
        },
    )
    print("updated:", json.dumps(updated, ensure_ascii=False, indent=2))
    snapshot = request("POST", f"/api/monitors/{MONITOR_ID}/fetch")
    content = snapshot.get("content", "") if isinstance(snapshot, dict) else ""
    preview = content[:240] + ("..." if len(content) > 240 else "")
    print("fetch status:", snapshot.get("status") if isinstance(snapshot, dict) else snapshot)
    print("content preview:", preview)


if __name__ == "__main__":
    main()

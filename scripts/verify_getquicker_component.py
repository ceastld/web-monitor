"""Verify getquicker component xpath and preview capture."""
from __future__ import annotations

import asyncio
import json
import urllib.request

from playwright.async_api import async_playwright

URL = "https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe"
SELECTOR = "/html/body/div[1]/div[2]/div[2]/div/div[2]/div/section[2]/div[2]/div/div"
BASE = "http://127.0.0.1:8765"
MONITOR_ID = 4


async def preview_xpath() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 900}, locale="zh-CN")
        await page.goto(URL, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1_500)
        locator = page.locator(f"xpath={SELECTOR}")
        count = await locator.count()
        print("match count:", count)
        if count:
            text = (await locator.first.inner_text()).strip().replace("\n", " ")[:240]
            html_len = len(await locator.first.inner_html())
            print("text preview:", text)
            print("html length:", html_len)
            await locator.first.screenshot(path="data/screenshots/getquicker_component_probe.png")
        await browser.close()


def update_monitor() -> None:
    payload = {
        "selector": SELECTOR,
        "selector_type": "xpath",
        "extract_mode": "component",
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/api/monitors/{MONITOR_ID}",
        data=body,
        method="PATCH",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        print("updated:", resp.read().decode("utf-8"))

    req = urllib.request.Request(
        f"{BASE}/api/monitors/{MONITOR_ID}/fetch",
        data=b"{}",
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print("fetch status:", result.get("status"))
        print("content length:", len(result.get("content") or ""))
        print("screenshot:", result.get("screenshot_path"))


async def main() -> None:
    await preview_xpath()
    update_monitor()


if __name__ == "__main__":
    asyncio.run(main())

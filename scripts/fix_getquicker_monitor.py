"""Update and test getquicker monitor selector."""
from __future__ import annotations

import asyncio
import json
import urllib.request

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8765"
MONITOR_ID = 4
URL = "https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe"
SELECTOR = "(//div[contains(@class,'action-detail')]//header/p)[1]"


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
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(locale="zh-CN")
        await page.goto(URL, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1_500)
        text = (await page.locator(f"xpath={SELECTOR}").first.inner_text()).strip()
        print("selector preview:", text[:160])
        await browser.close()


def main() -> None:
    asyncio.run(verify_selector())
    updated = request("PATCH", f"/api/monitors/{MONITOR_ID}", {"selector": SELECTOR})
    print("updated:", json.dumps(updated, ensure_ascii=False, indent=2))
    snapshot = request("POST", f"/api/monitors/{MONITOR_ID}/fetch")
    print("fetch:", json.dumps(snapshot, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

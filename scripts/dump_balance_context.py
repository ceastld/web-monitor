from __future__ import annotations

import asyncio
import sys

from playwright.async_api import async_playwright


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        text = await (
            await page.context.request.get(
                "https://api.bingleimuzi.eu.cc/assets/DashboardView-CqkP_o7t.js"
            )
        ).text()
        key = "dashboard.balance"
        start = 0
        while True:
            idx = text.find(key, start)
            if idx < 0:
                break
            print(text[idx - 200 : idx + 400].replace("\n", " "))
            print("\n" + "=" * 80 + "\n")
            start = idx + len(key)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

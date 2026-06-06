from __future__ import annotations

import asyncio
import re
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
        patterns = [
            r"dashboard\.[a-zA-Z.]+",
            r"UserDashboardStats[^}]{0,800}",
            r"balance[^,]{0,80}",
        ]
        for pat in patterns:
            print(f"\n### pattern: {pat}")
            for i, m in enumerate(re.finditer(pat, text)):
                if i >= 15:
                    break
                snippet = m.group(0).replace("\n", " ")
                print(snippet[:250])
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

"""Find dashboard-related asset chunks."""
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
        await page.goto("https://api.bingleimuzi.eu.cc/dashboard", wait_until="domcontentloaded")
        html = await page.content()
        match = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
        if not match:
            print("no index js")
            return
        index_js = await (await page.context.request.get(f"https://api.bingleimuzi.eu.cc{match.group(1)}")).text()
        chunks = re.findall(r"assets/(Dashboard[^\"']+\.js)", index_js)
        chunks += re.findall(r"assets/([A-Za-z]*Dashboard[A-Za-z0-9_-]+\.js)", index_js)
        chunks = sorted(set(chunks))
        print("chunks:", chunks)
        for chunk in chunks[:10]:
            text = await (
                await page.context.request.get(f"https://api.bingleimuzi.eu.cc/assets/{chunk}")
            ).text()
            for kw in ["余额", "balance", "Balance"]:
                if kw in text or kw.lower() in text.lower():
                    idx = text.find("余额") if kw == "余额" else text.lower().find("balance")
                    print(f"\n== {chunk} ==")
                    print(text[max(0, idx - 120) : idx + 200].replace("\n", " ")[:320])
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

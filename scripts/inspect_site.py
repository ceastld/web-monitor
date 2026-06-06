"""Temporary script to inspect dashboard balance selectors."""
from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.request

from playwright.async_api import async_playwright


async def search_js_via_playwright() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://api.bingleimuzi.eu.cc/dashboard", wait_until="domcontentloaded")
        html = await page.content()
        match = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
        if not match:
            print("JS bundle not found")
            await browser.close()
            return
        js_url = f"https://api.bingleimuzi.eu.cc{match.group(1)}"
        response = await page.context.request.get(js_url)
        content = await response.text()
        for keyword in ["余额", "balance", "Balance", "quota", "credit"]:
            idx = content.find(keyword) if keyword == "余额" else content.lower().find(keyword.lower())
            count = 0
            while idx >= 0 and count < 3:
                snippet = content[max(0, idx - 80) : idx + 120].replace("\n", " ")
                print(f"--- {keyword} @ {idx} ---")
                print(snippet[:200])
                count += 1
                idx = (
                    content.find(keyword, idx + 1)
                    if keyword == "余额"
                    else content.lower().find(keyword.lower(), idx + 1)
                )
        await browser.close()


async def inspect_logged_out() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://api.bingleimuzi.eu.cc/dashboard", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        print("URL:", page.url)
        await browser.close()


async def inspect_with_storage(storage_path: str) -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=storage_path)
        page = await context.new_page(viewport={"width": 1280, "height": 900})
        await page.goto("https://api.bingleimuzi.eu.cc/dashboard", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)
        print("URL:", page.url)
        hits = await page.evaluate(
            """() => {
              const out = [];
              for (const el of document.querySelectorAll('*')) {
                const text = (el.innerText || '').trim();
                if (!text || text.length > 120) continue;
                if (/余额|balance|额度|剩余/i.test(text)) {
                  out.push({
                    tag: el.tagName.toLowerCase(),
                    class: el.className?.toString?.() || '',
                    id: el.id || '',
                    text,
                  });
                }
              }
              return out.slice(0, 40);
            }"""
        )
        print(json.dumps(hits, ensure_ascii=False, indent=2))
        await browser.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 1 and sys.argv[1] == "--storage":
        asyncio.run(inspect_with_storage(sys.argv[2]))
    else:
        asyncio.run(search_js_via_playwright())
        asyncio.run(inspect_logged_out())

"""Find DOM path for first intro paragraph on getquicker shared action page."""
from __future__ import annotations

import asyncio
import json

from playwright.async_api import async_playwright

URL = "https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 900}, locale="zh-CN")
        await page.goto(URL, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(2_000)

        data = await page.evaluate(
            """() => {
            const ps = [...document.querySelectorAll('p')];
            const target = ps.find(p => (p.textContent || '').includes('QuickerAgent'));
            if (!target) return { error: 'paragraph not found' };
            let el = target.parentElement;
            const chain = [];
            for (let depth = 0; el && depth < 6; depth += 1) {
                chain.push({
                    tag: el.tagName,
                    id: el.id,
                    class: String(el.className).slice(0, 100),
                    childCount: el.children.length,
                });
                el = el.parentElement;
            }
            const h4 = [...document.querySelectorAll('h4')].map(h => ({
                text: h.textContent.trim(),
                next: h.nextElementSibling
                    ? {
                        tag: h.nextElementSibling.tagName,
                        class: String(h.nextElementSibling.className).slice(0, 80),
                    }
                    : null,
            }));
            const firstInParent = target.parentElement
                ? [...target.parentElement.querySelectorAll('p')].map(p => p.textContent.trim().slice(0, 80))
                : [];
            return {
                text: target.textContent.trim().slice(0, 120),
                chain,
                h4,
                firstInParent,
                pIndex: ps.indexOf(target),
                totalP: ps.length,
            };
        }"""
        )
        print(json.dumps(data, ensure_ascii=False, indent=2))

        candidates = [
            "(//p[contains(normalize-space(.), 'QuickerAgent')])[1]",
            "//h4[contains(normalize-space(.), '\u52a8\u4f5c\u4fe1\u606f')]/following::p[1]",
            "(//div[contains(@class,'card')]//p)[1]",
            "(//div[contains(@class,'container')]//p)[2]",
            "(//div[contains(@class,'container')]//p)[1]",
        ]
        for sel in candidates:
            locator = page.locator(f"xpath={sel}") if sel.startswith("//") or sel.startswith("(") else page.locator(sel)
            count = await locator.count()
            if count:
                text = (await locator.first.inner_text()).strip().replace("\n", " ")[:120]
                print(f"CAND {sel} => {text}")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

"""Inspect getquicker shared action page for monitor selector."""
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

        intro_tab = page.get_by_text("动作简介", exact=False)
        tab_count = await intro_tab.count()
        print("intro tab count:", tab_count)
        if tab_count:
            await intro_tab.first.click()
            await page.wait_for_timeout(1_500)

        info_heading = page.get_by_text("动作信息", exact=True)
        if await info_heading.count():
            print("found 动作信息 heading")

        xpaths = [
            "//h4[contains(normalize-space(.), '\u52a8\u4f5c\u4fe1\u606f')]/following-sibling::*[1]//p[1]",
            "//h4[contains(normalize-space(.), '\u52a8\u4f5c\u4fe1\u606f')]/following::p[1]",
            "//*[contains(normalize-space(.), '\u52a8\u4f5c\u4fe1\u606f')]/following::div[contains(@class,'card-body')]//p[1]",
            "//div[contains(@class,'shared-action')]//p[1]",
            "//div[contains(@class,'action-content')]//p[1]",
            "//div[contains(@class,'markdown')]//p[1]",
            "//article//p[1]",
            "//main//p[1]",
            "//a[contains(normalize-space(.), '\u52a8\u4f5c\u7b80\u4ecb')]",
            "//div[contains(@class,'tab-pane') and contains(@class,'active')]//p[1]",
            "//div[contains(@class,'tab-pane') and contains(@class,'active')]//*[self::p or self::div][normalize-space()][1]",
            "//*[@id='actionIntro']//p[1]",
            "//*[@id='introContent']//p[1]",
            "//div[contains(@class,'intro')]//p[1]",
        ]
        for xpath in xpaths:
            loc = page.locator(f"xpath={xpath}")
            count = await loc.count()
            if count:
                text = (await loc.first.inner_text()).strip().replace("\n", " ")[:240]
                print(f"OK [{count}] {xpath}\n  => {text}\n")

        result = await page.evaluate(
            """() => {
            const hits = [];
            for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,strong,label,a,button,li,span,div')) {
                const t = (el.textContent || '').trim();
                if (t.includes('动作信息') || t.includes('动作简介')) {
                    hits.push({
                        tag: el.tagName,
                        class: String(el.className).slice(0, 80),
                        id: el.id,
                        text: t.slice(0, 120),
                    });
                }
            }
            const paragraphs = [...document.querySelectorAll('p')].slice(0, 15).map(p => ({
                class: String(p.className).slice(0, 80),
                text: (p.textContent || '').trim().slice(0, 160),
            }));
            return { hits: hits.slice(0, 15), paragraphs };
        }"""
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

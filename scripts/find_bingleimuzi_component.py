"""Find component selector for bingleimuzi balance card."""
from __future__ import annotations

import asyncio
import json
import sys

from playwright.async_api import async_playwright

STORAGE = "data/profiles/2/storage_state.json"
URL = "https://api.bingleimuzi.eu.cc/dashboard"
TEXT_XPATH = "//p[contains(normalize-space(.), '余额')]/following-sibling::p[1]"


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=STORAGE)
        page = await context.new_page()
        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.goto(URL, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(2_000)

        locator = page.locator(f"xpath={TEXT_XPATH}")
        print("text xpath count:", await locator.count())
        if await locator.count():
            print("balance text:", await locator.first.inner_text())

        candidates = await page.evaluate(
            """() => {
              const out = [];
              const seen = new Set();
              for (const el of document.querySelectorAll('*')) {
                const text = (el.innerText || '').trim();
                if (!/\\$\\s*[\\d,.]+/.test(text) || text.length > 80) continue;
                let node = el;
                for (let depth = 0; depth < 6 && node; depth += 1) {
                  const rect = node.getBoundingClientRect();
                  const cls = node.className?.toString?.() || '';
                  const key = `${node.tagName}:${cls}:${Math.round(rect.width)}x${Math.round(rect.height)}`;
                  if (rect.width < 60 || rect.height < 36 || rect.height > 320) {
                    node = node.parentElement;
                    continue;
                  }
                  if (seen.has(key)) break;
                  seen.add(key);
                  out.push({
                    tag: node.tagName.toLowerCase(),
                    class: cls.slice(0, 160),
                    text: text.slice(0, 80),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    depth,
                  });
                  break;
                }
              }
              return out.slice(0, 20);
            }"""
        )
        print("candidates:", json.dumps(candidates, ensure_ascii=False, indent=2))

        if await locator.count():
            component_xpath = await page.evaluate(
                """(xp) => {
                  const el = document.evaluate(
                    xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                  ).singleNodeValue;
                  if (!el) return null;
                  let node = el;
                  for (let i = 0; i < 6; i += 1) {
                    if (!(node instanceof Element)) break;
                    const rect = node.getBoundingClientRect();
                    const cls = node.className?.toString?.() || '';
                    if (rect.width >= 120 && rect.height >= 60 && rect.height <= 260) {
                      return {
                        tag: node.tagName.toLowerCase(),
                        class: cls,
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        depth: i,
                      };
                    }
                    node = node.parentElement;
                  }
                  return null;
                }""",
                TEXT_XPATH,
            )
            print("component candidate:", json.dumps(component_xpath, ensure_ascii=False, indent=2))

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

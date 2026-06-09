import { chromium, type Browser, type BrowserContext } from "playwright";

import { settings } from "../config.js";

export interface ChromeCdpStatus {
  enabled: boolean;
  url: string;
  available: boolean;
  browser_version: string | null;
  context_count: number;
  hint: string;
}

const CHROME_CDP_HINT =
  "Chrome 136+ 已禁止在默认配置目录开启调试。请先关闭所有 Chrome，再运行 .\\scripts\\launch-chrome-debug.ps1（会同步配置到 data/chrome-cdp-profile 并使用端口 19222）。";

function ensureLocalNoProxy(): void {
  const entries = ["127.0.0.1", "localhost", "::1"];
  const current = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  const parts = new Set(
    current
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  for (const entry of entries) {
    parts.add(entry);
  }
  const merged = [...parts].join(",");
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

ensureLocalNoProxy();

export async function probeChromeCdp(url = settings.chromeCdpUrl): Promise<ChromeCdpStatus> {
  if (!settings.chromeCdpEnabled) {
    return {
      enabled: false,
      url,
      available: false,
      browser_version: null,
      context_count: 0,
      hint: CHROME_CDP_HINT,
    };
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(url, { timeout: 2_000 });
    const version = browser.version();
    const contextCount = browser.contexts().length;
    return {
      enabled: true,
      url,
      available: true,
      browser_version: version,
      context_count: contextCount,
      hint: "已连接本机 Chrome，可直接导入登录态或在 Chrome 中选区",
    };
  } catch {
    return {
      enabled: true,
      url,
      available: false,
      browser_version: null,
      context_count: 0,
      hint: CHROME_CDP_HINT,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export async function withChromeCdp<T>(
  fn: (browser: Browser, context: BrowserContext) => Promise<T>,
  url = settings.chromeCdpUrl,
): Promise<T> {
  const browser = await chromium.connectOverCDP(url, { timeout: 5_000 });
  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("未在 Chrome 中找到可用上下文，请确认 Chrome 已用调试端口启动");
    }
    return await fn(browser, context);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

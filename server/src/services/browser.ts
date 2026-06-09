import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { Browser, BrowserContext, Page, Route } from "playwright";
import { chromium } from "playwright";

import { settings } from "../config.js";
import { probeChromeCdp, withChromeCdp } from "./chrome-cdp.js";
import { AsyncLock } from "./async-lock.js";
import { captureComponentElement, type ComponentCapturePayload } from "./component-capture.js";
import { runExtractScript } from "./extract-script.browser.js";
import { discoverSelectors as discoverSelectorsInPage } from "./selector-discovery.browser.js";
import type { SelectorPickPayload } from "./selector-picker.browser.js";
import { diagnoseFetchFailure } from "./fetch-failure.js";

const servicesDir = path.dirname(fileURLToPath(import.meta.url));

function readBrowserAsset(filename: string): string {
  return fs.readFileSync(path.join(servicesDir, filename), "utf8");
}

async function registerSelectorPickerScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: readBrowserAsset("selector-builder.browser.js") });
  await context.addInitScript({ content: readBrowserAsset("selector-picker-install.browser.js") });
}

async function ensureSelectorPickerOnPage(page: Page): Promise<void> {
  let hasPicker = false;
  try {
    hasPicker = await page.evaluate(() => Boolean(document.getElementById("wm-selector-picker-root")));
  } catch {
    return;
  }
  if (hasPicker) {
    return;
  }

  const injectScript = async (source: string): Promise<void> => {
    await page
      .evaluate((scriptSource) => {
        const script = document.createElement("script");
        script.textContent = scriptSource;
        const parent = document.documentElement ?? document.head ?? document.body;
        parent?.appendChild(script);
        script.remove();
      }, source)
      .catch(() => undefined);
  };

  await injectScript(readBrowserAsset("selector-builder.browser.js"));
  await injectScript(readBrowserAsset("selector-picker-install.browser.js"));
}

function urlsMatchTarget(currentUrl: string, targetUrl: string): boolean {
  if (!currentUrl || currentUrl === "about:blank") {
    return false;
  }
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return (
      current.protocol === target.protocol &&
      current.host === target.host &&
      current.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

function isNavigationTimeout(error: unknown): boolean {
  return error instanceof Error && /Timeout \d+ms exceeded/i.test(error.message);
}

async function settleAfterNavigation(page: Page, timeoutMs: number): Promise<void> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 12_000) })
    .catch(() => undefined);
  await page
    .waitForLoadState("load", { timeout: Math.min(timeoutMs, 15_000) })
    .catch(() => undefined);
  await page.waitForTimeout(settings.previewRenderWaitMs);
}

/** Fast navigation for interactive pick sessions — picker is injected via addInitScript. */
async function navigateForSelectorPick(page: Page, url: string, timeoutMs: number): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "commit", timeout: timeoutMs });
  } catch (error) {
    if (!isNavigationTimeout(error)) {
      throw error;
    }
    if (!urlsMatchTarget(page.url(), url)) {
      await page.goto(url, { waitUntil: "commit", timeout: timeoutMs });
    }
  }

  await page
    .waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 8_000) })
    .catch(() => undefined);
}

/** Tolerate SPAs that never fire domcontentloaded within the timeout. */
async function navigateToUrl(page: Page, url: string, timeoutMs: number): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  } catch (error) {
    if (!isNavigationTimeout(error)) {
      throw error;
    }
    if (!urlsMatchTarget(page.url(), url)) {
      await page.goto(url, { waitUntil: "commit", timeout: timeoutMs });
    }
  }
  await settleAfterNavigation(page, timeoutMs);
}

async function reloadCurrentPage(page: Page, timeoutMs: number): Promise<void> {
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  } catch (error) {
    if (!isNavigationTimeout(error)) {
      throw error;
    }
    await page.reload({ waitUntil: "commit", timeout: timeoutMs }).catch(() => undefined);
  }
  await settleAfterNavigation(page, timeoutMs);
}

export interface FetchResult {
  content: string | null;
  screenshot_path: string | null;
  error?: string | null;
}

export interface PreviewResult {
  screenshot_path: string | null;
  element_screenshot_path?: string | null;
  final_url: string | null;
  page_title: string | null;
  selector_content: string | null;
  component_content?: string | null;
  render_content?: string | null;
  match_count?: number;
  profile_id: number | null;
  error?: string | null;
}

export interface SelectorCandidate {
  selector: string;
  selector_type: string;
  label: string;
  tag: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface DiscoverSelectorsResult {
  screenshot_path: string | null;
  final_url: string | null;
  page_title: string | null;
  candidates: SelectorCandidate[];
  profile_id: number | null;
  error?: string | null;
}

export interface SelectorPickResult {
  selector: string;
  selector_type: string;
  label: string;
  tag: string;
  final_url: string | null;
  page_title: string | null;
}

export type PickSelectorSessionStatus =
  | "starting"
  | "active"
  | "picked"
  | "cancelled"
  | "error"
  | "closed";

export interface PickSelectorSessionRead {
  session_id: string;
  status: PickSelectorSessionStatus;
  url: string;
  profile_id: number | null;
  result: SelectorPickResult | null;
  error_message: string | null;
  message: string | null;
}

interface ContextEntry {
  context: BrowserContext;
  profileId: number | null;
  storageMtime: number | null;
  lock: AsyncLock;
}

interface PageEntry {
  page: Page;
  monitorId: number;
  url: string;
  profileId: number | null;
  routesReady: boolean;
  lock: AsyncLock;
}

class PickSelectorSession {
  sessionId: string;
  url: string;
  profileId: number | null;
  status: PickSelectorSessionStatus = "starting";
  result: SelectorPickResult | null = null;
  errorMessage: string | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private detachBrowser = false;
  private readonly useChromeCdp: boolean;

  constructor(sessionId: string, url: string, profileId: number | null, useChromeCdp = false) {
    this.sessionId = sessionId;
    this.url = url;
    this.profileId = profileId;
    this.useChromeCdp = useChromeCdp;
  }

  private markClosed(): void {
    if (this.status === "active" || this.status === "starting") {
      this.status = "cancelled";
    } else if (this.status !== "picked" && this.status !== "cancelled" && this.status !== "error") {
      this.status = "closed";
    }
  }

  async open(): Promise<void> {
    if (this.useChromeCdp) {
      this.browser = await chromium.connectOverCDP(settings.chromeCdpUrl, { timeout: 5_000 });
      this.detachBrowser = true;
      this.context = this.browser.contexts()[0] ?? null;
      if (!this.context) {
        throw new Error("未连接本机 Chrome，请先用调试端口启动 Chrome");
      }
      await registerSelectorPickerScripts(this.context);
      this.page = await this.context.newPage();
    } else {
      this.browser = await chromium.launch({ headless: false });

      const contextOptions: Parameters<Browser["newContext"]>[0] = {
        viewport: { width: 1280, height: 800 },
        locale: "zh-CN",
      };

      if (this.profileId !== null) {
        const storagePath = browserManager.profileStoragePath(this.profileId);
        if (fs.existsSync(storagePath)) {
          contextOptions.storageState = storagePath;
        }
      }

      this.context = await this.browser.newContext(contextOptions);
      await registerSelectorPickerScripts(this.context);
      this.page = await this.context.newPage();
    }

    const page = this.page;
    page.on("close", () => this.markClosed());
    this.context.on("close", () => this.markClosed());
    page.on("domcontentloaded", () => {
      void ensureSelectorPickerOnPage(page);
    });

    await page.exposeFunction("__wmPickConfirm", (payload: SelectorPickPayload) => {
      this.result = {
        selector: payload.selector,
        selector_type: payload.selector_type,
        label: payload.label,
        tag: payload.tag,
        final_url: page.url(),
        page_title: null,
      };
      this.status = "picked";
      void this.closeAfterPick();
    });

    await page.exposeFunction("__wmPickCancel", () => {
      this.status = "cancelled";
      void this.close();
    });

    if (
      !this.useChromeCdp &&
      this.profileId !== null &&
      !browserManager.profileHasStorage(this.profileId)
    ) {
      throw new Error("该配置档尚未保存登录状态，请先登录并保存");
    }

    this.status = "active";

    try {
      await navigateForSelectorPick(page, this.url, settings.previewTimeoutMs);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      if (this.status === "active") {
        this.status = "error";
      }
    } finally {
      await ensureSelectorPickerOnPage(page);
    }
  }

  private async closeAfterPick(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      try {
        this.result = {
          ...(this.result as SelectorPickResult),
          page_title: await this.page.title(),
        };
      } catch {
        // ignore title read errors during shutdown
      }
    }
    await this.close();
  }

  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close().catch(() => undefined);
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
    if (this.browser) {
      if (this.detachBrowser) {
        await this.browser.close().catch(() => undefined);
      } else {
        await this.browser.close().catch(() => undefined);
      }
      this.browser = null;
    }
    if (this.status === "starting" || this.status === "active") {
      this.status = "cancelled";
    }
  }

  toJSON(): PickSelectorSessionRead {
    return {
      session_id: this.sessionId,
      status: this.status,
      url: this.url,
      profile_id: this.profileId,
      result: this.result,
      error_message: this.errorMessage,
      message:
        this.status === "active"
          ? this.useChromeCdp
            ? "已在你的 Chrome 中打开新标签，请使用右下角悬浮球点选并确认"
            : "浏览器已打开，请使用右下角悬浮球点选页面元素并确认"
          : null,
    };
  }
}

class LoginSession {
  profileId: number;
  startUrl: string;
  status = "starting";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private detachBrowser = false;
  private ended = false;
  private readonly useChromeCdp: boolean;
  private onEnded: (() => void) | null = null;

  constructor(profileId: number, startUrl: string | null, useChromeCdp = false) {
    this.profileId = profileId;
    this.startUrl = startUrl ?? "about:blank";
    this.useChromeCdp = useChromeCdp;
  }

  setOnEnded(callback: () => void): void {
    this.onEnded = callback;
  }

  isAlive(): boolean {
    if (this.status === "saved" || this.status === "closed") {
      return false;
    }
    if (this.page && !this.page.isClosed()) {
      return true;
    }
    if (this.context && this.browser && !this.browser.isConnected()) {
      return false;
    }
    return this.status === "starting";
  }

  private notifyEnded(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.status !== "saved") {
      this.status = "closed";
    }
    this.onEnded?.();
  }

  private bindLifecycle(page: Page, context: BrowserContext): void {
    this.page = page;
    this.context = context;
    page.on("close", () => this.notifyEnded());
    context.on("close", () => this.notifyEnded());
    if (this.browser) {
      this.browser.on("disconnected", () => this.notifyEnded());
    }
  }

  async open(): Promise<void> {
    if (this.useChromeCdp) {
      this.browser = await chromium.connectOverCDP(settings.chromeCdpUrl, { timeout: 5_000 });
      this.detachBrowser = true;
      const context = this.browser.contexts()[0] ?? null;
      if (!context) {
        throw new Error("未连接本机 Chrome，请先用调试端口启动 Chrome");
      }
      const page = await context.newPage();
      this.bindLifecycle(page, context);
      await navigateToUrl(page, this.startUrl, settings.browserTimeoutMs);
      this.status = "active";
      return;
    }

    this.browser = await chromium.launch({ headless: false });

    const contextOptions: Parameters<Browser["newContext"]>[0] = {
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
    };

    const storagePath = browserManager.profileStoragePath(this.profileId);
    if (fs.existsSync(storagePath)) {
      contextOptions.storageState = storagePath;
    }

    const context = await this.browser.newContext(contextOptions);
    const page = await context.newPage();
    this.bindLifecycle(page, context);
    await navigateToUrl(page, this.startUrl, settings.browserTimeoutMs);
    this.status = "active";
  }

  async save(storagePath: string): Promise<void> {
    if (!this.context) {
      throw new Error("登录会话未启动");
    }
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    await this.context.storageState({ path: storagePath });
    this.status = "saved";
  }

  async close(): Promise<void> {
    if (this.context && !this.detachBrowser) {
      await this.context.close();
      this.context = null;
    } else {
      this.context = null;
    }
    if (this.browser) {
      if (this.detachBrowser) {
        await this.browser.close();
      } else {
        await this.browser.close();
      }
      this.browser = null;
    }
    if (this.status !== "saved") {
      this.status = "closed";
    }
  }
}

class BrowserManager {
  private browser: Browser | null = null;
  private startLock = new AsyncLock();
  private loginSessions = new Map<number, LoginSession>();
  private pickSessions = new Map<string, PickSelectorSession>();
  private contextPool = new Map<string, ContextEntry>();
  private pagePool = new Map<number, PageEntry>();

  async start(): Promise<void> {
    await this.startLock.run(async () => {
      if (this.browser) return;
      this.browser = await chromium.launch({ headless: settings.headless });
    });
  }

  async stop(): Promise<void> {
    for (const session of this.pickSessions.values()) {
      await session.close();
    }
    this.pickSessions.clear();

    for (const session of this.loginSessions.values()) {
      await session.close();
    }
    this.loginSessions.clear();
    await this.clearPools();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  profileStoragePath(profileId: number): string {
    return path.join(settings.profilesDir, String(profileId), "storage_state.json");
  }

  profileHasStorage(profileId: number): boolean {
    return fs.existsSync(this.profileStoragePath(profileId));
  }

  private poolKey(profileId: number | null): string {
    return profileId !== null ? `profile:${profileId}` : "profile:none";
  }

  /** Serialize pooled fetches that share cookies/storage for the same profile. */
  private async withPooledContextLock<T>(
    profileId: number | null,
    ephemeral: boolean,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (ephemeral || !settings.browserKeepAlive) {
      return fn();
    }

    const entry = this.contextPool.get(this.poolKey(profileId));
    if (!entry) {
      return fn();
    }

    return entry.lock.run(fn);
  }

  private storageMtime(profileId: number | null): number | null {
    if (profileId === null) return null;
    const storagePath = this.profileStoragePath(profileId);
    if (!fs.existsSync(storagePath)) return null;
    return fs.statSync(storagePath).mtimeMs;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.start();
    }
    if (!this.browser) {
      throw new Error("Browser failed to start");
    }
    return this.browser;
  }

  private async clearPools(): Promise<void> {
    for (const monitorId of [...this.pagePool.keys()]) {
      await this.discardPage(monitorId);
    }
    for (const key of [...this.contextPool.keys()]) {
      await this.discardContext(key);
    }
  }

  private async discardPage(monitorId: number): Promise<void> {
    const entry = this.pagePool.get(monitorId);
    if (!entry) return;
    this.pagePool.delete(monitorId);
    await entry.lock.run(async () => {
      if (!entry.page.isClosed()) {
        await entry.page.close();
      }
    });
  }

  private async discardContext(key: string): Promise<void> {
    const entry = this.contextPool.get(key);
    if (!entry) return;
    this.contextPool.delete(key);

    for (const [monitorId, pageEntry] of this.pagePool.entries()) {
      if (pageEntry.page.context() === entry.context) {
        await this.discardPage(monitorId);
      }
    }

    await entry.lock.run(async () => {
      await entry.context.close();
    });
  }

  async invalidateProfile(profileId: number): Promise<void> {
    if (!settings.browserKeepAlive) return;
    const key = this.poolKey(profileId);
    for (const [monitorId, pageEntry] of this.pagePool.entries()) {
      if (pageEntry.profileId === profileId) {
        await this.discardPage(monitorId);
      }
    }
    await this.discardContext(key);
  }

  async createIsolatedContext(
    profileId: number | null = null,
    options?: { headless?: boolean },
  ): Promise<BrowserContext> {
    const contextOptions: Parameters<Browser["newContext"]>[0] = {
      viewport: { width: 1280, height: 720 },
      locale: "zh-CN",
    };

    if (profileId !== null) {
      const storagePath = this.profileStoragePath(profileId);
      if (fs.existsSync(storagePath)) {
        contextOptions.storageState = storagePath;
      }
    }

    if (options?.headless === false) {
      const headedBrowser = await chromium.launch({ headless: false });
      return headedBrowser.newContext(contextOptions);
    }

    const browser = await this.ensureBrowser();
    return browser.newContext(contextOptions);
  }

  private async getContextEntry(profileId: number | null): Promise<ContextEntry> {
    const key = this.poolKey(profileId);
    const mtime = this.storageMtime(profileId);

    let entry = this.contextPool.get(key);
    if (entry) {
      const staleStorage = entry.storageMtime !== mtime;
      const contextDead = !entry.context.browser()?.isConnected();
      if (staleStorage || contextDead) {
        await this.discardContext(key);
        entry = undefined;
      }
    }

    if (!entry) {
      const context = await this.createIsolatedContext(profileId);
      entry = {
        context,
        profileId,
        storageMtime: mtime,
        lock: new AsyncLock(),
      };
      this.contextPool.set(key, entry);
    }
    return entry;
  }

  private async getPageEntry(options: {
    monitorId: number | null;
    url: string;
    profileId: number | null;
  }): Promise<{ entry: PageEntry; ephemeral: boolean }> {
    const { monitorId, url, profileId } = options;

    if (!settings.browserKeepAlive) {
      const context = await this.createIsolatedContext(profileId);
      const page = await context.newPage();
      return {
        entry: {
          page,
          monitorId: monitorId ?? -1,
          url,
          profileId,
          routesReady: false,
          lock: new AsyncLock(),
        },
        ephemeral: true,
      };
    }

    if (monitorId === null) {
      const contextEntry = await this.getContextEntry(profileId);
      const page = await contextEntry.lock.run(() => contextEntry.context.newPage());
      return {
        entry: {
          page,
          monitorId: -1,
          url,
          profileId,
          routesReady: false,
          lock: new AsyncLock(),
        },
        ephemeral: true,
      };
    }

    let existing = this.pagePool.get(monitorId);
    if (existing) {
      if (
        existing.url !== url ||
        existing.profileId !== profileId ||
        existing.page.isClosed()
      ) {
        await this.discardPage(monitorId);
        existing = undefined;
      }
    }

    if (existing) {
      return { entry: existing, ephemeral: false };
    }

    const contextEntry = await this.getContextEntry(profileId);
    const page = await contextEntry.lock.run(() => contextEntry.context.newPage());
    const pageEntry: PageEntry = {
      page,
      monitorId,
      url,
      profileId,
      routesReady: false,
      lock: new AsyncLock(),
    };
    this.pagePool.set(monitorId, pageEntry);
    return { entry: pageEntry, ephemeral: false };
  }

  private resolveLocator(page: Page, selector: string, selectorType: string) {
    if (selectorType === "xpath") {
      return page.locator(`xpath=${selector}`);
    }
    return page.locator(selector);
  }

  private sameTarget(currentUrl: string, targetUrl: string): boolean {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return (
      current.protocol === target.protocol &&
      current.host === target.host &&
      current.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")
    );
  }

  private async ensureRoutes(pageEntry: PageEntry): Promise<void> {
    if (pageEntry.routesReady) return;

    await pageEntry.page.route("**/*", async (route: Route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
        await route.abort();
      } else {
        await route.continue();
      }
    });
    pageEntry.routesReady = true;
  }

  private async refreshPage(pageEntry: PageEntry, url: string, timeoutMs: number): Promise<void> {
    await this.ensureRoutes(pageEntry);
    const page = pageEntry.page;
    const currentUrl = page.url();
    if (currentUrl === "about:blank" || currentUrl === "" || !this.sameTarget(currentUrl, url)) {
      await navigateToUrl(page, url, timeoutMs);
    } else {
      await reloadCurrentPage(page, timeoutMs);
    }
  }

  private async waitForTarget(
    page: Page,
    locator: ReturnType<Page["locator"]>,
    timeoutMs: number,
    selector: string,
    selectorType: string,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastCount = 0;

    while (Date.now() < deadline) {
      lastCount = await locator.count();
      if (lastCount > 0) {
        try {
          await locator.first().scrollIntoViewIfNeeded({ timeout: 3_000 });
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          await locator.first().waitFor({
            state: "visible",
            timeout: Math.min(2_000, remaining),
          });
          return;
        } catch {
          // Element exists but is not visible yet; keep polling.
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await page.waitForTimeout(Math.min(500, remaining));
    }

    lastCount = await locator.count();
    if (lastCount === 0) {
      throw new Error(
        `选择器未匹配到任何元素（0 个）。页面可能仍在加载，或 DOM 已变化，请重新点选组件。选择器: ${selectorType}=${selector}`,
      );
    }
    throw new Error(
      `选择器匹配到 ${lastCount} 个元素，但在 ${timeoutMs}ms 内未变为可见。选择器: ${selectorType}=${selector}`,
    );
  }

  async fetchContent(options: {
    url: string;
    selector: string;
    selector_type?: string;
    extract_mode?: string;
    extract_script?: string | null;
    profile_id?: number | null;
    monitor_id?: number | null;
  }): Promise<FetchResult> {
    const {
      url,
      selector,
      selector_type = "css",
      extract_mode = "text",
      extract_script = null,
      profile_id = null,
      monitor_id = null,
    } = options;

    const { entry: pageEntry, ephemeral } = await this.getPageEntry({
      monitorId: monitor_id,
      url,
      profileId: profile_id,
    });

    try {
      return await this.withPooledContextLock(profile_id, ephemeral, () =>
        pageEntry.lock.run(async () => {
          const timeoutMs = settings.browserTimeoutMs;
          pageEntry.page.setDefaultTimeout(timeoutMs);
          await this.refreshPage(pageEntry, url, timeoutMs);

          const locator = this.resolveLocator(pageEntry.page, selector, selector_type);
          await this.waitForTarget(
            pageEntry.page,
            locator,
            settings.previewSelectorTimeoutMs,
            selector,
            selector_type,
          );

          let content: string | null;
          if (extract_mode === "component") {
            const payload = await locator.first().evaluate(captureComponentElement);
            if (!payload) {
              throw new Error(`未找到匹配元素: ${selector}`);
            }
            content = JSON.stringify(payload);
          } else if (extract_mode === "script") {
            if (!extract_script?.trim()) {
              throw new Error("抓取脚本不能为空");
            }
            if (extract_script.includes("contribution-tooltip")) {
              await locator
                .locator("[data-tooltip-html]")
                .first()
                .waitFor({ state: "attached", timeout: settings.previewSelectorTimeoutMs })
                .catch(() => undefined);
            }
            const payload = await locator.first().evaluate(runExtractScript, extract_script);
            content = JSON.stringify(payload);
          } else if (extract_mode === "html") {
            content = await locator.first().innerHTML();
          } else {
            content = await locator.first().innerText();
          }

          let screenshotPath: string | null = null;
          if (monitor_id !== null) {
            const screenshotFile = path.join(
              settings.screenshotsDir,
              `monitor_${monitor_id}_${Date.now()}.png`,
            );
            await locator.first().screenshot({ path: screenshotFile });
            screenshotPath = screenshotFile;
          }

          return {
            content: content?.trim() ?? "",
            screenshot_path: screenshotPath,
          };
        }),
      );
    } catch (error) {
      if (monitor_id !== null && settings.browserKeepAlive) {
        await this.discardPage(monitor_id);
      }
      const originalError = error instanceof Error ? error.message : String(error);
      const diagnosis = await diagnoseFetchFailure(
        pageEntry.page.isClosed() ? null : pageEntry.page,
        { url, profileId: profile_id, originalError },
      );
      return {
        content: null,
        screenshot_path: null,
        error: diagnosis.message,
      };
    } finally {
      if (ephemeral) {
        const context = pageEntry.page.context();
        if (!pageEntry.page.isClosed()) {
          await pageEntry.page.close();
        }
        if (!settings.browserKeepAlive) {
          await context.close();
        }
      }
    }
  }

  async previewPage(options: {
    url: string;
    profile_id?: number | null;
    selector?: string | null;
    selector_type?: string;
    extract_mode?: string;
    extract_script?: string | null;
    monitor_id?: number | null;
  }): Promise<PreviewResult> {
    const {
      url,
      profile_id = null,
      selector = null,
      selector_type = "css",
      extract_mode = "text",
      extract_script = null,
      monitor_id = null,
    } = options;

    if (profile_id !== null && !this.profileHasStorage(profile_id)) {
      return {
        screenshot_path: null,
        final_url: null,
        page_title: null,
        selector_content: null,
        profile_id,
        error: "该监控关联的配置档尚未保存登录状态，请先在「登录配置档」中登录并保存",
      };
    }

    const { entry: pageEntry, ephemeral } = await this.getPageEntry({
      monitorId: monitor_id,
      url,
      profileId: profile_id,
    });

    try {
      return await this.withPooledContextLock(profile_id, ephemeral, () =>
        pageEntry.lock.run(async () => {
        const timeoutMs = settings.previewTimeoutMs;
        pageEntry.page.setDefaultTimeout(timeoutMs);
        await this.refreshPage(pageEntry, url, timeoutMs);

        let selectorContent: string | null = null;
        let componentContent: string | null = null;
        let renderContent: string | null = null;
        let elementScreenshotPath: string | null = null;
        let matchCount = 0;
        const stamp = Date.now();
        const suffix = monitor_id !== null ? `monitor_${monitor_id}` : "draft";

        if (selector) {
          const locator = this.resolveLocator(pageEntry.page, selector, selector_type);
          try {
            await this.waitForTarget(
              pageEntry.page,
              locator,
              settings.previewSelectorTimeoutMs,
              selector,
              selector_type,
            );
            matchCount = await locator.count();

            if (extract_mode === "component") {
              const payload = (await locator
                .first()
                .evaluate(captureComponentElement)) as ComponentCapturePayload | null;
              if (!payload) {
                throw new Error(`未找到匹配元素: ${selector}`);
              }
              componentContent = JSON.stringify(payload);
              selectorContent =
                `${payload.tag_name || "component"}` +
                (payload.node_count ? ` · ${payload.node_count} 节点` : "");
            } else if (extract_mode === "script") {
              if (!extract_script?.trim()) {
                throw new Error("抓取脚本不能为空");
              }
              if (extract_script.includes("contribution-tooltip")) {
                await locator
                  .locator("[data-tooltip-html]")
                  .first()
                  .waitFor({ state: "attached", timeout: settings.previewSelectorTimeoutMs })
                  .catch(() => undefined);
              }
              const payload = await locator.first().evaluate(runExtractScript, extract_script);
              renderContent = JSON.stringify(payload);
              selectorContent = "自定义 HTML";
            } else if (extract_mode === "html") {
              selectorContent = await locator.first().innerHTML();
            } else {
              selectorContent = (await locator.first().innerText()).trim();
            }

            const elementFile = path.join(
              settings.screenshotsDir,
              `preview_${suffix}_element_${stamp}.png`,
            );
            await locator.first().screenshot({ path: elementFile });
            elementScreenshotPath = elementFile;
          } catch (error) {
            return {
              screenshot_path: null,
              final_url: pageEntry.page.url(),
              page_title: await pageEntry.page.title(),
              selector_content: null,
              profile_id,
              match_count: matchCount,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }

        const screenshotFile = path.join(settings.screenshotsDir, `preview_${suffix}_${stamp}.png`);
        await pageEntry.page.screenshot({ path: screenshotFile, fullPage: false });

        return {
          screenshot_path: screenshotFile,
          element_screenshot_path: elementScreenshotPath,
          final_url: pageEntry.page.url(),
          page_title: await pageEntry.page.title(),
          selector_content: selectorContent,
          component_content: componentContent,
          render_content: renderContent,
          match_count: matchCount,
          profile_id,
        };
        }),
      );
    } catch (error) {
      if (monitor_id !== null && settings.browserKeepAlive) {
        await this.discardPage(monitor_id);
      }
      return {
        screenshot_path: null,
        final_url: null,
        page_title: null,
        selector_content: null,
        profile_id,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (ephemeral) {
        const context = pageEntry.page.context();
        if (!pageEntry.page.isClosed()) {
          await pageEntry.page.close();
        }
        if (!settings.browserKeepAlive) {
          await context.close();
        }
      }
    }
  }

  async discoverSelectors(
    url: string,
    profileId: number | null = null,
  ): Promise<DiscoverSelectorsResult> {
    if (profileId !== null && !this.profileHasStorage(profileId)) {
      return {
        screenshot_path: null,
        final_url: null,
        page_title: null,
        candidates: [],
        profile_id: profileId,
        error: "该配置档尚未保存登录状态，请先在「登录配置档」中登录并保存",
      };
    }

    const { entry: pageEntry, ephemeral } = await this.getPageEntry({
      monitorId: null,
      url,
      profileId,
    });

    try {
      return await pageEntry.lock.run(async () => {
        const timeoutMs = settings.previewTimeoutMs;
        pageEntry.page.setDefaultTimeout(timeoutMs);
        await this.refreshPage(pageEntry, url, timeoutMs);

        const candidates = (await pageEntry.page.evaluate(
          discoverSelectorsInPage,
        )) as SelectorCandidate[];
        const screenshotFile = path.join(settings.screenshotsDir, `discover_${Date.now()}.png`);
        await pageEntry.page.screenshot({ path: screenshotFile, fullPage: false });

        return {
          screenshot_path: screenshotFile,
          final_url: pageEntry.page.url(),
          page_title: await pageEntry.page.title(),
          candidates: candidates ?? [],
          profile_id: profileId,
        };
      });
    } catch (error) {
      return {
        screenshot_path: null,
        final_url: null,
        page_title: null,
        candidates: [],
        profile_id: profileId,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (ephemeral) {
        const context = pageEntry.page.context();
        if (!pageEntry.page.isClosed()) {
          await pageEntry.page.close();
        }
        if (!settings.browserKeepAlive) {
          await context.close();
        }
      }
    }
  }

  async getChromeCdpStatus() {
    return probeChromeCdp();
  }

  async importChromeLogin(profileId: number): Promise<string> {
    const storagePath = this.profileStoragePath(profileId);
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });

    await withChromeCdp(async (_browser, context) => {
      await context.storageState({ path: storagePath });
    });

    await this.invalidateProfile(profileId);
    return storagePath;
  }

  reconcileLoginSession(profileId: number): boolean {
    const session = this.loginSessions.get(profileId);
    if (!session) {
      return false;
    }
    if (session.isAlive()) {
      return false;
    }
    this.loginSessions.delete(profileId);
    return true;
  }

  private attachLoginSession(session: LoginSession): void {
    session.setOnEnded(() => {
      const current = this.loginSessions.get(session.profileId);
      if (current === session) {
        this.loginSessions.delete(session.profileId);
      }
    });
  }

  async startLoginSession(
    profileId: number,
    startUrl: string,
    useChromeCdp = false,
  ): Promise<void> {
    this.reconcileLoginSession(profileId);

    const existing = this.loginSessions.get(profileId);
    if (existing?.isAlive()) {
      throw new Error("该配置档已有进行中的登录会话，请先保存/取消，或关闭残留会话");
    }
    if (existing) {
      this.loginSessions.delete(profileId);
    }

    const session = new LoginSession(profileId, startUrl, useChromeCdp);
    this.loginSessions.set(profileId, session);
    this.attachLoginSession(session);
    try {
      await session.open();
    } catch (error) {
      this.loginSessions.delete(profileId);
      throw error;
    }
  }

  async saveLoginSession(profileId: number): Promise<string> {
    const session = this.loginSessions.get(profileId);
    if (!session) {
      throw new Error("没有进行中的登录会话");
    }

    const storagePath = this.profileStoragePath(profileId);
    await session.save(storagePath);
    await session.close();
    this.loginSessions.delete(profileId);
    await this.invalidateProfile(profileId);
    return storagePath;
  }

  async cancelLoginSession(profileId: number): Promise<void> {
    const session = this.loginSessions.get(profileId);
    if (session) {
      await session.close();
      this.loginSessions.delete(profileId);
    }
  }

  async startPickSelectorSession(
    url: string,
    profileId: number | null,
    useChromeCdp = false,
  ): Promise<PickSelectorSessionRead> {
    if (
      !useChromeCdp &&
      profileId !== null &&
      !this.profileHasStorage(profileId)
    ) {
      throw new Error("该配置档尚未保存登录状态，请先在浏览器中登录并保存");
    }

    const sessionId = `pick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = new PickSelectorSession(sessionId, url, profileId, useChromeCdp);
    this.pickSessions.set(sessionId, session);

    try {
      await session.open();
    } catch (error) {
      session.errorMessage = error instanceof Error ? error.message : String(error);
      session.status = "error";
      await session.close();
      this.pickSessions.delete(sessionId);
      throw error;
    }

    return session.toJSON();
  }

  getPickSelectorSession(sessionId: string): PickSelectorSessionRead | null {
    const session = this.pickSessions.get(sessionId);
    if (!session) return null;

    const payload = session.toJSON();
    if (session.status === "picked" || session.status === "cancelled" || session.status === "error") {
      setTimeout(() => this.pickSessions.delete(sessionId), 30_000).unref?.();
    }
    return payload;
  }

  async cancelPickSelectorSession(sessionId: string): Promise<void> {
    const session = this.pickSessions.get(sessionId);
    if (!session) return;
    session.status = "cancelled";
    await session.close();
    this.pickSessions.delete(sessionId);
  }
}

export const browserManager = new BrowserManager();

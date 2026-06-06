import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import type { Browser, BrowserContext, Page, Route } from "playwright";
import { chromium } from "playwright";

import { settings } from "../config.js";
import { AsyncLock } from "./async-lock.js";
import { captureComponentElement, type ComponentCapturePayload } from "./component-capture.js";
import { discoverSelectors as discoverSelectorsInPage } from "./selector-discovery.browser.js";

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

class LoginSession {
  profileId: number;
  startUrl: string;
  status = "starting";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(profileId: number, startUrl: string | null) {
    this.profileId = profileId;
    this.startUrl = startUrl ?? "about:blank";
  }

  async open(): Promise<void> {
    this.browser = await chromium.launch({ headless: false });

    const contextOptions: Parameters<Browser["newContext"]>[0] = {
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
    };

    const storagePath = browserManager.profileStoragePath(this.profileId);
    if (fs.existsSync(storagePath)) {
      contextOptions.storageState = storagePath;
    }

    this.context = await this.browser.newContext(contextOptions);
    const page = await this.context.newPage();
    await page.goto(this.startUrl, { waitUntil: "domcontentloaded" });
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
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
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
  private contextPool = new Map<string, ContextEntry>();
  private pagePool = new Map<number, PageEntry>();

  async start(): Promise<void> {
    await this.startLock.run(async () => {
      if (this.browser) return;
      this.browser = await chromium.launch({ headless: settings.headless });
    });
  }

  async stop(): Promise<void> {
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
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } else {
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    }
    await page.waitForTimeout(settings.previewRenderWaitMs);
  }

  async fetchContent(options: {
    url: string;
    selector: string;
    selector_type?: string;
    extract_mode?: string;
    profile_id?: number | null;
    monitor_id?: number | null;
  }): Promise<FetchResult> {
    const {
      url,
      selector,
      selector_type = "css",
      extract_mode = "text",
      profile_id = null,
      monitor_id = null,
    } = options;

    const { entry: pageEntry, ephemeral } = await this.getPageEntry({
      monitorId: monitor_id,
      url,
      profileId: profile_id,
    });

    try {
      return await pageEntry.lock.run(async () => {
        const timeoutMs = settings.browserTimeoutMs;
        pageEntry.page.setDefaultTimeout(timeoutMs);
        await this.refreshPage(pageEntry, url, timeoutMs);

        const locator = this.resolveLocator(pageEntry.page, selector, selector_type);
        await locator.first().waitFor({
          state: "visible",
          timeout: settings.previewSelectorTimeoutMs,
        });

        let content: string | null;
        if (extract_mode === "component") {
          const payload = await locator.first().evaluate(captureComponentElement);
          if (!payload) {
            throw new Error(`未找到匹配元素: ${selector}`);
          }
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
      });
    } catch (error) {
      if (monitor_id !== null && settings.browserKeepAlive) {
        await this.discardPage(monitor_id);
      }
      return {
        content: null,
        screenshot_path: null,
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

  async previewPage(options: {
    url: string;
    profile_id?: number | null;
    selector?: string | null;
    selector_type?: string;
    extract_mode?: string;
    monitor_id?: number | null;
  }): Promise<PreviewResult> {
    const {
      url,
      profile_id = null,
      selector = null,
      selector_type = "css",
      extract_mode = "text",
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
      return await pageEntry.lock.run(async () => {
        const timeoutMs = settings.previewTimeoutMs;
        pageEntry.page.setDefaultTimeout(timeoutMs);
        await this.refreshPage(pageEntry, url, timeoutMs);

        let selectorContent: string | null = null;
        let componentContent: string | null = null;
        let elementScreenshotPath: string | null = null;
        let matchCount = 0;
        const stamp = Date.now();
        const suffix = monitor_id !== null ? `monitor_${monitor_id}` : "draft";

        if (selector) {
          const locator = this.resolveLocator(pageEntry.page, selector, selector_type);
          try {
            await locator.first().waitFor({
              state: "visible",
              timeout: settings.previewSelectorTimeoutMs,
            });
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
          match_count: matchCount,
          profile_id,
        };
      });
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

  async startLoginSession(profileId: number, startUrl: string): Promise<void> {
    if (this.loginSessions.has(profileId)) {
      throw new Error("该配置档已有进行中的登录会话");
    }

    const session = new LoginSession(profileId, startUrl);
    this.loginSessions.set(profileId, session);
    await session.open();
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
}

export const browserManager = new BrowserManager();

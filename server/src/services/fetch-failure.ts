import type { Page } from "playwright";

import { profileRepo } from "../db.js";
import { browserManager } from "./browser.js";
import { analyzeAuthHint } from "./auth-hint.browser.js";

export const AUTH_EXPIRED_PREFIX = "[auth_expired]";

export interface FetchFailureContext {
  url: string;
  profileId: number | null;
  originalError: string;
}

export interface FetchFailureDiagnosis {
  message: string;
  authExpired: boolean;
}

function isSelectorMissError(message: string): boolean {
  return (
    message.includes("选择器未匹配") ||
    message.includes("未找到匹配元素") ||
    message.includes("未找到匹配")
  );
}

export async function diagnoseFetchFailure(
  page: Page | null,
  context: FetchFailureContext,
): Promise<FetchFailureDiagnosis> {
  const { url, profileId, originalError } = context;
  const hasProfileStorage =
    profileId !== null && browserManager.profileHasStorage(profileId);
  const profile = profileId !== null ? profileRepo.get(profileId) : null;
  const selectorMiss = isSelectorMissError(originalError);

  let hint: {
    likely_auth_failure: boolean;
    page_url: string;
    page_title: string;
  } | null = null;

  if (page && !page.isClosed()) {
    try {
      hint = await page.evaluate(analyzeAuthHint, url);
    } catch {
      // ignore page evaluation errors during shutdown
    }
  }

  const likelyAuth =
    Boolean(hint?.likely_auth_failure) || (hasProfileStorage && selectorMiss);

  if (!likelyAuth) {
    return { message: originalError, authExpired: false };
  }

  if (profileId !== null) {
    profileRepo.updateLoginStatus(profileId, "expired");
  }

  const profileLabel = profile?.name ?? "登录配置档";
  const pageHint = hint?.page_title
    ? `当前页面标题：「${hint.page_title}」`
    : hint?.page_url
      ? `当前页面：${hint.page_url}`
      : "";

  let message: string;
  if (hint?.likely_auth_failure) {
    message = `登录可能已失效（${profileLabel}）。页面已跳转到登录或验证界面，请重新登录并保存后再抓取。${pageHint ? ` ${pageHint}` : ""}`;
  } else if (hasProfileStorage && selectorMiss) {
    message = `选择器未匹配到内容，该监控依赖「${profileLabel}」登录环境，通常是登录已失效或页面结构变化。请前往「登录配置档」重新登录并保存，或编辑监控重新选区。${pageHint ? ` ${pageHint}` : ""}`;
  } else {
    message = originalError;
  }

  return {
    message: `${AUTH_EXPIRED_PREFIX} ${message}`,
    authExpired: true,
  };
}

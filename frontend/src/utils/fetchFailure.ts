export const AUTH_EXPIRED_PREFIX = "[auth_expired]";

export interface ParsedFetchFailure {
  likelyAuth: boolean;
  displayMessage: string;
  rawMessage: string;
}

export function parseFetchFailure(
  errorMessage: string | null | undefined,
  hasProfile: boolean,
): ParsedFetchFailure {
  const rawMessage = errorMessage?.trim() || "未知错误";
  const isTagged = rawMessage.startsWith(AUTH_EXPIRED_PREFIX);
  const likelyAuth =
    isTagged ||
    (hasProfile &&
      (rawMessage.includes("选择器未匹配") ||
        rawMessage.includes("未找到匹配") ||
        rawMessage.includes("登录可能已失效")));

  const displayMessage = isTagged
    ? rawMessage.slice(AUTH_EXPIRED_PREFIX.length).trim()
    : likelyAuth && hasProfile && rawMessage.includes("选择器未匹配")
      ? `选择器未匹配到内容，且该监控使用登录配置档，通常是登录已失效。请重新登录并保存后再抓取。\n\n${rawMessage}`
      : rawMessage;

  return { likelyAuth, displayMessage, rawMessage };
}

import { parseFetchFailure } from "./fetchFailure";

const ISO_TZ_SUFFIX = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

/** Parse API datetimes; naive ISO strings are treated as UTC. */
export function parseApiDate(value: string): Date {
  const trimmed = value.trim();
  if (ISO_TZ_SUFFIX.test(trimmed)) {
    return new Date(trimmed);
  }
  return new Date(`${trimmed}Z`);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "尚未抓取";

  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function formatMonitorUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = `${parsed.pathname}${parsed.search}`;
    const compact = path === "/" ? parsed.host : `${parsed.host}${path}`;
    return compact.length > 52 ? `${compact.slice(0, 49)}…` : compact;
  } catch {
    return url.length > 52 ? `${url.slice(0, 49)}…` : url;
  }
}

export function formatPanelFetchMeta(input: {
  fetchedAt: string | null | undefined;
  intervalMinutes: number;
  status?: string | null;
  errorMessage?: string | null;
  hasProfile?: boolean;
  profileLoginStatus?: string | null;
}): string {
  const { fetchedAt, intervalMinutes, status, errorMessage, hasProfile = false, profileLoginStatus } =
    input;

  if (status === "error") {
    if (profileLoginStatus === "expired") {
      return `登录失效 · 每 ${intervalMinutes} 分钟`;
    }
    const { likelyAuth } = parseFetchFailure(errorMessage, hasProfile);
    if (likelyAuth) {
      return `登录可能失效 · 每 ${intervalMinutes} 分钟`;
    }
    return `抓取失败 · 每 ${intervalMinutes} 分钟`;
  }

  if (!fetchedAt) {
    return `尚未抓取 · 每 ${intervalMinutes} 分钟 · 点 ↻ 获取`;
  }

  return `${formatTime(fetchedAt)} · 每 ${intervalMinutes} 分钟`;
}

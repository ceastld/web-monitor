import scriptSource from "./cursor-dashboard.script.js?raw";

/** Cursor dashboard — AI Line Edits contribution chart. */
export const CURSOR_DASHBOARD_SELECTOR = "main div.space-y-6.px-2 > div";

export const CURSOR_DASHBOARD_SCRIPT = scriptSource.trim();

export function isCursorDashboardUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname;
    return host === "cursor.com" || host.endsWith(".cursor.com");
  } catch {
    return url.includes("cursor.com");
  }
}

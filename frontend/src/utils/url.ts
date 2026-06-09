export function parseSiteDomain(url: string): string {
  return new URL(url.trim()).hostname.toLowerCase();
}

export function suggestMonitorName(url: string, pageTitle?: string | null): string {
  const title = pageTitle?.trim();
  if (title) return title.slice(0, 200);

  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path && path !== "/") {
      const segment = path.split("/").filter(Boolean).pop();
      if (segment) return `${parsed.hostname} · ${decodeURIComponent(segment)}`.slice(0, 200);
    }
    return parsed.hostname;
  } catch {
    return url.trim().slice(0, 200);
  }
}

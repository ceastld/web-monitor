import type { ComponentPayload } from "../types";

export function parseComponentPayload(content: string | null | undefined): ComponentPayload | null {
  if (!content) return null;
  try {
    const data = JSON.parse(content) as ComponentPayload;
    if (data?.type === "component" && data.html) return data;
  } catch {
    return null;
  }
  return null;
}

export function buildComponentSrcdoc(data: ComponentPayload): string {
  const baseHref = data.base_url || "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${baseHref}"><style>
    html, body { margin: 0; padding: 8px; background: #fff; overflow: auto; }
    * { box-sizing: border-box; }
    img, video, svg { max-width: 100%; height: auto; }
  </style></head><body>${data.html}</body></html>`;
}

export function screenshotUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const filename = path.split(/[/\\]/).pop();
  return filename ? `/api/files/screenshots/${filename}` : null;
}

import { COMPONENT_IFRAME_SANDBOX } from "./component";

export interface RenderPayload {
  type: "render";
  html: string;
}

export { COMPONENT_IFRAME_SANDBOX };

export function parseRenderPayload(content: string | null | undefined): RenderPayload | null {
  if (!content) return null;
  try {
    const data = JSON.parse(content) as RenderPayload;
    if (data?.type === "render" && data.html) return data;
  } catch {
    return null;
  }
  return null;
}

export function buildRenderSrcdoc(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: #0f172a;
    }
    body { box-sizing: border-box; }
    *, *::before, *::after { box-sizing: border-box; }
  </style></head><body>${html}<script>
    (function () {
      function report() {
        var height = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          1,
        );
        parent.postMessage({ type: "wm-render-size", height: height }, "*");
      }
      report();
      requestAnimationFrame(report);
      window.addEventListener("load", report);
      window.addEventListener("message", function (event) {
        if (event.data && event.data.type === "wm-render-request-size") report();
      });
      if (window.ResizeObserver) {
        new ResizeObserver(report).observe(document.body);
      }
    })();
  </script></body></html>`;
}

export function defaultExtractScript(): string {
  return `const text = (element.innerText || "").trim();
const label = element.getAttribute("aria-label") || element.tagName.toLowerCase();
return \`<div style="font-family:system-ui,sans-serif;padding:16px 18px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.08);">
  <div style="font-size:12px;color:#64748b;margin-bottom:6px;">\${label}</div>
  <div style="font-size:28px;font-weight:700;line-height:1.2;color:#0f172a;">\${text || "-"}</div>
</div>\`;`;
}

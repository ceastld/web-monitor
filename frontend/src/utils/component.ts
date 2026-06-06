import type { ComponentPayload } from "../types";

/** Sandbox flags for interactive component previews inside the local dashboard. */
export const COMPONENT_IFRAME_SANDBOX =
  "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";

export type EmbedSize = {
  width: number | null;
  height: number;
};

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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function buildComponentSrcdoc(data: ComponentPayload): string {
  const baseHref = escapeAttr(data.base_url || "");
  const stylesheetTags = (data.stylesheets ?? [])
    .slice(0, 12)
    .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}" crossorigin="anonymous">`)
    .join("");
  const cssVariables = data.css_variables?.trim()
    ? `:root { ${data.css_variables} }`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${baseHref}">${stylesheetTags}<style>
    ${cssVariables}
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: #262626;
      overflow: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(91, 140, 255, 0.32) rgba(15, 23, 42, 0.08);
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    html::-webkit-scrollbar-track,
    body::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.08);
      border-radius: 999px;
    }
    html::-webkit-scrollbar-thumb,
    body::-webkit-scrollbar-thumb {
      background: rgba(91, 140, 255, 0.32);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    html::-webkit-scrollbar-thumb:hover,
    body::-webkit-scrollbar-thumb:hover {
      background: rgba(91, 140, 255, 0.52);
      background-clip: content-box;
    }
    body {
      box-sizing: border-box;
    }
    #wm-root {
      display: block;
      width: 100%;
      height: auto;
      min-height: 0 !important;
      min-width: 0 !important;
      max-width: 100%;
    }
    *, *::before, *::after { box-sizing: border-box; }
    img, video, svg { max-width: 100%; height: auto; }
    a, button, summary, [role="button"], input, select, textarea, label {
      pointer-events: auto;
      cursor: pointer;
    }
    a { color: inherit; text-decoration: underline; }
    button:disabled, input:disabled, select:disabled, textarea:disabled {
      cursor: not-allowed;
    }
  </style></head><body><div id="wm-root">${data.html}</div><script>
    (function () {
      function reportSize(width, height) {
        parent.postMessage({ type: "wm-embed-size", width: width, height: height }, "*");
      }

      function bindInteractions(root) {
        root.addEventListener("click", function (event) {
          var link = event.target.closest("a[href]");
          if (!link) return;
          var href = link.getAttribute("href");
          if (!href || href.charAt(0) === "#") return;
          event.preventDefault();
          window.open(link.href, "_blank", "noopener,noreferrer");
        });
      }

      function elementBoxSize(el) {
        var rect = el.getBoundingClientRect();
        return {
          width: Math.ceil(Math.max(rect.width, el.scrollWidth, el.offsetWidth, 1)),
          height: Math.ceil(Math.max(rect.height, el.scrollHeight, el.offsetHeight, 1)),
        };
      }

      function measureContentSize(root) {
        root.style.setProperty("min-height", "0", "important");
        root.style.setProperty("height", "auto", "important");
        root.style.setProperty("min-width", "0", "important");
        root.style.setProperty("width", "auto", "important");

        var rootRect = root.getBoundingClientRect();
        var top = rootRect.top;
        var left = rootRect.left;
        var bottom = rootRect.bottom;
        var right = rootRect.right;

        root.querySelectorAll("*").forEach(function (el) {
          if (!(el instanceof HTMLElement)) return;
          var style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return;
          }
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          top = Math.min(top, rect.top);
          left = Math.min(left, rect.left);
          bottom = Math.max(bottom, rect.bottom);
          right = Math.max(right, rect.right);
        });

        var bounds = elementBoxSize(root);
        return {
          width: Math.ceil(Math.max(right - left, bounds.width, root.scrollWidth, 1)),
          height: Math.ceil(Math.max(bottom - top, bounds.height, root.scrollHeight, 1)),
        };
      }

      function reportNaturalSize() {
        var root = document.getElementById("wm-root");
        if (!root) return;
        var size = measureContentSize(root);
        reportSize(size.width, size.height);
      }

      function bindWheelForward() {
        window.addEventListener(
          "wheel",
          function (event) {
            var root = document.documentElement;
            var canScrollY = root.scrollHeight > root.clientHeight + 1;
            if (canScrollY) return;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            if (event.deltaY === 0) return;
            parent.postMessage(
              { type: "wm-embed-wheel", deltaY: event.deltaY, deltaX: event.deltaX },
              "*",
            );
          },
          { passive: true },
        );
      }

      function scheduleSizeReports() {
        reportNaturalSize();
        requestAnimationFrame(reportNaturalSize);
        window.setTimeout(reportNaturalSize, 120);
        window.setTimeout(reportNaturalSize, 400);
        window.setTimeout(reportNaturalSize, 900);
      }

      window.addEventListener("load", scheduleSizeReports);
      window.addEventListener("resize", reportNaturalSize);
      window.addEventListener("message", function (event) {
        if (event.data && event.data.type === "wm-embed-request-size") {
          reportNaturalSize();
        }
      });

      if (window.ResizeObserver) {
        new ResizeObserver(reportNaturalSize).observe(document.getElementById("wm-root"));
      }

      bindInteractions(document.getElementById("wm-root"));
      bindWheelForward();
      scheduleSizeReports();
    })();
  </script></body></html>`;
}

export function screenshotUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const filename = path.split(/[/\\]/).pop();
  return filename ? `/api/files/screenshots/${filename}` : null;
}

export function estimateEmbedSize(
  data: ComponentPayload,
  compact: boolean,
  panel = false,
): EmbedSize {
  const width =
    !panel && data.capture_width && data.capture_width > 0 ? data.capture_width + 4 : null;

  if (data.capture_height && data.capture_height > 0) {
    const padded = data.capture_height + 4;
    if (panel) {
      return { width, height: Math.min(padded, 960) };
    }
    return {
      width,
      height: compact ? Math.min(Math.max(padded, 120), 720) : Math.min(Math.max(padded, 160), 900),
    };
  }

  return { width, height: panel ? 160 : compact ? 200 : 320 };
}

/** @deprecated Use estimateEmbedSize instead. */
export function estimateEmbedHeight(
  data: ComponentPayload,
  compact: boolean,
  panel = false,
): number {
  return estimateEmbedSize(data, compact, panel).height;
}

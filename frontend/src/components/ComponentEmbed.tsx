import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildComponentSrcdoc,
  COMPONENT_IFRAME_SANDBOX,
  estimateEmbedSize,
  parseComponentPayload,
  screenshotUrl,
  type EmbedSize,
} from "../utils/component";
import { applyVerticalWheelAsHorizontalScroll, handleWheelRedirect } from "../utils/wheelScrollRedirect";
import type { Snapshot } from "../types";

type PreviewMode = "screenshot" | "embed";

interface ComponentEmbedProps {
  content: string;
  snapshot?: Snapshot | null;
  compact?: boolean;
  panel?: boolean;
}

export function ComponentEmbed({
  content,
  snapshot,
  compact = true,
  panel = false,
}: ComponentEmbedProps) {
  const data = parseComponentPayload(content);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollPanelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PreviewMode>(panel ? "embed" : "screenshot");
  const [frameSize, setFrameSize] = useState<EmbedSize>(() =>
    data
      ? estimateEmbedSize(data, compact, panel)
      : { width: null, height: panel ? 480 : compact ? 320 : 520 },
  );

  const shot = screenshotUrl(snapshot?.screenshot_path);
  const srcdoc = useMemo(() => (data ? buildComponentSrcdoc(data) : ""), [data]);
  const isPanel = panel;

  useEffect(() => {
    if (isPanel) {
      setMode("embed");
      return;
    }
    setMode(shot ? "screenshot" : "embed");
  }, [shot, content, isPanel]);

  useEffect(() => {
    if (!data) return;
    setFrameSize(estimateEmbedSize(data, compact, panel));
  }, [data, compact, panel, content]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as {
        type?: string;
        width?: number;
        height?: number;
        deltaY?: number;
        deltaX?: number;
      };

      if (payload?.type === "wm-embed-wheel") {
        const container = scrollPanelRef.current;
        if (!container || typeof payload.deltaY !== "number") return;
        applyVerticalWheelAsHorizontalScroll(
          container,
          payload.deltaY,
          typeof payload.deltaX === "number" ? payload.deltaX : 0,
        );
        return;
      }

      if (payload?.type !== "wm-embed-size" || typeof payload.height !== "number") return;

      const padding = 0;
      const minHeight = panel ? 48 : compact ? 120 : 160;
      const maxHeight = panel ? 2400 : compact ? 720 : 900;
      const nextHeight = Math.min(Math.max(payload.height + padding, minHeight), maxHeight);
      const nextWidth =
        panel && typeof payload.width === "number" && payload.width > 0
          ? payload.width + padding
          : null;

      setFrameSize({ width: nextWidth, height: nextHeight });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [compact, panel]);

  useEffect(() => {
    if (!panel) return;

    const container = scrollPanelRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      handleWheelRedirect(container, event);
    };

    container.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => container.removeEventListener("wheel", onWheel, { capture: true });
  }, [panel, srcdoc, frameSize.width, frameSize.height]);

  if (!data) {
    return panel ? (
      <div className="monitor-panel-empty">组件数据解析失败，请重新抓取</div>
    ) : (
      <div className="card-content">组件数据解析失败，请重新抓取</div>
    );
  }

  const showToolbar = !isPanel && !compact && Boolean(shot);
  const showEmbed = mode === "embed" || isPanel;
  const rootClass = isPanel
    ? "component-panel-root"
    : `card-content component-view${compact ? " component-view-compact" : " component-view-expanded"}`;

  const iframeStyle: React.CSSProperties = {
    height: `${frameSize.height}px`,
  };
  if (isPanel && frameSize.width) {
    iframeStyle.width = `${frameSize.width}px`;
  }

  return (
    <div className={rootClass}>
      {showToolbar ? (
        <div className="component-view-toolbar">
          <button
            type="button"
            className={`component-view-tab${mode === "screenshot" ? " active" : ""}`}
            onClick={() => setMode("screenshot")}
          >
            截图
          </button>
          <button
            type="button"
            className={`component-view-tab${mode === "embed" ? " active" : ""}`}
            onClick={() => setMode("embed")}
          >
            内嵌
          </button>
        </div>
      ) : null}

      <div
        ref={scrollPanelRef}
        className={`component-panel${isPanel ? " component-panel-full component-panel-scroll" : ""}`}
      >
        {showEmbed ? (
          <iframe
            ref={iframeRef}
            className="component-frame"
            title="组件预览"
            sandbox={COMPONENT_IFRAME_SANDBOX}
            scrolling={panel ? "no" : "yes"}
            srcDoc={srcdoc}
            style={iframeStyle}
          />
        ) : shot ? (
          <img className="component-shot" src={shot} alt="组件截图" loading="lazy" />
        ) : null}
      </div>

      {!isPanel && !compact ? (
        <div className="component-meta">
          {data.tag_name || "element"} · {data.node_count || "?"} 个节点
          {data.capture_width && data.capture_height
            ? ` · ${data.capture_width}×${data.capture_height}`
            : ""}
          {mode === "screenshot" ? " · 截图预览" : " · 内嵌预览"}
        </div>
      ) : null}
    </div>
  );
}

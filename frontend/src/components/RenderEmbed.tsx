import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRenderSrcdoc,
  COMPONENT_IFRAME_SANDBOX,
  parseRenderPayload,
} from "../utils/render";

interface RenderEmbedProps {
  content: string;
  panel?: boolean;
}

export function RenderEmbed({ content, panel = false }: RenderEmbedProps) {
  const data = parseRenderPayload(content);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(panel ? 120 : 160);

  const srcdoc = useMemo(() => (data ? buildRenderSrcdoc(data.html) : ""), [data]);

  const applyHeight = useCallback((nextHeight: number) => {
    const minHeight = panel ? 48 : 80;
    const maxHeight = panel ? 1200 : 900;
    setHeight(Math.min(Math.max(nextHeight + 8, minHeight), maxHeight));
  }, [panel]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as { type?: string; height?: number };
      if (payload?.type !== "wm-render-size" || typeof payload.height !== "number") return;
      applyHeight(payload.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyHeight]);

  if (!data) {
    return panel ? (
      <div className="monitor-panel-empty">自定义渲染数据解析失败</div>
    ) : (
      <div className="card-content">自定义渲染数据解析失败</div>
    );
  }

  return (
    <div className={panel ? "component-panel-root" : "card-content"}>
      <div className={panel ? "component-panel component-panel-full" : undefined}>
        <iframe
          ref={iframeRef}
          className="component-frame"
          title="自定义渲染"
          sandbox={COMPONENT_IFRAME_SANDBOX}
          scrolling="no"
          srcDoc={srcdoc}
          style={{ height: `${height}px`, width: "100%" }}
          onLoad={() => {
            iframeRef.current?.contentWindow?.postMessage({ type: "wm-render-request-size" }, "*");
          }}
        />
      </div>
    </div>
  );
}

import { buildComponentSrcdoc, parseComponentPayload, screenshotUrl } from "../utils/component";
import type { Snapshot } from "../types";

interface ComponentEmbedProps {
  content: string;
  snapshot?: Snapshot | null;
  compact?: boolean;
}

export function ComponentEmbed({ content, snapshot, compact = true }: ComponentEmbedProps) {
  const data = parseComponentPayload(content);
  if (!data) {
    return <div className="card-content">组件数据解析失败，请重新抓取</div>;
  }

  const shot = screenshotUrl(snapshot?.screenshot_path);

  return (
    <div className="card-content component-view">
      {shot ? <img className="component-shot" src={shot} alt="组件截图" loading="lazy" /> : null}
      <div className="component-meta">
        {data.tag_name || "element"} · {data.node_count || "?"} 个节点 · 内嵌预览
      </div>
      <iframe
        className="component-frame"
        title="组件预览"
        sandbox=""
        srcDoc={buildComponentSrcdoc(data)}
        style={compact ? { height: "240px" } : undefined}
      />
    </div>
  );
}

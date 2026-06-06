import { screenshotUrl } from "../utils/component";
import type { ExtractMode, Snapshot } from "../types";

interface SnapshotContentProps {
  content: string;
  snapshot: Snapshot;
  extractMode: ExtractMode;
}

export function SnapshotContent({ content, snapshot, extractMode }: SnapshotContentProps) {
  const shot = screenshotUrl(snapshot.screenshot_path);

  if (shot) {
    return (
      <div className="card-content snapshot-view">
        <img className="snapshot-shot" src={shot} alt={content} loading="lazy" />
        <div className="snapshot-meta">
          {extractMode === "html" ? (
            <span className="snapshot-label">HTML 片段</span>
          ) : (
            <strong className="snapshot-value">{content}</strong>
          )}
        </div>
      </div>
    );
  }

  if (extractMode === "html") {
    return (
      <div className="card-content card-content-html">
        <pre>{content}</pre>
      </div>
    );
  }

  return <div className="card-content">{content}</div>;
}

import { useEffect, useRef } from "react";
import { ComponentEmbed } from "./ComponentEmbed";
import { parseComponentPayload } from "../utils/component";
import type { Snapshot } from "../types";

interface ComponentPreviewDialogProps {
  open: boolean;
  title: string;
  content: string;
  snapshot?: Snapshot | null;
  onClose: () => void;
}

export function ComponentPreviewDialog({
  open,
  title,
  content,
  snapshot,
  onClose,
}: ComponentPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const data = parseComponentPayload(content);

  return (
    <dialog
      id="component-preview-dialog"
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="preview-shell">
        <header className="preview-header">
          <div>
            <h3>{title}</h3>
            <p>
              {data
                ? `${data.tag_name} · ${data.node_count} 个节点 · ${data.base_url || ""}`
                : "组件预览"}
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="preview-body">
          <ComponentEmbed content={content} snapshot={snapshot} compact={false} />
        </div>
      </div>
    </dialog>
  );
}

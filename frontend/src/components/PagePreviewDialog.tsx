import { useCallback, useEffect, useRef, useState } from "react";
import { apiSend } from "../api/client";
import { screenshotUrl } from "../utils/component";
import type { MonitorPreview } from "../types";

interface PagePreviewDialogProps {
  open: boolean;
  monitorId: number | null;
  monitorName: string;
  profileName: string | null;
  onClose: () => void;
}

export function PagePreviewDialog({
  open,
  monitorId,
  monitorName,
  profileName,
  onClose,
}: PagePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [preview, setPreview] = useState<MonitorPreview | null>(null);

  const loadingHint =
    elapsedSec < 2
      ? profileName
        ? `正在用「${profileName}」打开页面…`
        : "正在打开页面…"
      : elapsedSec < 6
        ? "等待页面渲染…"
        : elapsedSec < 12
          ? "读取监控字段…"
          : `仍在加载（${elapsedSec} 秒）…`;

  const loadPreview = useCallback(async () => {
    if (monitorId === null) return;
    setLoading(true);
    setPreview(null);
    setElapsedSec(0);

    const elapsedTimer = window.setInterval(() => {
      setElapsedSec((sec) => sec + 1);
    }, 1000);

    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const data = await apiSend<MonitorPreview>(
        "POST",
        `/api/monitors/${monitorId}/preview`,
        undefined,
        controller.signal,
      );
      setPreview(data);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      setPreview({
        monitor_id: monitorId,
        url: "",
        profile_id: null,
        profile_name: profileName,
        screenshot_path: null,
        element_screenshot_path: null,
        final_url: null,
        page_title: null,
        selector_content: null,
        component_content: null,
        match_count: 0,
        status: "error",
        error_message: timedOut
          ? "预览超时，请稍后重试"
          : err instanceof Error
            ? err.message
            : "预览失败",
      });
    } finally {
      window.clearInterval(elapsedTimer);
      window.clearTimeout(abortTimer);
      setLoading(false);
    }
  }, [monitorId, profileName]);

  useEffect(() => {
    if (open && monitorId !== null) {
      void loadPreview();
    }
    if (!open) {
      setPreview(null);
    }
  }, [open, monitorId, loadPreview]);

  const shot = screenshotUrl(preview?.screenshot_path);

  return (
    <dialog
      id="page-preview-dialog"
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="preview-shell page-preview-shell">
        <header className="preview-header">
          <div>
            <h3>{monitorName} · 快速查看</h3>
            <p>
              配置档：{profileName || preview?.profile_name || "无需登录"}
              {preview?.final_url ? ` · ${preview.final_url}` : ""}
            </p>
          </div>
          <div className="preview-header-actions">
            <button
              type="button"
              className="ghost-btn"
              disabled={loading}
              onClick={() => void loadPreview()}
            >
              重新加载
            </button>
            <button type="button" className="ghost-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <div className="page-preview-body">
          {loading ? (
            <div className="preview-loading">
              <div className="preview-spinner" aria-hidden="true" />
              <p>{loadingHint}</p>
              {elapsedSec > 0 ? (
                <p className="preview-loading-elapsed">已等待 {elapsedSec} 秒</p>
              ) : null}
            </div>
          ) : null}

          {!loading && preview?.status === "error" ? (
            <div className="preview-error">{preview.error_message || "预览失败"}</div>
          ) : null}

          {!loading && preview?.selector_content ? (
            <div className="preview-highlight">
              <span className="preview-highlight-label">监控字段</span>
              <strong>{preview.selector_content}</strong>
            </div>
          ) : null}

          {!loading && shot ? (
            <img className="page-preview-shot" src={shot} alt={preview?.page_title || monitorName} />
          ) : null}

          {!loading && preview?.status === "success" && !shot ? (
            <div className="empty">页面已加载，但截图生成失败</div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

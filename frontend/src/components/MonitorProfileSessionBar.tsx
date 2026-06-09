import { StatusBadge } from "./StatusBadge";
import type { ChromeCdpStatus, Profile } from "../types";

interface MonitorProfileSessionBarProps {
  profile: Profile | null;
  pageUrl: string;
  busy: boolean;
  picking?: boolean;
  previewing?: boolean;
  canPreview?: boolean;
  previewLabel?: string;
  interactiveDisabled?: boolean;
  chromeCdp?: ChromeCdpStatus | null;
  onImportChrome: () => void;
  onOpenLogin: () => void;
  onSaveLogin: () => void;
  onCancelLogin: () => void;
  onStartPick: () => void;
  onCancelPick: () => void;
  onPreview?: () => void;
}

export function MonitorProfileSessionBar({
  profile,
  pageUrl,
  busy,
  picking = false,
  previewing = false,
  canPreview = false,
  previewLabel = "预览",
  interactiveDisabled = false,
  chromeCdp = null,
  onImportChrome,
  onOpenLogin,
  onSaveLogin,
  onCancelLogin,
  onStartPick,
  onCancelPick,
  onPreview,
}: MonitorProfileSessionBarProps) {
  const canPick = Boolean(pageUrl.trim());
  const isLoggingIn = profile?.login_status === "logging_in";
  const chromeReady = Boolean(chromeCdp?.available);
  const showStatus = picking || isLoggingIn;

  const statusText = picking
    ? chromeReady
      ? "在 Chrome 新标签右下角用悬浮球选区"
      : "在弹出浏览器右下角用悬浮球选区"
    : isLoggingIn
      ? "登录完成后点「登录」菜单保存"
      : "";

  return (
    <div className="monitor-setup-toolbar">
      <div className="monitor-setup-toolbar-info">
        {profile ? (
          <span className="monitor-setup-chip">
            <span className="monitor-setup-chip-label">登录</span>
            <strong>{profile.name}</strong>
            <StatusBadge status={profile.login_status} kind="login" />
          </span>
        ) : (
          <span className="monitor-setup-chip muted">无需登录</span>
        )}
        {showStatus ? <span className="monitor-setup-status">{statusText}</span> : null}
      </div>

      <div className="monitor-setup-toolbar-actions">
        <button
          type="button"
          className="small-btn primary-btn"
          disabled={interactiveDisabled || busy || !canPick}
          title={interactiveDisabled ? "需在服务器本机操作" : undefined}
          onClick={onStartPick}
        >
          {picking ? "选区中…" : "打开选区"}
        </button>
        {picking && !interactiveDisabled ? (
          <button type="button" className="small-btn ghost-btn" disabled={busy} onClick={onCancelPick}>
            取消
          </button>
        ) : null}
        {onPreview ? (
          <button
            type="button"
            className="small-btn ghost-btn"
            disabled={!canPreview || busy}
            onClick={onPreview}
          >
            {previewing ? "预览中…" : previewLabel}
          </button>
        ) : null}
        {profile && !interactiveDisabled ? (
          <details className="setup-menu-details">
            <summary className="small-btn ghost-btn setup-menu-summary">登录</summary>
            <div className="setup-menu-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                className="setup-menu-item"
                disabled={busy}
                title={
                  chromeReady
                    ? "从本机 Chrome 导入 Cookie"
                    : "需先运行 scripts/launch-chrome-debug.ps1 连接 Chrome"
                }
                onClick={onImportChrome}
              >
                从 Chrome 导入
              </button>
              <button
                type="button"
                role="menuitem"
                className="setup-menu-item"
                disabled={busy || !canPick}
                onClick={onOpenLogin}
              >
                {chromeReady ? "在 Chrome 中打开" : "打开浏览器登录"}
              </button>
              {isLoggingIn ? (
                <>
                  <button type="button" role="menuitem" className="setup-menu-item" disabled={busy} onClick={onSaveLogin}>
                    保存登录
                  </button>
                  <button type="button" role="menuitem" className="setup-menu-item" disabled={busy} onClick={onCancelLogin}>
                    取消登录
                  </button>
                </>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

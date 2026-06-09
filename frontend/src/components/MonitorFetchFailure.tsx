import { parseFetchFailure } from "../utils/fetchFailure";

interface MonitorFetchFailureProps {
  errorMessage: string | null | undefined;
  hasProfile: boolean;
  profileName?: string | null;
  profileLoginStatus?: string | null;
  compact?: boolean;
  showChromeImport?: boolean;
  chromeImportReady?: boolean;
  loginRenewalActive?: boolean;
  staleLoginSession?: boolean;
  renewingLogin?: boolean;
  importingFromChrome?: boolean;
  loginBusy?: boolean;
  onRetry: () => void;
  onEdit: () => void;
  onRenewLogin?: () => void;
  onDismissStaleLogin?: () => void;
  onImportFromChrome?: () => void;
  onSaveLogin?: () => void;
  onCancelLogin?: () => void;
  retrying?: boolean;
}

export function MonitorFetchFailure({
  errorMessage,
  hasProfile,
  profileName,
  profileLoginStatus,
  compact = false,
  showChromeImport = false,
  chromeImportReady = false,
  loginRenewalActive = false,
  staleLoginSession = false,
  renewingLogin = false,
  importingFromChrome = false,
  loginBusy = false,
  onRetry,
  onEdit,
  onRenewLogin,
  onDismissStaleLogin,
  onImportFromChrome,
  onSaveLogin,
  onCancelLogin,
  retrying = false,
}: MonitorFetchFailureProps) {
  const { likelyAuth, displayMessage } = parseFetchFailure(errorMessage, hasProfile);
  const loginExpiredStatus = profileLoginStatus === "expired";
  const showAuthBadge = hasProfile && (likelyAuth || loginExpiredStatus || staleLoginSession);
  const showLoginActions =
    hasProfile && !loginRenewalActive && !staleLoginSession && Boolean(onRenewLogin || onImportFromChrome);
  const sessionBusy = renewingLogin || importingFromChrome || loginBusy;
  const canShowChromeImport = showChromeImport && Boolean(onImportFromChrome);

  const badgeLabel = staleLoginSession
    ? "残留登录会话"
    : loginRenewalActive
      ? "登录进行中"
      : loginExpiredStatus
        ? "登录已失效"
        : "可能需要重新登录";

  const bodyMessage = staleLoginSession
    ? "检测到未完成的登录会话，但浏览器窗口可能已关闭。可先「结束残留会话」，或直接从 Chrome 导入 Cookie。"
    : loginRenewalActive
      ? "浏览器已打开，请完成登录后点击「保存登录」。保存的是 Cookie / 本地存储，不会记录账号密码。保存后将自动重新抓取。"
      : displayMessage;

  const chromeImportButton = canShowChromeImport ? (
    <button
      type="button"
      className={`small-btn ${chromeImportReady ? "primary-btn" : "ghost-btn"}`}
      disabled={sessionBusy}
      title={
        chromeImportReady
          ? "从本机 Chrome 导入 Cookie，无需重新登录"
          : "需先运行 scripts/launch-chrome-debug.ps1 连接 Chrome"
      }
      onClick={onImportFromChrome}
    >
      {importingFromChrome ? "导入中…" : "从 Chrome 导入"}
    </button>
  ) : null;

  return (
    <div
      className={`monitor-fetch-failure${compact ? " monitor-fetch-failure-compact" : ""}${showAuthBadge ? " monitor-fetch-failure-auth" : ""}`}
    >
      {showAuthBadge ? (
        <div className="monitor-fetch-failure-badge">
          {badgeLabel}
          {profileName ? ` · ${profileName}` : ""}
        </div>
      ) : null}
      <p className="monitor-fetch-failure-message">{bodyMessage}</p>
      {canShowChromeImport && !chromeImportReady ? (
        <p className="monitor-fetch-failure-hint">
          按钮已显示。若导入失败，请先关闭所有 Chrome 窗口，运行{" "}
          <code>.\scripts\launch-chrome-debug.ps1</code>，再在 Chrome 中登录该站点。
        </p>
      ) : null}
      {showLoginActions && !likelyAuth && !loginExpiredStatus ? (
        <p className="monitor-fetch-failure-hint">
          该监控使用登录配置档。若页面需登录或网络异常，可尝试「从 Chrome 导入」或「打开浏览器登录」后重新抓取。
        </p>
      ) : null}
      {showLoginActions && (likelyAuth || loginExpiredStatus) && chromeImportReady ? (
        <p className="monitor-fetch-failure-hint">
          若你已在常用 Chrome 中登录该站点，点「从 Chrome 导入」即可，无需重新输入账号密码。
        </p>
      ) : null}
      <div className="monitor-fetch-failure-actions">
        {staleLoginSession ? (
          <>
            {chromeImportButton}
            {onDismissStaleLogin ? (
              <button
                type="button"
                className="small-btn ghost-btn"
                disabled={sessionBusy}
                onClick={onDismissStaleLogin}
              >
                {loginBusy ? "处理中…" : "结束残留会话"}
              </button>
            ) : null}
            {onRenewLogin ? (
              <button
                type="button"
                className="small-btn ghost-btn"
                disabled={sessionBusy}
                onClick={onRenewLogin}
              >
                {renewingLogin ? "正在打开…" : "重新打开浏览器"}
              </button>
            ) : null}
          </>
        ) : null}
        {loginRenewalActive && !staleLoginSession ? (
          <>
            <button
              type="button"
              className="small-btn primary-btn"
              disabled={sessionBusy}
              onClick={onSaveLogin}
            >
              {loginBusy ? "保存中…" : "保存登录"}
            </button>
            <button
              type="button"
              className="small-btn ghost-btn"
              disabled={sessionBusy}
              onClick={onCancelLogin}
            >
              取消
            </button>
          </>
        ) : null}
        {showLoginActions ? (
          <>
            {chromeImportButton}
            {onRenewLogin ? (
              <button
                type="button"
                className="small-btn ghost-btn"
                disabled={sessionBusy}
                onClick={onRenewLogin}
              >
                {renewingLogin ? "正在打开…" : "打开浏览器登录"}
              </button>
            ) : null}
          </>
        ) : null}
        {!staleLoginSession ? (
          <button
            type="button"
            className={`small-btn ${showLoginActions ? "ghost-btn" : "primary-btn"}`}
            disabled={retrying || sessionBusy}
            onClick={onRetry}
          >
            {retrying ? "抓取中…" : "立即抓取"}
          </button>
        ) : null}
        <button type="button" className="small-btn ghost-btn" disabled={sessionBusy} onClick={onEdit}>
          编辑监控
        </button>
      </div>
    </div>
  );
}

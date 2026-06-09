import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";
import { useToast } from "../context/ToastContext";
import { useProfileLogin } from "../hooks/useProfileLogin";
import { ComponentEmbed } from "./ComponentEmbed";
import { PagePreviewDialog } from "./PagePreviewDialog";
import { PageHeader } from "./PageHeader";
import { PanelMenu, type PanelMenuItem } from "./PanelMenu";
import { SnapshotContent } from "./SnapshotContent";
import { MonitorFetchFailure } from "./MonitorFetchFailure";
import { StatusBadge } from "./StatusBadge";
import { parseComponentPayload } from "../utils/component";
import { parseRenderPayload } from "../utils/render";
import { RenderEmbed } from "./RenderEmbed";
import { formatMonitorUrl, formatPanelFetchMeta, formatTime } from "../utils/format";
import type { DashboardItem, Monitor, Snapshot } from "../types";
import { EXTRACT_MODE_LABELS } from "../types";

interface LoginRenewalTarget {
  profileId: number;
  monitorId: number;
}

interface DashboardTabProps {
  reloadToken: number;
  onEditMonitor: (monitor: Monitor) => void;
  onRefreshAll: () => void;
}

function isPanelItem(item: DashboardItem): boolean {
  return (
    item.monitor.extract_mode === "component" ||
    item.monitor.extract_mode === "script" ||
    Boolean(parseComponentPayload(item.latest_snapshot?.content)) ||
    Boolean(parseRenderPayload(item.latest_snapshot?.content))
  );
}

export function DashboardTab({
  reloadToken,
  onEditMonitor,
  onRefreshAll,
}: DashboardTabProps) {
  const { showToast } = useToast();
  const { canUseInteractiveSetup, canUseChrome, chromeCdp, shortNotice } = useSetupCapabilities();
  const { startLogin, saveLogin, cancelLogin, importFromChrome } = useProfileLogin({
    onSuccess: (message) => showToast(message),
    onError: (message) => showToast(message),
  });
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagePreviewId, setPagePreviewId] = useState<number | null>(null);
  const [pagePreviewMeta, setPagePreviewMeta] = useState<{ name: string; profile: string | null } | null>(null);
  const [fetchingId, setFetchingId] = useState<number | null>(null);
  const [loginRenewal, setLoginRenewal] = useState<LoginRenewalTarget | null>(null);
  const [renewingLogin, setRenewingLogin] = useState(false);
  const [importingMonitorId, setImportingMonitorId] = useState<number | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const autoFetchedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await apiGet<DashboardItem[]>("/api/dashboard"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    if (loading || fetchingId !== null) return;

    for (const item of items) {
      const { monitor, latest_snapshot: snap } = item;
      if (!monitor.enabled) continue;
      if (autoFetchedRef.current.has(monitor.id)) continue;
      if (monitor.last_fetched_at || snap?.content) continue;

      autoFetchedRef.current.add(monitor.id);
      void fetchOne(monitor.id);
    }
    // fetchOne is stable enough for one-shot bootstrap; eslint wants it omitted here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading, fetchingId]);

  const { panelItems, cardItems } = useMemo(() => {
    const panel: DashboardItem[] = [];
    const cards: DashboardItem[] = [];
    for (const item of items) {
      if (isPanelItem(item)) panel.push(item);
      else cards.push(item);
    }
    return { panelItems: panel, cardItems: cards };
  }, [items]);

  const fetchOne = async (id: number) => {
    setFetchingId(id);
    try {
      const snapshot = await apiSend<Snapshot>("POST", `/api/monitors/${id}/fetch`);
      if (snapshot) {
        setItems((prev) =>
          prev.map((item) =>
            item.monitor.id === id
              ? {
                  ...item,
                  monitor: {
                    ...item.monitor,
                    last_fetched_at: snapshot.fetched_at,
                    last_status: snapshot.status,
                  },
                  latest_snapshot: snapshot,
                }
              : item,
          ),
        );
      }
      showToast(snapshot?.status === "error" ? "抓取失败" : "抓取完成");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setFetchingId(null);
    }
  };

  const isClientLoginRenewal = (item: DashboardItem): boolean =>
    loginRenewal?.monitorId === item.monitor.id;

  const hasStaleLoginSession = (item: DashboardItem): boolean =>
    item.profile_login_status === "logging_in" && !isClientLoginRenewal(item);

  const handleRenewLogin = async (item: DashboardItem) => {
    const profileId = item.monitor.profile_id;
    if (!profileId) return;

    if (!canUseInteractiveSetup) {
      showToast(shortNotice ?? "需在运行后端的电脑上操作才能打开浏览器登录");
      return;
    }

    setRenewingLogin(true);
    setLoginRenewal({ profileId, monitorId: item.monitor.id });
    try {
      await cancelLogin(profileId);
      const opened = await startLogin(profileId, item.monitor.url, canUseChrome);
      if (!opened) {
        setLoginRenewal((current) =>
          current?.profileId === profileId ? null : current,
        );
      } else {
        await load(true);
      }
    } finally {
      setRenewingLogin(false);
    }
  };

  const handleDismissStaleLogin = async (item: DashboardItem) => {
    const profileId = item.monitor.profile_id;
    if (!profileId) return;

    setLoginBusy(true);
    try {
      await cancelLogin(profileId);
      setLoginRenewal(null);
      await load(true);
      showToast("已结束残留登录会话");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSaveLogin = async (item: DashboardItem) => {
    const profileId = item.monitor.profile_id;
    if (!profileId) return;

    setLoginBusy(true);
    try {
      await saveLogin(profileId);
      setLoginRenewal(null);
      await load(true);
      await fetchOne(item.monitor.id);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleImportFromChrome = async (item: DashboardItem) => {
    const profileId = item.monitor.profile_id;
    if (!profileId) return;

    if (!canUseChrome) {
      showToast(
        `未连接 Chrome 调试端口。请先关闭所有 Chrome 窗口，再运行：.\\scripts\\launch-chrome-debug.ps1${chromeCdp.hint ? `\n${chromeCdp.hint}` : ""}`,
      );
      return;
    }

    setImportingMonitorId(item.monitor.id);
    try {
      const ok = await importFromChrome(profileId);
      if (ok) {
        setLoginRenewal(null);
        await load(true);
        await fetchOne(item.monitor.id);
      }
    } finally {
      setImportingMonitorId(null);
    }
  };

  const handleCancelLogin = async (item: DashboardItem) => {
    const profileId = item.monitor.profile_id;
    if (!profileId) return;

    setLoginBusy(true);
    try {
      await cancelLogin(profileId);
      setLoginRenewal(null);
      await load(true);
    } finally {
      setLoginBusy(false);
    }
  };

  const buildFailureProps = (item: DashboardItem) => ({
    errorMessage: item.latest_snapshot?.error_message,
    hasProfile: item.monitor.profile_id != null,
    profileName: item.profile_name,
    profileLoginStatus: item.profile_login_status,
    showChromeImport: canUseInteractiveSetup && item.monitor.profile_id != null,
    chromeImportReady: canUseChrome,
    retrying: fetchingId === item.monitor.id,
    loginRenewalActive: isClientLoginRenewal(item),
    staleLoginSession: hasStaleLoginSession(item),
    renewingLogin: renewingLogin && loginRenewal?.monitorId === item.monitor.id,
    importingFromChrome: importingMonitorId === item.monitor.id,
    loginBusy,
    onRetry: () => void fetchOne(item.monitor.id),
    onEdit: () => onEditMonitor(item.monitor),
    onRenewLogin: () => void handleRenewLogin(item),
    onDismissStaleLogin: () => void handleDismissStaleLogin(item),
    onImportFromChrome: () => void handleImportFromChrome(item),
    onSaveLogin: () => void handleSaveLogin(item),
    onCancelLogin: () => void handleCancelLogin(item),
  });

  const buildPanelMenuItems = (item: DashboardItem): PanelMenuItem[] => [
    { label: "编辑", onClick: () => onEditMonitor(item.monitor) },
    { label: "立即抓取", onClick: () => void fetchOne(item.monitor.id) },
    {
      label: "快速查看",
      onClick: () => {
        setPagePreviewId(item.monitor.id);
        setPagePreviewMeta({
          name: item.monitor.name,
          profile: item.profile_name,
        });
      },
    },
  ];

  const renderPanelContent = (item: DashboardItem) => {
    if (fetchingId === item.monitor.id) {
      return (
        <div className="monitor-panel-empty">
          <div className="preview-spinner" aria-hidden="true" />
          <span>正在抓取最新内容…</span>
        </div>
      );
    }

    const snap = item.latest_snapshot;
    if (!snap?.content) {
      if (snap?.status === "error") {
        return <MonitorFetchFailure {...buildFailureProps(item)} />;
      }

      return (
        <div className="monitor-panel-empty">
          <span>尚未抓取到内容，点击下方按钮或标题栏 ↻ 获取</span>
          <button
            type="button"
            className="small-btn primary-btn"
            onClick={() => void fetchOne(item.monitor.id)}
          >
            立即抓取
          </button>
        </div>
      );
    }

    if (item.monitor.extract_mode === "script" || parseRenderPayload(snap.content)) {
      return <RenderEmbed panel content={snap.content} />;
    }
    return <ComponentEmbed panel content={snap.content} snapshot={snap} />;
  };

  const renderCardContent = (item: DashboardItem) => {
    if (fetchingId === item.monitor.id) {
      return (
        <div className="card-content card-content-fetching">
          <div className="preview-spinner" aria-hidden="true" />
          <span>正在抓取最新内容…</span>
        </div>
      );
    }

    const snap = item.latest_snapshot;
    if (snap?.status === "error") {
      return <MonitorFetchFailure compact {...buildFailureProps(item)} />;
    }
    if (!snap?.content) {
      return <div className="card-content">等待首次抓取…</div>;
    }

    return (
      <SnapshotContent
        content={snap.content}
        snapshot={snap}
        extractMode={item.monitor.extract_mode}
      />
    );
  };

  return (
    <section className="tab active dashboard-tab">
      <PageHeader
        title="监控面板"
        subtitle="所有监控节点的最新抓取内容"
        actions={
          <>
            <button type="button" className="ghost-btn" onClick={() => void onRefreshAll()}>
              抓取全部
            </button>
            <button
              type="button"
              className="ghost-btn"
              title="仅从数据库重新加载，不会访问网页"
              onClick={() => void load()}
            >
              重新加载
            </button>
          </>
        }
      />

      {loading ? <div className="empty">加载中…</div> : null}
      {!loading && items.length === 0 ? (
        <div className="empty">还没有监控节点，请先在「监控节点」中创建。</div>
      ) : null}

      {!loading && panelItems.length > 0 ? (
        <div className="monitor-panel-stack">
          {panelItems.map((item) => {
            const snap = item.latest_snapshot;
            const modeLabel =
              EXTRACT_MODE_LABELS[item.monitor.extract_mode] || item.monitor.extract_mode;
            const fetchMeta = formatPanelFetchMeta({
              fetchedAt: snap?.fetched_at || item.monitor.last_fetched_at,
              intervalMinutes: item.monitor.interval_minutes,
              status: snap?.status || item.monitor.last_status,
              errorMessage: snap?.error_message,
              hasProfile: item.monitor.profile_id != null,
              profileLoginStatus: item.profile_login_status,
            });

            return (
              <section
                key={item.monitor.id}
                className={`monitor-panel${snap?.changed ? " changed" : ""}`}
                aria-label={item.monitor.name}
              >
                <div className="monitor-panel-caption">
                  <div className="monitor-panel-caption-main">
                    <div className="monitor-panel-caption-head">
                      <strong>{item.monitor.name}</strong>
                      <span className="mode-tag">{modeLabel}</span>
                      <StatusBadge status={snap?.status || item.monitor.last_status} />
                    </div>
                    <div className="monitor-panel-caption-sub">
                      <span className="monitor-panel-caption-url" title={item.monitor.url}>
                        {formatMonitorUrl(item.monitor.url)}
                      </span>
                      {item.profile_name ? (
                        <span className="monitor-panel-caption-profile">
                          · {item.profile_name}
                          {item.profile_login_status === "expired" ? (
                            <span className="monitor-panel-login-expired">登录失效</span>
                          ) : null}
                        </span>
                      ) : null}
                      <span className="monitor-panel-caption-meta">{fetchMeta}</span>
                    </div>
                  </div>
                  <div className="monitor-panel-caption-actions">
                    <button
                      type="button"
                      className="panel-refresh-btn"
                      aria-label="立即抓取"
                      title="立即抓取"
                      disabled={fetchingId === item.monitor.id}
                      onClick={() => void fetchOne(item.monitor.id)}
                    >
                      <svg
                        className={`icon-refresh${fetchingId === item.monitor.id ? " spinning" : ""}`}
                        viewBox="0 0 16 16"
                        width="15"
                        height="15"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M11.5 4.5V7H8.5"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8.5 7A4.5 4.5 0 1 0 4 8"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <PanelMenu items={buildPanelMenuItems(item)} />
                  </div>
                </div>
                {renderPanelContent(item)}
              </section>
            );
          })}
        </div>
      ) : null}

      {!loading && cardItems.length > 0 ? (
        <div className={`card-grid${panelItems.length ? " card-grid-after-panels" : ""}`}>
          {cardItems.map((item) => {
            const snap = item.latest_snapshot;
            const modeLabel = EXTRACT_MODE_LABELS[item.monitor.extract_mode] || item.monitor.extract_mode;

            return (
              <article
                key={item.monitor.id}
                className={`monitor-card${snap?.changed ? " changed" : ""}`}
              >
                <div className="card-head">
                  <div>
                    <h3>
                      {item.monitor.name}
                      <span className="mode-tag">{modeLabel}</span>
                    </h3>
                    <div className="card-meta card-url">{item.monitor.url}</div>
                  </div>
                  <StatusBadge status={snap?.status || item.monitor.last_status} />
                </div>
                <div className="card-meta">
                  配置档：{item.profile_name || "无需登录"} · 间隔 {item.monitor.interval_minutes} 分钟 ·{" "}
                  {formatTime(snap?.fetched_at || item.monitor.last_fetched_at)}
                </div>
                {renderCardContent(item)}
                <div className="card-actions">
                  <button
                    type="button"
                    className="small-btn primary-btn"
                    disabled={fetchingId === item.monitor.id}
                    onClick={() => void fetchOne(item.monitor.id)}
                  >
                    立即抓取
                  </button>
                  <button
                    type="button"
                    className="small-btn ghost-btn"
                    onClick={() => {
                      setPagePreviewId(item.monitor.id);
                      setPagePreviewMeta({
                        name: item.monitor.name,
                        profile: item.profile_name,
                      });
                    }}
                  >
                    快速查看
                  </button>
                  <button
                    type="button"
                    className="small-btn ghost-btn"
                    onClick={() => onEditMonitor(item.monitor)}
                  >
                    编辑
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <PagePreviewDialog
        open={pagePreviewId !== null}
        monitorId={pagePreviewId}
        monitorName={pagePreviewMeta?.name || ""}
        profileName={pagePreviewMeta?.profile ?? null}
        onClose={() => {
          setPagePreviewId(null);
          setPagePreviewMeta(null);
        }}
      />
    </section>
  );
}

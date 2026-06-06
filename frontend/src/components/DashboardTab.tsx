import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useToast } from "../context/ToastContext";
import { ComponentEmbed } from "./ComponentEmbed";
import { PagePreviewDialog } from "./PagePreviewDialog";
import { PageHeader } from "./PageHeader";
import { PanelMenu, type PanelMenuItem } from "./PanelMenu";
import { SnapshotContent } from "./SnapshotContent";
import { StatusBadge } from "./StatusBadge";
import { parseComponentPayload } from "../utils/component";
import { formatTime } from "../utils/format";
import type { DashboardItem, Monitor, Snapshot } from "../types";
import { EXTRACT_MODE_LABELS } from "../types";

interface DashboardTabProps {
  reloadToken: number;
  onEditMonitor: (monitor: Monitor) => void;
  onRefreshAll: () => void;
}

function isComponentItem(item: DashboardItem): boolean {
  return (
    item.monitor.extract_mode === "component" ||
    Boolean(parseComponentPayload(item.latest_snapshot?.content))
  );
}

export function DashboardTab({ reloadToken, onEditMonitor, onRefreshAll }: DashboardTabProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagePreviewId, setPagePreviewId] = useState<number | null>(null);
  const [pagePreviewMeta, setPagePreviewMeta] = useState<{ name: string; profile: string | null } | null>(null);
  const [fetchingId, setFetchingId] = useState<number | null>(null);

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

  const { panelItems, cardItems } = useMemo(() => {
    const panel: DashboardItem[] = [];
    const cards: DashboardItem[] = [];
    for (const item of items) {
      if (isComponentItem(item)) panel.push(item);
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
    if (snap?.status === "error") {
      return <div className="monitor-panel-empty">抓取失败：{snap.error_message || "未知错误"}</div>;
    }
    if (!snap?.content) {
      return <div className="monitor-panel-empty">等待首次抓取…</div>;
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
      return <div className="card-content">抓取失败：{snap.error_message || "未知错误"}</div>;
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
            return (
              <section
                key={item.monitor.id}
                className={`monitor-panel${snap?.changed ? " changed" : ""}`}
                aria-label={item.monitor.name}
              >
                <div className="monitor-panel-caption">
                  <div className="monitor-panel-caption-main">
                    <strong>{item.monitor.name}</strong>
                    <span className="mode-tag">组件</span>
                    <StatusBadge status={snap?.status || item.monitor.last_status} />
                    <span className="monitor-panel-caption-meta">
                      {formatTime(snap?.fetched_at || item.monitor.last_fetched_at)} · 间隔{" "}
                      {item.monitor.interval_minutes} 分钟
                    </span>
                  </div>
                  <PanelMenu items={buildPanelMenuItems(item)} />
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

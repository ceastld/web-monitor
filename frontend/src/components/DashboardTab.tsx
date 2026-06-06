import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useToast } from "../context/ToastContext";
import { ComponentEmbed } from "./ComponentEmbed";
import { ComponentPreviewDialog } from "./ComponentPreviewDialog";
import { PagePreviewDialog } from "./PagePreviewDialog";
import { PageHeader } from "./PageHeader";
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

export function DashboardTab({ reloadToken, onEditMonitor, onRefreshAll }: DashboardTabProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<DashboardItem | null>(null);
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

  const renderContent = (item: DashboardItem) => {
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
    if (item.monitor.extract_mode === "component" || parseComponentPayload(snap.content)) {
      return <ComponentEmbed content={snap.content} snapshot={snap} />;
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
    <section className="tab active">
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

      <div className="card-grid">
        {items.map((item) => {
          const snap = item.latest_snapshot;
          const modeLabel = EXTRACT_MODE_LABELS[item.monitor.extract_mode] || item.monitor.extract_mode;
          const isComponent =
            item.monitor.extract_mode === "component" ||
            Boolean(parseComponentPayload(snap?.content));

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
              {renderContent(item)}
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
                {isComponent && snap?.content ? (
                  <button
                    type="button"
                    className="small-btn ghost-btn"
                    onClick={() => setPreview(item)}
                  >
                    放大预览
                  </button>
                ) : null}
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

      {preview?.latest_snapshot?.content ? (
        <ComponentPreviewDialog
          open
          title={preview.monitor.name}
          content={preview.latest_snapshot.content}
          snapshot={preview.latest_snapshot}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </section>
  );
}

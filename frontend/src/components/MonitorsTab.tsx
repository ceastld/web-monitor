import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "./PageHeader";
import { PagePreviewDialog } from "./PagePreviewDialog";
import { StatusBadge } from "./StatusBadge";
import { formatTime } from "../utils/format";
import type { Monitor, Profile } from "../types";
import { EXTRACT_MODE_LABELS } from "../types";

interface MonitorsTabProps {
  reloadToken: number;
  onCreate: () => void;
  onEdit: (monitor: Monitor) => void;
}

export function MonitorsTab({ reloadToken, onCreate, onEdit }: MonitorsTabProps) {
  const { showToast } = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [profileMap, setProfileMap] = useState<Record<number, string>>({});
  const [pagePreviewId, setPagePreviewId] = useState<number | null>(null);
  const [pagePreviewMeta, setPagePreviewMeta] = useState<{ name: string; profile: string | null } | null>(null);
  const [fetchingId, setFetchingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [monitorList, profiles] = await Promise.all([
      apiGet<Monitor[]>("/api/monitors"),
      apiGet<Profile[]>("/api/profiles"),
    ]);
    setMonitors(monitorList);
    setProfileMap(Object.fromEntries(profiles.map((p) => [p.id, p.name])));
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const fetchOne = async (id: number) => {
    setFetchingId(id);
    try {
      await apiSend("POST", `/api/monitors/${id}/fetch`);
      showToast("抓取完成");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setFetchingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("确定删除该监控节点？")) return;
    await apiSend("DELETE", `/api/monitors/${id}`);
    showToast("已删除");
    await load();
  };

  return (
    <section className="tab active">
      <PageHeader
        title="监控节点"
        subtitle="自定义 URL 与 CSS/XPath 选择器"
        actions={
          <button type="button" className="primary-btn" onClick={onCreate}>
            新建监控
          </button>
        }
      />

      {monitors.length === 0 ? (
        <div className="empty">暂无监控节点</div>
      ) : (
        <div className="monitor-list">
          {monitors.map((m) => {
            const modeLabel = EXTRACT_MODE_LABELS[m.extract_mode] || m.extract_mode;
            const profileName = m.profile_id ? profileMap[m.profile_id] || String(m.profile_id) : null;

            return (
              <article key={m.id} className="monitor-list-item">
                <div className="card-head">
                  <div>
                    <h3>
                      {m.name}
                      <span className="mode-tag">{modeLabel}</span>
                    </h3>
                    <div className="card-meta card-url">{m.url}</div>
                  </div>
                  {m.enabled ? (
                    <StatusBadge status={m.last_status} />
                  ) : (
                    <span className="status pending">停用</span>
                  )}
                </div>

                <div className="monitor-selector">
                  <span className="monitor-selector-label">选择器</span>
                  <code>
                    {m.selector_type}: {m.selector}
                  </code>
                </div>

                <div className="card-meta monitor-list-meta">
                  <span>配置档：{profileName || "无需登录"}</span>
                  <span className="meta-sep">·</span>
                  <span>间隔 {m.interval_minutes} 分钟</span>
                  <span className="meta-sep">·</span>
                  <span>{m.enabled ? "启用" : "停用"}</span>
                  <span className="meta-sep">·</span>
                  <span>{formatTime(m.last_fetched_at)}</span>
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className="small-btn ghost-btn"
                    onClick={() => {
                      setPagePreviewId(m.id);
                      setPagePreviewMeta({
                        name: m.name,
                        profile: profileName,
                      });
                    }}
                  >
                    快速查看
                  </button>
                  <button type="button" className="small-btn ghost-btn" onClick={() => onEdit(m)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="small-btn primary-btn"
                    disabled={fetchingId === m.id}
                    onClick={() => void fetchOne(m.id)}
                  >
                    {fetchingId === m.id ? "抓取中…" : "抓取"}
                  </button>
                  <button type="button" className="small-btn danger-btn" onClick={() => void remove(m.id)}>
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

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

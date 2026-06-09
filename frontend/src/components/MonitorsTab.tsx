import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";
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
  onQuickSetup: () => void;
  onEdit: (monitor: Monitor) => void;
}

export function MonitorsTab({ reloadToken, onCreate, onQuickSetup, onEdit }: MonitorsTabProps) {
  const { showToast } = useToast();
  const { canUseInteractiveSetup, shortNotice } = useSetupCapabilities();
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
          <>
            <button
              type="button"
              className="primary-btn"
              disabled={!canUseInteractiveSetup}
              title={!canUseInteractiveSetup ? shortNotice ?? undefined : undefined}
              onClick={onQuickSetup}
            >
              一键添加
            </button>
            <button type="button" className="ghost-btn" onClick={onCreate}>
              高级新建
            </button>
          </>
        }
      />

      {monitors.length === 0 ? (
        <div className="empty">暂无监控节点</div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll responsive-table monitor-table">
            <table>
              <thead>
                <tr>
                  <th>监控</th>
                  <th>状态</th>
                  <th>选择器</th>
                  <th>调度</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => {
                  const modeLabel = EXTRACT_MODE_LABELS[m.extract_mode] || m.extract_mode;
                  const profileName = m.profile_id ? profileMap[m.profile_id] || String(m.profile_id) : null;

                  return (
                    <tr key={m.id}>
                      <td className="col-name" data-label="监控">
                        <div className="monitor-table-name">
                          <span>{m.name}</span>
                          <span className="mode-tag">{modeLabel}</span>
                        </div>
                        <div className="monitor-table-url" title={m.url}>
                          {m.url}
                        </div>
                      </td>
                      <td data-label="状态">
                        {m.enabled ? (
                          <StatusBadge status={m.last_status} />
                        ) : (
                          <span className="status pending">停用</span>
                        )}
                      </td>
                      <td className="col-selector col-span-2" data-label="选择器">
                        <code className="monitor-table-selector">
                          {m.selector_type}: {m.selector}
                        </code>
                      </td>
                      <td data-label="调度">
                        <div className="monitor-table-schedule">
                          <span>{profileName || "无需登录"}</span>
                          <span className="monitor-table-schedule-sub">
                            每 {m.interval_minutes} 分钟 · {formatTime(m.last_fetched_at)}
                          </span>
                        </div>
                      </td>
                      <td className="col-actions" data-label="操作">
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
                          查看
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

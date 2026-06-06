import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useToast } from "../context/ToastContext";
import type { Monitor, MonitorFormData, Profile } from "../types";

interface MonitorDialogProps {
  open: boolean;
  monitorId: number | null;
  initialMonitor: Monitor | null;
  onClose: () => void;
  onSaved: () => void;
}

const defaultForm: MonitorFormData = {
  name: "",
  url: "",
  selector: "",
  selector_type: "css",
  extract_mode: "text",
  profile_id: null,
  interval_minutes: 15,
  enabled: true,
};

function monitorToForm(monitor: Monitor): MonitorFormData {
  return {
    name: monitor.name,
    url: monitor.url,
    selector: monitor.selector,
    selector_type: monitor.selector_type,
    extract_mode: monitor.extract_mode,
    profile_id: monitor.profile_id,
    interval_minutes: monitor.interval_minutes,
    enabled: monitor.enabled,
  };
}

export function MonitorDialog({
  open,
  monitorId,
  initialMonitor,
  onClose,
  onSaved,
}: MonitorDialogProps) {
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<MonitorFormData>(defaultForm);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(Boolean(monitorId));

    void apiGet<Profile[]>("/api/profiles").then((items) => {
      if (!cancelled) setProfiles(items);
    });

    if (monitorId) {
      if (initialMonitor?.id === monitorId) {
        setForm(monitorToForm(initialMonitor));
      }

      void apiGet<Monitor>(`/api/monitors/${monitorId}`)
        .then((monitor) => {
          if (!cancelled) setForm(monitorToForm(monitor));
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            showToast(err instanceof Error ? err.message : "加载监控配置失败");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setForm({ ...defaultForm });
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [open, monitorId, initialMonitor, showToast]);

  const update = <K extends keyof MonitorFormData>(key: K, value: MonitorFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (monitorId) {
        await apiSend("PATCH", `/api/monitors/${monitorId}`, form);
      } else {
        await apiSend("POST", "/api/monitors", form);
      }
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} onClose={onClose} onCancel={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <h3>{monitorId ? "编辑监控节点" : "新建监控节点"}</h3>
        {loading ? <p className="dialog-loading">正在加载配置…</p> : null}
        <fieldset className="dialog-fields" disabled={loading || saving}>
        <label>
          名称
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          URL
          <input
            required
            type="url"
            placeholder="https://example.com/page"
            value={form.url}
            onChange={(e) => update("url", e.target.value)}
          />
        </label>
        <label>
          选择器
          <input
            required
            placeholder="#content 或 //div[@class='price']"
            value={form.selector}
            onChange={(e) => update("selector", e.target.value)}
          />
        </label>
        <div className="row">
          <label>
            选择器类型
            <select
              value={form.selector_type}
              onChange={(e) => update("selector_type", e.target.value)}
            >
              <option value="css">CSS</option>
              <option value="xpath">XPath</option>
            </select>
          </label>
          <label>
            提取模式
            <select
              value={form.extract_mode}
              onChange={(e) => update("extract_mode", e.target.value as MonitorFormData["extract_mode"])}
            >
              <option value="text">文本</option>
              <option value="html">HTML 源码</option>
              <option value="component">组件（内嵌展示）</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            登录配置档
            <select
              value={form.profile_id ?? ""}
              onChange={(e) =>
                update("profile_id", e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">无需登录</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.site_domain})
                </option>
              ))}
            </select>
          </label>
          <label>
            间隔（分钟）
            <input
              required
              type="number"
              min={1}
              max={1440}
              value={form.interval_minutes}
              onChange={(e) => update("interval_minutes", Number(e.target.value))}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          启用监控
        </label>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-btn" disabled={saving || loading}>
            保存
          </button>
        </div>
      </form>
    </dialog>
  );
}

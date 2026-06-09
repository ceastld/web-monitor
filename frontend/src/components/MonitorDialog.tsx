import { useEffect, useRef, useState } from "react";

import { apiGet, apiSend } from "../api/client";

import { useToast } from "../context/ToastContext";

import { MonitorComponentSetup } from "./MonitorComponentSetup";

import {

  BITIFUL_DASHBOARD_SCRIPT,

  BITIFUL_DASHBOARD_SELECTOR,

  isBitifulDashboardUrl,

} from "../templates/bitiful-dashboard";

import {

  CURSOR_DASHBOARD_SCRIPT,

  CURSOR_DASHBOARD_SELECTOR,

  isCursorDashboardUrl,

} from "../templates/cursor-dashboard";

import { defaultExtractScript } from "../utils/render";

import type { Monitor, MonitorFormData, Profile } from "../types";



export interface MonitorSavedResult {

  id: number;

  isEdit: boolean;

}



interface MonitorDialogProps {

  open: boolean;

  monitorId: number | null;

  initialMonitor: Monitor | null;

  onClose: () => void;

  onSaved: (result: MonitorSavedResult) => void | Promise<void>;

}



const defaultForm: MonitorFormData = {

  name: "",

  url: "",

  selector: "",

  selector_type: "css",

  extract_mode: "component",

  extract_script: defaultExtractScript(),

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

    extract_script: monitor.extract_script ?? defaultExtractScript(),

    profile_id: monitor.profile_id,

    interval_minutes: monitor.interval_minutes,

    enabled: monitor.enabled,

  };

}



function applyUrlScriptDefaults(prev: MonitorFormData, nextUrl: string): MonitorFormData {

  const next = { ...prev, url: nextUrl };

  if (prev.extract_mode !== "script") return next;

  if (isBitifulDashboardUrl(nextUrl)) {

    const keepCustom =

      Boolean(prev.extract_script?.trim()) && prev.extract_script !== BITIFUL_DASHBOARD_SCRIPT;

    if (keepCustom) return next;

    return {

      ...next,

      extract_script: BITIFUL_DASHBOARD_SCRIPT,

      selector: prev.selector.trim() ? prev.selector : BITIFUL_DASHBOARD_SELECTOR,

    };

  }

  if (isCursorDashboardUrl(nextUrl)) {

    const keepCustom =

      Boolean(prev.extract_script?.trim()) && prev.extract_script !== CURSOR_DASHBOARD_SCRIPT;

    if (keepCustom) return next;

    return {

      ...next,

      extract_script: CURSOR_DASHBOARD_SCRIPT,

      selector: prev.selector.trim() ? prev.selector : CURSOR_DASHBOARD_SELECTOR,

    };

  }

  return next;

}



function applyScriptModeDefaults(prev: MonitorFormData): MonitorFormData {

  if (prev.extract_script?.trim()) return prev;

  if (isBitifulDashboardUrl(prev.url)) {

    return {

      ...prev,

      extract_script: BITIFUL_DASHBOARD_SCRIPT,

      selector: prev.selector.trim() ? prev.selector : BITIFUL_DASHBOARD_SELECTOR,

    };

  }

  if (isCursorDashboardUrl(prev.url)) {

    return {

      ...prev,

      extract_script: CURSOR_DASHBOARD_SCRIPT,

      selector: prev.selector.trim() ? prev.selector : CURSOR_DASHBOARD_SELECTOR,

    };

  }

  return { ...prev, extract_script: defaultExtractScript() };

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

  const [profilesReloadToken, setProfilesReloadToken] = useState(0);



  const selectedProfile =

    form.profile_id != null ? profiles.find((item) => item.id === form.profile_id) ?? null : null;



  const reloadProfiles = () => setProfilesReloadToken((value) => value + 1);



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

  }, [open, monitorId, initialMonitor, profilesReloadToken, showToast]);



  const update = <K extends keyof MonitorFormData>(key: K, value: MonitorFormData[K]) => {

    setForm((prev) => ({ ...prev, [key]: value }));

  };



  const handleSubmit = async (event: React.FormEvent) => {

    event.preventDefault();

    if (!form.selector.trim()) {

      showToast("请先选择或填写选择器");

      return;

    }

    if (form.extract_mode === "script" && !form.extract_script?.trim()) {

      showToast("请填写抓取脚本");

      return;

    }

    setSaving(true);

    const payload = {

      ...form,

      extract_script: form.extract_mode === "script" ? form.extract_script : null,

    };

    try {

      if (monitorId) {

        await apiSend("PATCH", `/api/monitors/${monitorId}`, payload);

        await onSaved({ id: monitorId, isEdit: true });

      } else {

        const created = await apiSend<Monitor>("POST", "/api/monitors", payload);

        if (!created) {

          throw new Error("创建失败");

        }

        await onSaved({ id: created.id, isEdit: false });

      }

      onClose();

    } catch (err) {

      showToast(err instanceof Error ? err.message : "保存失败");

    } finally {

      setSaving(false);

    }

  };



  const showVisualSetup = form.extract_mode === "component" || form.extract_mode === "script";

  const showScriptEditor = form.extract_mode === "script";

  const showInlineSelector = !showVisualSetup;



  return (

    <dialog

      id="monitor-setup-dialog"

      ref={dialogRef}

      className={showVisualSetup ? "monitor-setup-dialog-wide" : undefined}

      onClose={onClose}

      onCancel={onClose}

    >

      <form className="monitor-dialog-form" onSubmit={(e) => void handleSubmit(e)}>

        <header className="dialog-form-header">

          <div>

            <h3>{monitorId ? "编辑监控节点" : "新建监控节点"}</h3>

            {loading ? <p className="dialog-loading">正在加载配置…</p> : null}

          </div>

          <label className="dialog-enabled-toggle">

            <input

              type="checkbox"

              checked={form.enabled}

              disabled={loading || saving}

              onChange={(e) => update("enabled", e.target.checked)}

            />

            启用

          </label>

        </header>



        <fieldset className="dialog-fields" disabled={loading || saving}>

          <section className="dialog-section">

            <h4 className="dialog-section-title">基本信息</h4>

            <div className="dialog-section-body">

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

                  onChange={(e) => setForm((prev) => applyUrlScriptDefaults(prev, e.target.value))}

                />

              </label>

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

                        {p.name}

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

            </div>

          </section>



          <section className="dialog-section">

            <h4 className="dialog-section-title">抓取方式</h4>

            <div className="dialog-section-body">

              <label>

                提取模式

                <select

                  value={form.extract_mode}

                  onChange={(e) => {

                    const mode = e.target.value as MonitorFormData["extract_mode"];

                    setForm((prev) => {

                      const next = { ...prev, extract_mode: mode };

                      if (mode !== "script") return next;

                      return applyScriptModeDefaults(next);

                    });

                  }}

                >

                  <option value="component">组件（内嵌展示）</option>

                  <option value="script">脚本（自定义 HTML）</option>

                  <option value="text">文本</option>

                  <option value="html">HTML 源码</option>

                </select>

              </label>



              {showInlineSelector ? (

                <div className="row">

                  <label>

                    选择器

                    <input

                      required

                      placeholder="#content"

                      value={form.selector}

                      onChange={(e) => update("selector", e.target.value)}

                    />

                  </label>

                  <label>

                    类型

                    <select

                      value={form.selector_type}

                      onChange={(e) => update("selector_type", e.target.value)}

                    >

                      <option value="css">CSS</option>

                      <option value="xpath">XPath</option>

                    </select>

                  </label>

                </div>

              ) : null}

            </div>

          </section>



          {showVisualSetup ? (

            <section className="dialog-section dialog-section-flush">

              <h4 className="dialog-section-title">选区与预览</h4>

              <MonitorComponentSetup

                url={form.url}

                profileId={form.profile_id}

                profile={selectedProfile}

                selector={form.selector}

                selectorType={form.selector_type}

                extractMode={form.extract_mode}

                extractScript={form.extract_script}

                editMode={Boolean(monitorId)}

                onProfileUpdated={reloadProfiles}

                onSelectorChange={(nextSelector, nextSelectorType) => {

                  update("selector", nextSelector);

                  update("selector_type", nextSelectorType);

                }}

              />

            </section>

          ) : null}



          {showScriptEditor ? (

            <details className="dialog-details" open>

              <summary>抓取脚本</summary>

              <div className="dialog-details-body">

                <p className="field-hint">

                  在页面中执行，可用 element / document / window，须 return HTML 字符串。

                </p>

                <textarea

                  className="script-editor"

                  rows={10}

                  spellCheck={false}

                  value={form.extract_script ?? ""}

                  onChange={(e) => update("extract_script", e.target.value)}

                />

              </div>

            </details>

          ) : null}



          {showVisualSetup ? (

            <details className="dialog-details">

              <summary>高级：手动编辑选择器</summary>

              <div className="dialog-details-body">

                <div className="row">

                  <label>

                    选择器

                    <input

                      required

                      placeholder="点选上方区域，或手动填写"

                      value={form.selector}

                      onChange={(e) => update("selector", e.target.value)}

                    />

                  </label>

                  <label>

                    类型

                    <select

                      value={form.selector_type}

                      onChange={(e) => update("selector_type", e.target.value)}

                    >

                      <option value="css">CSS</option>

                      <option value="xpath">XPath</option>

                    </select>

                  </label>

                </div>

              </div>

            </details>

          ) : null}

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


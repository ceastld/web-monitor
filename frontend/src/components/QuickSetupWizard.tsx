import { useEffect, useRef, useState } from "react";
import { apiSend } from "../api/client";
import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";
import { useToast } from "../context/ToastContext";
import { MonitorComponentSetup } from "./MonitorComponentSetup";
import { SetupFloatingToolbar } from "./SetupFloatingToolbar";
import { SetupNotice } from "./SetupNotice";
import { suggestMonitorName } from "../utils/url";
import type { Monitor, Profile, ProfileResolveResponse, QuickSetupStep } from "../types";

interface QuickSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export function QuickSetupWizard({ open, onClose, onCompleted }: QuickSetupWizardProps) {
  const { showToast } = useToast();
  const { canUseInteractiveSetup, canUseChrome } = useSetupCapabilities();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [step, setStep] = useState<QuickSetupStep>("url");
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [useProfile, setUseProfile] = useState(false);
  const [selector, setSelector] = useState("");
  const [selectorType, setSelectorType] = useState("css");
  const [pickedPageTitle, setPickedPageTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginSessionActive, setLoginSessionActive] = useState(false);

  const reset = () => {
    setStep("url");
    setUrl("");
    setProfile(null);
    setUseProfile(false);
    setSelector("");
    setSelectorType("css");
    setPickedPageTitle(null);
    setBusy(false);
    setLoginSessionActive(false);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleClose = async () => {
    if (loginSessionActive && profile) {
      try {
        await apiSend("POST", `/api/profiles/${profile.id}/login/cancel`);
      } catch {
        // ignore cleanup errors on close
      }
    }
    reset();
    onClose();
  };

  const beginSetup = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      showToast("请输入网页链接");
      return;
    }

    setBusy(true);
    try {
      const resolved = await apiSend<ProfileResolveResponse>("POST", "/api/profiles/resolve", {
        url: trimmedUrl,
      });
      if (!resolved) {
        showToast("配置档解析失败");
        return;
      }
      setProfile(resolved.profile);

      if (resolved.has_storage) {
        setUseProfile(true);
        setStep("select");
        showToast(resolved.created ? "已创建配置档，使用已保存的登录环境" : "使用已有登录环境");
        return;
      }

      if (canUseChrome) {
        try {
          const imported = await apiSend<{ message: string }>(
            "POST",
            `/api/profiles/${resolved.profile.id}/import-chrome`,
          );
          setUseProfile(true);
          setStep("select");
          showToast(imported?.message ?? "已从 Chrome 导入登录环境");
          return;
        } catch {
          showToast("Chrome 导入失败，请手动登录或先在 Chrome 中登录该站点");
        }
      }

      const loginRes = await apiSend<{ message: string }>(
        "POST",
        `/api/profiles/${resolved.profile.id}/login/start`,
        { start_url: trimmedUrl, use_chrome_cdp: canUseChrome },
      );
      setLoginSessionActive(true);
      setStep("login");
      showToast(loginRes?.message ?? "已打开浏览器窗口，请手动登录");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "启动配置失败");
    } finally {
      setBusy(false);
    }
  };

  const continueWithLogin = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await apiSend("POST", `/api/profiles/${profile.id}/login/save`);
      setLoginSessionActive(false);
      setUseProfile(true);
      setStep("select");
      showToast("登录环境已保存，请打开浏览器选区");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存登录状态失败");
    } finally {
      setBusy(false);
    }
  };

  const continueWithoutLogin = async () => {
    if (profile && loginSessionActive) {
      try {
        await apiSend("POST", `/api/profiles/${profile.id}/login/cancel`);
      } catch {
        // ignore
      }
      setLoginSessionActive(false);
    }
    setUseProfile(false);
    setStep("select");
    showToast("将不使用登录环境识别页面");
  };

  const confirmMonitor = async () => {
    if (!selector.trim()) {
      showToast("请先在页面上点选一个组件区域");
      return;
    }

    setBusy(true);
    try {
      const monitorName = suggestMonitorName(url, pickedPageTitle);
      const created = await apiSend<Monitor>("POST", "/api/monitors", {
        name: monitorName,
        url: url.trim(),
        selector: selector.trim(),
        selector_type: selectorType,
        extract_mode: "component",
        profile_id: useProfile && profile ? profile.id : null,
        interval_minutes: 15,
        enabled: true,
      });
      if (!created) {
        throw new Error("创建监控失败");
      }
      const snapshot = await apiSend<{ status: string }>(
        "POST",
        `/api/monitors/${created.id}/fetch`,
      );
      showToast(
        snapshot?.status === "error"
          ? `监控「${monitorName}」已添加，但首次抓取失败`
          : `监控「${monitorName}」已添加并完成首次抓取`,
      );
      reset();
      onCompleted();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加监控失败");
    } finally {
      setBusy(false);
    }
  };

  const profileId = useProfile && profile ? profile.id : null;

  return (
    <dialog
      ref={dialogRef}
      id="quick-setup-dialog"
      className="quick-setup-dialog"
      onClose={() => void handleClose()}
      onCancel={(event) => {
        event.preventDefault();
        void handleClose();
      }}
    >
      <div className="quick-setup-shell">
        <header className="quick-setup-header">
          <div>
            <h3>一键添加监控</h3>
            <p className="quick-setup-steps">链接 → 登录 → 选区 → 完成</p>
          </div>
          <button type="button" className="ghost-btn quick-setup-close" onClick={() => void handleClose()}>
            关闭
          </button>
        </header>

        <div className="quick-setup-body">
          {!canUseInteractiveSetup ? (
            <section className="quick-setup-blocked">
              <SetupNotice title="无法在此环境使用一键添加" />
              <p className="quick-setup-blocked-tip">
                请在运行后端的电脑上打开本应用，或使用「监控节点 → 高级新建」手动填写 URL 与选择器。
              </p>
            </section>
          ) : null}

          {canUseInteractiveSetup && step === "url" ? (
            <section className="quick-setup-url-step">
              <label className="quick-setup-url-label">
                网页链接
                <input
                  type="url"
                  required
                  autoFocus
                  placeholder="https://example.com/dashboard"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void beginSetup();
                  }}
                />
              </label>
              <p className="quick-setup-url-hint">粘贴要监控的页面地址，系统会自动打开浏览器。</p>
            </section>
          ) : null}

          {canUseInteractiveSetup && step === "login" ? (
            <section className="quick-setup-login-step">
              <div className="quick-setup-login-card">
                <strong>请在外部浏览器中登录</strong>
                <p>
                  <code>{url}</code>
                  {profile ? (
                    <>
                      {" "}
                      · <code>{profile.name}</code>
                    </>
                  ) : null}
                </p>
                <p className="quick-setup-login-tip">登录后点底部「保存登录并继续」；无需登录可跳过。</p>
              </div>
            </section>
          ) : null}

          {canUseInteractiveSetup && step === "select" ? (
            <section className="quick-setup-select-step">
              <MonitorComponentSetup
                url={url}
                profileId={profileId}
                profile={useProfile ? profile : null}
                selector={selector}
                selectorType={selectorType}
                extractMode="component"
                autoPick
                hideHeader
                onSelectorChange={(nextSelector, nextSelectorType) => {
                  setSelector(nextSelector);
                  setSelectorType(nextSelectorType);
                }}
              />
            </section>
          ) : null}
        </div>

        {!canUseInteractiveSetup ? (
          <SetupFloatingToolbar stepLabel="不可用" hint="需在服务器本机完成浏览器选区与登录">
            <button type="button" className="primary-btn" onClick={() => void handleClose()}>
              知道了
            </button>
          </SetupFloatingToolbar>
        ) : null}

        {canUseInteractiveSetup && step === "url" ? (
          <SetupFloatingToolbar
            stepLabel="步骤 1 / 3"
            hint="粘贴要监控的页面链接，然后点击开始"
          >
            <button type="button" className="ghost-btn" onClick={() => void handleClose()}>
              取消
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={busy || !url.trim()}
              onClick={() => void beginSetup()}
            >
              {busy ? "准备中…" : "开始配置"}
            </button>
          </SetupFloatingToolbar>
        ) : null}

        {canUseInteractiveSetup && step === "login" ? (
          <SetupFloatingToolbar
            stepLabel="步骤 2 / 3"
            hint="在外部浏览器完成登录后点击下方按钮"
          >
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => void handleClose()}>
              取消
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => void continueWithoutLogin()}
            >
              无需登录，直接选组件
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={() => void continueWithLogin()}
            >
              {busy ? "保存中…" : "保存登录并继续"}
            </button>
          </SetupFloatingToolbar>
        ) : null}

        {canUseInteractiveSetup && step === "select" ? (
          <SetupFloatingToolbar
            stepLabel="步骤 3 / 3"
            hint={
              selector
                ? `已选组件：${selector.slice(0, 80)}${selector.length > 80 ? "…" : ""}`
                : "在弹出浏览器中用悬浮球点选区域，确认后点此添加"
            }
          >
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => void handleClose()}>
              取消
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={busy || !selector.trim()}
              onClick={() => void confirmMonitor()}
            >
              {busy ? "添加中…" : "确认添加"}
            </button>
          </SetupFloatingToolbar>
        ) : null}
      </div>
    </dialog>
  );
}

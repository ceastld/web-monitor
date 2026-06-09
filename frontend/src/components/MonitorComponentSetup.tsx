import { useEffect, useState } from "react";

import { apiSend } from "../api/client";

import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";

import { useToast } from "../context/ToastContext";

import { useProfileLogin } from "../hooks/useProfileLogin";

import { useSelectorPick } from "../hooks/useSelectorPick";

import { ComponentEmbed } from "./ComponentEmbed";

import { RenderEmbed } from "./RenderEmbed";

import { MonitorProfileSessionBar } from "./MonitorProfileSessionBar";

import { SetupNotice } from "./SetupNotice";

import type {

  ExtractMode,

  MonitorDraftPreviewRequest,

  MonitorPreview,

  Profile,

} from "../types";



interface MonitorComponentSetupProps {

  url: string;

  profileId: number | null;

  profile?: Profile | null;

  selector: string;

  selectorType: string;

  extractMode: ExtractMode;

  extractScript?: string | null;

  onSelectorChange: (selector: string, selectorType: string) => void;

  onProfileUpdated?: () => void;

  autoPick?: boolean;

  hideHeader?: boolean;

  editMode?: boolean;

}



export function MonitorComponentSetup({

  url,

  profileId,

  profile = null,

  selector,

  selectorType,

  extractMode,

  extractScript = null,

  onSelectorChange,

  onProfileUpdated,

  autoPick = false,

  hideHeader = false,

}: MonitorComponentSetupProps) {

  const { showToast } = useToast();

  const [previewing, setPreviewing] = useState(false);

  const [preview, setPreview] = useState<MonitorPreview | null>(null);

  const [sessionBusy, setSessionBusy] = useState(false);

  const [pickHint, setPickHint] = useState<string | null>(null);

  const [pickedLabel, setPickedLabel] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);



  const { canUseInteractiveSetup, canUseChrome, chromeCdp } = useSetupCapabilities();

  const { startLogin, saveLogin, cancelLogin, importFromChrome } = useProfileLogin({

    onSuccess: (message) => {

      showToast(message);

      onProfileUpdated?.();

    },

    onError: (message) => showToast(message),

  });



  const { picking, startPick, cancelPick } = useSelectorPick({

    preferChromeCdp: canUseChrome,

    onPicked: (nextSelector, nextSelectorType, label) => {

      onSelectorChange(nextSelector, nextSelectorType);

      setPickedLabel(label ?? null);

      setPreview(null);

      setPreviewOpen(false);

      showToast("选区已确认");

    },

    onCancelled: () => {

      setPickHint(null);

      showToast("已取消选区");

    },

    onError: (message) => showToast(message),

    onStatusMessage: (message) => setPickHint(message),

  });



  const canPick = Boolean(url.trim());

  const canPreview =

    canPick &&

    Boolean(selector.trim()) &&

    (extractMode !== "script" || Boolean(extractScript?.trim()));

  const busy = picking || previewing || sessionBusy;

  const previewLabel = extractMode === "script" ? "脚本预览" : "组件预览";



  const runProfileAction = async (action: () => Promise<void>) => {

    setSessionBusy(true);

    try {

      await action();

    } finally {

      setSessionBusy(false);

    }

  };



  const handleImportChrome = () => {

    if (!profileId) return;

    if (!canUseChrome) {

      showToast(

        `未连接 Chrome 调试端口。请先关闭所有 Chrome 窗口，再运行：.\\scripts\\launch-chrome-debug.ps1${chromeCdp.hint ? `\n${chromeCdp.hint}` : ""}`,

      );

      return;

    }

    void runProfileAction(async () => {

      const ok = await importFromChrome(profileId);

      if (ok) onProfileUpdated?.();

    });

  };



  const handleOpenLogin = () => {

    if (!profileId || !url.trim()) return;

    void runProfileAction(async () => {

      await startLogin(profileId, url.trim(), canUseChrome);

      onProfileUpdated?.();

    });

  };



  const handleSaveLogin = () => {

    if (!profileId) return;

    void runProfileAction(async () => {

      await saveLogin(profileId);

      onProfileUpdated?.();

    });

  };



  const handleCancelLogin = () => {

    if (!profileId) return;

    void runProfileAction(async () => {

      await cancelLogin(profileId);

      onProfileUpdated?.();

    });

  };



  const handleStartPick = () => {

    void startPick(url, profileId);

  };



  useEffect(() => {

    if (!autoPick || !canPick || !canUseInteractiveSetup) return;

    void startPick(url, profileId);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto pick once when entering step

  }, [autoPick, url, profileId, canUseInteractiveSetup]);



  const handlePreview = async () => {

    if (!canPreview) return;

    setPreviewing(true);

    try {

      const payload: MonitorDraftPreviewRequest = {

        url: url.trim(),

        selector: selector.trim(),

        selector_type: selectorType,

        extract_mode: extractMode,

        extract_script: extractMode === "script" ? extractScript : null,

        profile_id: profileId,

      };

      const result = await apiSend<MonitorPreview>("POST", "/api/monitors/preview-draft", payload);

      setPreview(result);

      setPreviewOpen(true);

    } finally {

      setPreviewing(false);

    }

  };



  return (

    <section className="monitor-component-setup">

      {!hideHeader && !canUseInteractiveSetup ? (

        <SetupNotice title="浏览器辅助不可用" />

      ) : null}



      {hideHeader ? (

        picking ? <div className="monitor-setup-loading">正在打开浏览器，请用右下角悬浮球选区…</div> : null

      ) : (

        <MonitorProfileSessionBar

          profile={profile}

          pageUrl={url}

          busy={busy}

          picking={picking}

          previewing={previewing}

          canPreview={canPreview}

          previewLabel={previewLabel}

          interactiveDisabled={!canUseInteractiveSetup}

          chromeCdp={chromeCdp}

          onImportChrome={handleImportChrome}

          onOpenLogin={handleOpenLogin}

          onSaveLogin={handleSaveLogin}

          onCancelLogin={handleCancelLogin}

          onStartPick={handleStartPick}

          onCancelPick={() => void cancelPick()}

          onPreview={() => void handlePreview()}

        />

      )}



      {pickHint ? <div className="monitor-setup-pick-hint">{pickHint}</div> : null}



      {selector ? (

        <div className="monitor-setup-selector-line">

          <span className="monitor-setup-selector-type">{selectorType}</span>

          {pickedLabel ? <strong className="monitor-setup-selector-label">{pickedLabel}</strong> : null}

          <code className="monitor-setup-selector-code">{selector}</code>

        </div>

      ) : (

        <p className="monitor-setup-empty-hint">

          {canUseInteractiveSetup

            ? "点击「打开选区」在浏览器中点选要监控的区域"

            : "远程访问时请在下方的「高级」中手动填写选择器，或使用脚本预览验证"}

        </p>

      )}



      {preview?.status === "error" ? (

        <div className="monitor-setup-error">{preview.error_message || "预览失败"}</div>

      ) : null}



      {preview?.status === "success" ? (

        <details className="dialog-details monitor-setup-preview-details" open={previewOpen}>

          <summary>

            预览结果

            <span className="monitor-setup-preview-meta-inline">

              匹配 {preview.match_count} 个元素

              {preview.selector_content ? ` · ${preview.selector_content}` : ""}

            </span>

          </summary>

          <div className="monitor-setup-preview">

            {preview.render_content ? <RenderEmbed panel content={preview.render_content} /> : null}

            {preview.component_content ? (

              <ComponentEmbed panel content={preview.component_content} snapshot={null} />

            ) : null}

          </div>

        </details>

      ) : null}

    </section>

  );

}


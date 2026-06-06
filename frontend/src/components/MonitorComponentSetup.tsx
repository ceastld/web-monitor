import { useEffect, useMemo, useRef, useState } from "react";
import { apiSend } from "../api/client";
import { ComponentEmbed } from "./ComponentEmbed";
import { screenshotUrl } from "../utils/component";
import type {
  DiscoverSelectorsResult,
  ExtractMode,
  MonitorDraftPreviewRequest,
  MonitorPreview,
  SelectorCandidate,
} from "../types";

interface MonitorComponentSetupProps {
  url: string;
  profileId: number | null;
  selector: string;
  selectorType: string;
  extractMode: ExtractMode;
  onSelectorChange: (selector: string, selectorType: string) => void;
}

export function MonitorComponentSetup({
  url,
  profileId,
  selector,
  selectorType,
  extractMode,
  onSelectorChange,
}: MonitorComponentSetupProps) {
  const [discovering, setDiscovering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoverSelectorsResult | null>(null);
  const [preview, setPreview] = useState<MonitorPreview | null>(null);
  const [activeCandidate, setActiveCandidate] = useState<string | null>(null);
  const shotRef = useRef<HTMLImageElement>(null);
  const [overlayScale, setOverlayScale] = useState(1);

  const updateOverlayScale = () => {
    const img = shotRef.current;
    if (!img || !img.naturalWidth) return;
    setOverlayScale(img.clientWidth / img.naturalWidth);
  };

  useEffect(() => {
    updateOverlayScale();
    window.addEventListener("resize", updateOverlayScale);
    return () => window.removeEventListener("resize", updateOverlayScale);
  }, [discovery?.screenshot_path]);

  const pageShot = screenshotUrl(discovery?.screenshot_path);
  const canDiscover = Boolean(url.trim());
  const canPreview = canDiscover && Boolean(selector.trim());

  const handleDiscover = async () => {
    if (!canDiscover) return;
    setDiscovering(true);
    setPreview(null);
    try {
      const result = await apiSend<DiscoverSelectorsResult>("POST", "/api/monitors/discover-selectors", {
        url: url.trim(),
        profile_id: profileId,
      });
      setDiscovery(result);
      if (result?.status === "error") return;
      if (result?.candidates.length && !selector.trim()) {
        const first = result.candidates[0];
        onSelectorChange(first.selector, first.selector_type);
        setActiveCandidate(first.selector);
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handlePreview = async () => {
    if (!canPreview) return;
    setPreviewing(true);
    try {
      const payload: MonitorDraftPreviewRequest = {
        url: url.trim(),
        selector: selector.trim(),
        selector_type: selectorType,
        extract_mode: extractMode,
        profile_id: profileId,
      };
      const result = await apiSend<MonitorPreview>("POST", "/api/monitors/preview-draft", payload);
      setPreview(result);
    } finally {
      setPreviewing(false);
    }
  };

  const selectCandidate = (candidate: SelectorCandidate) => {
    onSelectorChange(candidate.selector, candidate.selector_type);
    setActiveCandidate(candidate.selector);
    setPreview(null);
  };

  const overlayStyle = useMemo(() => {
    if (!pageShot || !discovery?.candidates.length) return null;
    return discovery.candidates;
  }, [discovery?.candidates, pageShot]);

  return (
    <section className="monitor-component-setup">
      <div className="monitor-component-setup-head">
        <div>
          <strong>快速添加组件</strong>
          <p>加载页面后点选候选区域，预览无误再保存。无需手写 XPath。</p>
        </div>
        <div className="monitor-component-setup-actions">
          <button
            type="button"
            className="small-btn ghost-btn"
            disabled={!canDiscover || discovering}
            onClick={() => void handleDiscover()}
          >
            {discovering ? "识别中…" : "1. 加载并识别"}
          </button>
          <button
            type="button"
            className="small-btn primary-btn"
            disabled={!canPreview || previewing}
            onClick={() => void handlePreview()}
          >
            {previewing ? "预览中…" : "2. 预览组件"}
          </button>
        </div>
      </div>

      {discovery?.status === "error" ? (
        <div className="monitor-setup-error">{discovery.error_message || "页面识别失败"}</div>
      ) : null}

      {pageShot && overlayStyle ? (
        <div className="selector-picker-layout">
          <div className="selector-picker-shot-wrap">
            <img
              ref={shotRef}
              className="selector-picker-shot"
              src={pageShot}
              alt="页面预览"
              onLoad={updateOverlayScale}
            />
            <div className="selector-picker-overlay" aria-hidden="true">
              {overlayStyle.map((candidate) => (
                <button
                  key={candidate.selector}
                  type="button"
                  className={`selector-picker-box${
                    activeCandidate === candidate.selector || selector === candidate.selector
                      ? " active"
                      : ""
                  }`}
                  style={{
                    left: `${candidate.x * overlayScale}px`,
                    top: `${candidate.y * overlayScale}px`,
                    width: `${candidate.width * overlayScale}px`,
                    height: `${candidate.height * overlayScale}px`,
                  }}
                  title={candidate.label}
                  onClick={() => selectCandidate(candidate)}
                />
              ))}
            </div>
          </div>

          <div className="selector-picker-list">
            <div className="selector-picker-list-title">
              候选组件 ({discovery?.candidates.length ?? 0})
            </div>
            <div className="selector-picker-items">
              {discovery?.candidates.map((candidate) => (
                <button
                  key={candidate.selector}
                  type="button"
                  className={`selector-picker-item${
                    activeCandidate === candidate.selector || selector === candidate.selector
                      ? " active"
                      : ""
                  }`}
                  onClick={() => selectCandidate(candidate)}
                >
                  <span className="selector-picker-item-tag">{candidate.tag}</span>
                  <strong>{candidate.label || candidate.selector}</strong>
                  <span className="selector-picker-item-meta">
                    {candidate.width}×{candidate.height}
                  </span>
                  <code>{candidate.selector}</code>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {preview?.status === "error" ? (
        <div className="monitor-setup-error">{preview.error_message || "组件预览失败"}</div>
      ) : null}

      {preview?.status === "success" ? (
        <div className="monitor-setup-preview">
          <div className="monitor-setup-preview-meta">
            匹配 {preview.match_count} 个元素
            {preview.selector_content ? ` · ${preview.selector_content}` : ""}
          </div>
          {preview.component_content ? (
            <ComponentEmbed panel content={preview.component_content} snapshot={null} />
          ) : preview.element_screenshot_path ? (
            <img
              className="monitor-setup-element-shot"
              src={screenshotUrl(preview.element_screenshot_path) || ""}
              alt="元素预览"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

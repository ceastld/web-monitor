const PICKER_ROOT_ID = "wm-selector-picker-root";

/** In-page floating picker for interactive component selection. */
export function installSelectorPicker() {
  const mount = () => {
    if (document.getElementById(PICKER_ROOT_ID)) return;
    if (!document.documentElement) return;
    bootPicker();
  };

  if (document.documentElement) {
    mount();
    return;
  }

  document.addEventListener(
    "readystatechange",
    () => {
      if (document.documentElement) mount();
    },
    { once: true },
  );
}

function bootPicker() {
  const describe =
    window.__wmDescribeSelector ??
    ((el) => ({
      selector: el.tagName.toLowerCase(),
      selector_type: "css",
      unique: false,
      matchCount: 0,
      note: "选择器引擎未加载",
    }));

  const labelOf = (el) => {
    const text = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, 96);
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 96);
    return el.tagName.toLowerCase();
  };

  const isPickerNode = (node) => {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest(`#${PICKER_ROOT_ID}`));
  };

  let hovered = null;
  let selected = null;
  let highlightBox = null;

  const ensureHighlight = () => {
    if (highlightBox) return highlightBox;
    highlightBox = document.createElement("div");
    highlightBox.id = "wm-selector-picker-highlight";
    Object.assign(highlightBox.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: "2px solid #5b8cff",
      background: "rgba(91, 140, 255, 0.16)",
      borderRadius: "6px",
      boxShadow: "0 0 0 1px rgba(91, 140, 255, 0.35)",
      display: "none",
    });
    document.documentElement.appendChild(highlightBox);
    return highlightBox;
  };

  const showHighlight = (el, color) => {
    const box = ensureHighlight();
    const rect = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.style.borderColor = color;
    box.style.background = color === "#22c55e" ? "rgba(34, 197, 94, 0.14)" : "rgba(91, 140, 255, 0.16)";
  };

  const hideHighlight = () => {
    if (highlightBox) highlightBox.style.display = "none";
  };

  const root = document.createElement("div");
  root.id = PICKER_ROOT_ID;
  root.innerHTML = `
    <style>
      #${PICKER_ROOT_ID} {
        all: initial;
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #e8edf8;
      }
      #${PICKER_ROOT_ID} * { box-sizing: border-box; }
      #${PICKER_ROOT_ID} .wm-ball {
        width: 52px;
        height: 52px;
        border-radius: 999px;
        border: none;
        cursor: pointer;
        background: linear-gradient(135deg, #5b8cff, #3d6fe0);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 10px 28px rgba(0,0,0,0.28);
      }
      #${PICKER_ROOT_ID} .wm-panel {
        display: none;
        width: 320px;
        margin-bottom: 10px;
        padding: 14px;
        border-radius: 14px;
        background: rgba(12, 18, 34, 0.96);
        border: 1px solid rgba(91, 140, 255, 0.35);
        backdrop-filter: blur(10px);
        box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      }
      #${PICKER_ROOT_ID}.expanded .wm-panel { display: block; }
      #${PICKER_ROOT_ID} .wm-title {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 700;
      }
      #${PICKER_ROOT_ID} .wm-hint {
        margin: 0 0 10px;
        font-size: 12px;
        line-height: 1.45;
        color: #9aa8c7;
      }
      #${PICKER_ROOT_ID} .wm-meta {
        margin: 0 0 8px;
        font-size: 12px;
        color: #c5d0ea;
        word-break: break-all;
      }
      #${PICKER_ROOT_ID} .wm-selector {
        margin: 0 0 12px;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        font-size: 11px;
        line-height: 1.4;
        color: #dbe4ff;
        word-break: break-all;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        max-height: 96px;
        overflow: auto;
      }
      #${PICKER_ROOT_ID} .wm-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${PICKER_ROOT_ID} .wm-btn {
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        cursor: pointer;
        background: rgba(255,255,255,0.06);
        color: #e8edf8;
      }
      #${PICKER_ROOT_ID} .wm-btn.primary {
        background: #5b8cff;
        border-color: #5b8cff;
        color: #fff;
      }
      #${PICKER_ROOT_ID} .wm-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    </style>
    <div class="wm-panel">
      <p class="wm-title">Web Monitor 选区</p>
      <p class="wm-hint" data-role="hint">页面加载中，加载完成后点击元素选区。</p>
      <p class="wm-meta" data-role="meta">尚未选择</p>
      <pre class="wm-selector" data-role="selector">-</pre>
      <div class="wm-actions">
        <button type="button" class="wm-btn primary" data-action="confirm" disabled>确认选区</button>
        <button type="button" class="wm-btn" data-action="reset">重选</button>
        <button type="button" class="wm-btn" data-action="cancel">取消</button>
      </div>
    </div>
    <button type="button" class="wm-ball" data-action="toggle" aria-label="选区工具">选区</button>
  `;

  document.documentElement.appendChild(root);

  const metaEl = root.querySelector('[data-role="meta"]');
  const selectorEl = root.querySelector('[data-role="selector"]');
  const confirmBtn = root.querySelector('[data-action="confirm"]');

  const updatePanel = () => {
    if (!selected) {
      metaEl.textContent = "尚未选择";
      selectorEl.textContent = "-";
      confirmBtn.disabled = true;
      return;
    }

    const info = describe(selected);
    const label = labelOf(selected);
    const rect = selected.getBoundingClientRect();
    const typeLabel = info.selector_type === "xpath" ? "XPath" : "CSS";
    const status = info.unique ? "唯一" : `匹配 ${info.matchCount} 个`;
    metaEl.textContent = `${selected.tagName.toLowerCase()} · ${label} · ${Math.round(rect.width)}×${Math.round(rect.height)} · ${typeLabel} · ${status}`;
    selectorEl.textContent = info.note ? `${info.selector}\n\n// ${info.note}` : info.selector;
    confirmBtn.disabled = !info.selector || !info.unique;
  };

  const resetSelection = () => {
    selected = null;
    hovered = null;
    hideHighlight();
    updatePanel();
  };

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();

    if (action === "toggle") {
      root.classList.toggle("expanded");
      return;
    }
    if (action === "reset") {
      resetSelection();
      return;
    }
    if (action === "cancel") {
      window.__wmPickCancel?.();
      return;
    }
    if (action === "confirm" && selected) {
      const info = describe(selected);
      if (!info.selector || !info.unique) {
        metaEl.textContent = info.note || "无法生成唯一选择器，请点更具体的区域";
        return;
      }
      window.__wmPickConfirm?.({
        selector: info.selector,
        selector_type: info.selector_type,
        label: labelOf(selected),
        tag: selected.tagName.toLowerCase(),
      });
    }
  });

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!root.classList.contains("expanded")) return;
      const target = event.target;
      if (!(target instanceof Element) || isPickerNode(target)) return;
      if (selected) return;
      if (hovered === target) return;
      hovered = target;
      showHighlight(target, "#5b8cff");
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!root.classList.contains("expanded")) return;
      const target = event.target;
      if (!(target instanceof Element) || isPickerNode(target)) return;
      event.preventDefault();
      event.stopPropagation();
      selected = target;
      showHighlight(target, "#22c55e");
      updatePanel();
    },
    true,
  );

  root.classList.add("expanded");
  updatePanel();

  const hintEl = root.querySelector('[data-role="hint"]');
  const readyHint = "点击元素后系统会自动生成唯一选择器（必要时用 XPath）。";
  const markReady = () => {
    if (hintEl) hintEl.textContent = readyHint;
  };

  if (document.readyState === "complete") {
    markReady();
  } else {
    window.addEventListener("load", markReady, { once: true });
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (document.body && hintEl?.textContent?.includes("加载中")) {
          hintEl.textContent = "页面仍在加载，部分内容出现后即可点击选区。";
        }
      },
      { once: true },
    );
  }
}

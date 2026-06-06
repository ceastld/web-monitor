/** Browser-side selector discovery for visual component setup. */
export function discoverSelectors() {
  const MAX = 40;

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 56 && rect.height >= 40 && rect.bottom > 0 && rect.top < window.innerHeight;
  };

  const cssPath = (el) => {
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }

    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      if (node.classList.length) {
        const cls = Array.from(node.classList)
          .slice(0, 2)
          .filter((name) => name && !name.includes(":") && !/^\d/.test(name))
          .join(".");
        if (cls) part += `.${cls}`;
      }

      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === node.tagName,
        );
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }

      parts.unshift(part);
      node = node.parentElement;
      if (parts.join(" > ").length > 220) break;
    }

    return parts.join(" > ");
  };

  const label = (el) => {
    const text = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, 96);
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 96);
    return el.tagName.toLowerCase();
  };

  const score = (el, rect) => {
    let value = 0;
    const className = (el.className || "").toString().toLowerCase();
    const text = (el.innerText || "").trim();

    if (/card|panel|widget|module|box|content|section|hero|summary|stat|balance|price/.test(className)) {
      value += 40;
    }
    if (["article", "section", "aside", "main"].includes(el.tagName.toLowerCase())) {
      value += 18;
    }
    if (text.length >= 8 && text.length <= 240) value += 24;
    if (rect.width >= 120 && rect.width <= 720) value += 20;
    if (rect.height >= 60 && rect.height <= 420) value += 20;

    const area = rect.width * rect.height;
    if (area > window.innerWidth * window.innerHeight * 0.55) value -= 50;
    if (area < 4000) value -= 10;

    return value;
  };

  const seen = new Set();
  const candidates = [];

  for (const el of document.querySelectorAll(
    "article, section, aside, main, div, table, form, nav, header, footer, li",
  )) {
    if (!(el instanceof Element) || !isVisible(el)) continue;

    const selector = cssPath(el);
    if (!selector || seen.has(selector)) continue;

    try {
      if (document.querySelectorAll(selector).length !== 1) continue;
    } catch {
      continue;
    }

    seen.add(selector);
    const rect = el.getBoundingClientRect();
    candidates.push({
      selector,
      selector_type: "css",
      label: label(el),
      tag: el.tagName.toLowerCase(),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      score: score(el, rect),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, MAX).map((item) => ({
    selector: item.selector,
    selector_type: item.selector_type,
    label: item.label,
    tag: item.tag,
    width: item.width,
    height: item.height,
    x: item.x,
    y: item.y,
  }));
}

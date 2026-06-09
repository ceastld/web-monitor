/** Browser-side unique CSS selector builder (injected via addInitScript). */
(() => {
  if (window.__wmDescribeSelector) return;

  const countSelectorMatches = (selector) => {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  };

  const isUniqueSelector = (selector, el) => {
    if (!selector) return false;
    if (countSelectorMatches(selector) !== 1) return false;
    try {
      return document.querySelector(selector) === el;
    } catch {
      return false;
    }
  };

  const pickStableClasses = (el) => {
    const classes = [];
    for (const name of el.classList) {
      if (!name || name.length > 48) continue;
      if (/[:[\]!%]/.test(name)) continue;
      if (/^\d/.test(name)) continue;
      classes.push(name);
      if (classes.length >= 4) break;
    }
    return classes;
  };

  const segmentFor = (el, detail = 0) => {
    const tag = el.tagName.toLowerCase();

    const testId = el.getAttribute("data-testid");
    if (testId && detail === 0) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }

    if (el.id) {
      const escaped = CSS.escape(el.id);
      if (escaped) return `#${escaped}`;
    }

    const aria = el.getAttribute("aria-label");
    if (aria && detail >= 1) {
      return `${tag}[aria-label="${CSS.escape(aria)}"]`;
    }

    const role = el.getAttribute("role");
    if (role && detail >= 2) {
      return `${tag}[role="${CSS.escape(role)}"]`;
    }

    let part = tag;
    const classes = pickStableClasses(el);
    if (classes.length) {
      part += `.${classes.join(".")}`;
    }

    const parent = el.parentElement;
    if (!parent) return part;

    const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
    if (sameTagSiblings.length > 1 && detail >= 1) {
      part += `:nth-of-type(${sameTagSiblings.indexOf(el) + 1})`;
    }

    if (parent.children.length > 1 && detail >= 2) {
      part += `:nth-child(${Array.from(parent.children).indexOf(el) + 1})`;
    }

    if (detail >= 3) {
      const rawClasses = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3);
      for (const token of rawClasses) {
        if (/[:[\]!%]/.test(token)) {
          part += `[class~="${CSS.escape(token)}"]`;
        }
      }
    }

    return part;
  };

  const buildUniqueSelector = (el) => {
    if (!(el instanceof Element)) return "";

    const attrCandidates = [
      () => {
        const testId = el.getAttribute("data-testid");
        return testId ? `[data-testid="${CSS.escape(testId)}"]` : "";
      },
      () => (el.id ? `#${CSS.escape(el.id)}` : ""),
      () => {
        const name = el.getAttribute("name");
        return name ? `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]` : "";
      },
    ];

    for (const candidate of attrCandidates) {
      const selector = candidate();
      if (isUniqueSelector(selector, el)) return selector;
    }

    const chain = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      chain.unshift(node);
      node = node.parentElement;
    }

    if (!chain.length) return "";

    const maxDetail = 3;
    for (let detail = 0; detail <= maxDetail; detail += 1) {
      const segments = chain.map((item) => segmentFor(item, detail));
      const selector = segments.join(" > ");
      if (isUniqueSelector(selector, el)) return selector;
    }

    for (let anchor = chain.length - 1; anchor >= 0; anchor -= 1) {
      for (let detail = 1; detail <= maxDetail; detail += 1) {
        const segments = chain.map((item, index) =>
          segmentFor(item, index >= anchor ? detail : Math.min(detail, 1)),
        );
        const selector = segments.join(" > ");
        if (isUniqueSelector(selector, el)) return selector;
      }
    }

    const fallback = chain.map((item) => segmentFor(item, maxDetail)).join(" > ");
    if (isUniqueSelector(fallback, el)) return fallback;

    return buildXPath(el);
  };

  const buildXPath = (el) => {
    if (!(el instanceof Element)) return "";

    if (el.id) {
      const byId = `//*[@id="${el.id.replace(/"/g, '\\"')}"]`;
      try {
        if (document.evaluate(byId, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
          .snapshotLength === 1) {
          return byId;
        }
      } catch {
        // fall through
      }
    }

    const segments = [];
    let current = el;
    while (current && current.nodeType === 1) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = current.parentElement;
    }
    return `/${segments.join("/")}`;
  };

  const describeSelector = (el) => {
    const selector = buildUniqueSelector(el);
    const isXPath = selector.startsWith("/");
    const matchCount = isXPath
      ? (() => {
          try {
            return document.evaluate(
              selector,
              document,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null,
            ).snapshotLength;
          } catch {
            return 0;
          }
        })()
      : countSelectorMatches(selector);

    const unique = isXPath
      ? (() => {
          try {
            const result = document.evaluate(
              selector,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue;
            return result === el;
          } catch {
            return false;
          }
        })()
      : isUniqueSelector(selector, el);

    return {
      selector,
      selector_type: isXPath ? "xpath" : "css",
      unique,
      matchCount,
      note: unique
        ? isXPath
          ? "已自动切换为 XPath 精确定位"
          : null
        : `仍匹配 ${matchCount} 个，请点更小的子区域`,
    };
  };

  window.__wmDescribeSelector = describeSelector;
  window.__wmBuildUniqueSelector = buildUniqueSelector;
})();

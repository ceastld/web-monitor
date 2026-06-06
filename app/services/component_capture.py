COMPONENT_CAPTURE_JS = """
({ selector, selectorType }) => {
  const resolveElement = () => {
    if (selectorType === "xpath") {
      return document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
    }
    return document.querySelector(selector);
  };

  const source = resolveElement();
  if (!source || !(source instanceof Element)) {
    return null;
  }

  const styleProps = [
    "color", "background-color", "background-image", "background-size",
    "background-position", "background-repeat", "font-size", "font-weight",
    "font-family", "font-style", "line-height", "letter-spacing", "padding-top",
    "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right",
    "margin-bottom", "margin-left", "border-top", "border-right", "border-bottom",
    "border-left", "border-radius", "display", "flex-direction", "flex-wrap",
    "align-items", "justify-content", "gap", "grid-template-columns", "grid-template-rows",
    "max-width", "max-height", "text-align",
    "text-decoration", "text-transform", "white-space", "opacity", "box-shadow",
    "overflow", "overflow-x", "overflow-y", "object-fit", "vertical-align",
    "list-style-type", "position", "top", "left", "right", "bottom", "z-index", "transform"
  ];

  const isUsableValue = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "initial" || trimmed === "auto" || trimmed === "normal") {
      return false;
    }
    if (/var\\s*\\(/i.test(trimmed)) return false;
    return true;
  };

  const applyComputedStyles = (fromEl, toEl) => {
    const computed = getComputedStyle(fromEl);
    const parts = [];
    for (const prop of styleProps) {
      const value = computed.getPropertyValue(prop);
      if (isUsableValue(value)) {
        parts.push(`${prop}:${value}`);
      }
    }
    if (parts.length) {
      toEl.setAttribute("style", parts.join(";") + ";");
    }
  };

  const collectCssVariables = () => {
    const rootStyles = getComputedStyle(document.documentElement);
    const vars = [];
    for (let i = 0; i < rootStyles.length; i += 1) {
      const prop = rootStyles[i];
      if (!prop.startsWith("--")) continue;
      const value = rootStyles.getPropertyValue(prop).trim();
      if (isUsableValue(value)) {
        vars.push(`${prop}:${value}`);
      }
    }
    return vars.join(";");
  };

  const absolutizeUrls = (root, baseUrl) => {
    const attrs = ["src", "href", "poster", "srcset"];
    for (const attr of attrs) {
      root.querySelectorAll(`[${attr}]`).forEach((node) => {
        const raw = node.getAttribute(attr);
        if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) {
          return;
        }
        if (attr === "srcset") {
          const resolved = raw
            .split(",")
            .map((part) => {
              const bits = part.trim().split(/\\s+/);
              try {
                bits[0] = new URL(bits[0], baseUrl).href;
              } catch (_) {}
              return bits.join(" ");
            })
            .join(", ");
          node.setAttribute("srcset", resolved);
          return;
        }
        try {
          node.setAttribute(attr, new URL(raw, baseUrl).href);
        } catch (_) {}
      });
    }
  };

  const clone = source.cloneNode(true);
  applyComputedStyles(source, clone);

  const sourceNodes = [source, ...source.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  for (let i = 1; i < sourceNodes.length && i < cloneNodes.length; i += 1) {
    applyComputedStyles(sourceNodes[i], cloneNodes[i]);
  }

  absolutizeUrls(clone, document.baseURI);

  const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.href)
    .filter(Boolean)
    .slice(0, 12);

  const rect = source.getBoundingClientRect();

  return {
    type: "component",
    html: clone.outerHTML,
    base_url: document.baseURI,
    tag_name: source.tagName.toLowerCase(),
    node_count: clone.querySelectorAll("*").length + 1,
    stylesheets,
    css_variables: collectCssVariables(),
    capture_width: Math.round(rect.width),
    capture_height: Math.round(rect.height),
  };
}
"""

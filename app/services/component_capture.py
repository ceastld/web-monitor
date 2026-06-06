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
    "color", "background", "background-color", "background-image", "background-size",
    "background-position", "background-repeat", "font", "font-size", "font-weight",
    "font-family", "font-style", "line-height", "letter-spacing", "padding", "margin",
    "border", "border-radius", "border-color", "border-width", "border-style",
    "display", "flex", "flex-direction", "flex-wrap", "align-items", "justify-content",
    "gap", "grid", "grid-template-columns", "grid-template-rows", "width", "height",
    "max-width", "min-height", "max-height", "text-align", "text-decoration",
    "text-transform", "white-space", "opacity", "box-shadow", "overflow", "overflow-x",
    "overflow-y", "object-fit", "vertical-align", "list-style", "list-style-type",
    "position", "top", "left", "right", "bottom", "z-index", "transform"
  ];

  const applyComputedStyles = (fromEl, toEl) => {
    const computed = getComputedStyle(fromEl);
    let inline = toEl.getAttribute("style") || "";
    for (const prop of styleProps) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "initial" && value !== "auto") {
        inline += `${prop}:${value};`;
      }
    }
    if (inline) {
      toEl.setAttribute("style", inline);
    }
  };

  const absolutizeUrls = (root, baseUrl) => {
    const attrs = ["src", "href", "poster", "srcset"];
    for (const attr of attrs) {
      root.querySelectorAll(`[${attr}]`).forEach((node) => {
        const raw = node.getAttribute(attr);
        if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) {
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

  return {
    type: "component",
    html: clone.outerHTML,
    base_url: document.baseURI,
    tag_name: source.tagName.toLowerCase(),
    node_count: clone.querySelectorAll("*").length + 1,
  };
}
"""

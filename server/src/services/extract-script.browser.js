/**
 * Run a user-authored extract script against the matched element.
 * The script must return an HTML string for dashboard rendering.
 * @param {Element} element
 * @param {string} scriptSource
 */
export function runExtractScript(element, scriptSource) {
  if (!(element instanceof Element)) {
    throw new Error("选择器未匹配到元素");
  }
  if (!scriptSource || !String(scriptSource).trim()) {
    throw new Error("抓取脚本不能为空");
  }

  const runner = new Function(
    "element",
    "document",
    "window",
    `"use strict";\n${String(scriptSource)}`,
  );
  const result = runner(element, document, window);

  if (result === undefined || result === null) {
    throw new Error("脚本未返回值，请使用 return 返回 HTML 字符串");
  }
  if (typeof result !== "string") {
    throw new Error("脚本必须返回 HTML 字符串");
  }

  const html = result.trim();
  if (!html) {
    throw new Error("脚本返回的 HTML 为空");
  }

  return {
    type: "render",
    html,
  };
}

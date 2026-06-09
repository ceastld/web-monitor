/** Bitiful console dashboard — four metric cards row. */
export const BITIFUL_DASHBOARD_SELECTOR =
  "#main .mx-auto > .flex.justify-between.mt-10:nth-of-type(2)";

export const BITIFUL_DASHBOARD_SCRIPT = `function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardLikeChildren(row) {
  return [...row.children].filter(function (child) {
    return child instanceof HTMLElement && child.offsetWidth > 72 && child.offsetHeight > 56;
  });
}

function resolveMetricRow(el) {
  const scoped = el.closest("#main .flex.justify-between.mt-10")
    || el.closest("div.flex.justify-between.mt-10")
    || el.closest('div[class*="justify-between"][class*="mt-10"]');
  if (scoped && cardLikeChildren(scoped).length >= 2) {
    return scoped;
  }

  const candidates = document.querySelectorAll(
    "#main .flex.justify-between.mt-10, #main div[class*='justify-between'][class*='mt-10']",
  );
  let best = scoped || el;
  let bestCount = cardLikeChildren(best).length;
  candidates.forEach(function (row) {
    const count = cardLikeChildren(row).length;
    if (count > bestCount) {
      best = row;
      bestCount = count;
    }
  });
  if (bestCount >= 2) return best;

  let node = el;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const count = cardLikeChildren(node).length;
    if (count >= 2) return node;
    node = node.parentElement;
  }
  return el;
}

function parseCard(card) {
  const style = window.getComputedStyle(card);
  const bg =
    style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? style.backgroundColor
      : "#e3f3f3";

  const labelNode =
    card.querySelector('[class*="text-base"]')
    || card.querySelector(":scope > div > div > div")
    || card.querySelector(":scope > div");

  const valueNode =
    card.querySelector('[class*="text-2xl"]')
    || card.querySelector('[class*="font-medium"]');

  const label = (labelNode?.innerText || "").trim().split("\\n")[0] || "—";
  let value = (valueNode?.innerText || "").trim();
  if (!value) {
    const lines = (card.innerText || "")
      .trim()
      .split(/\\n+/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
    value = lines.find(function (line) {
      return line !== label;
    }) || lines[lines.length - 1] || "—";
  }

  return { label: label, value: value, bg: bg };
}

const row = resolveMetricRow(element);
const cards = cardLikeChildren(row).map(parseCard);

if (!cards.length) {
  const fallback = (element.innerText || "").trim() || "—";
  return (
    '<div style="font-family:system-ui,sans-serif;padding:16px 18px;background:#fff;border-radius:12px;">' +
    '<div style="font-size:28px;font-weight:700;color:#0f172a;">' +
    escapeHtml(fallback) +
    "</div></div>"
  );
}

const items = cards
  .map(function (card) {
    return (
      '<article style="flex:1 1 148px;min-width:140px;padding:16px 18px;border-radius:16px;background:' +
      card.bg +
      ';box-shadow:inset 0 0 0 1px rgba(15,23,42,.05);">' +
      '<div style="font-size:13px;line-height:1.4;color:#64748b;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
      escapeHtml(card.label) +
      "</div>" +
      '<div style="font-size:24px;line-height:1.2;font-weight:600;color:#1e293b;white-space:nowrap;">' +
      escapeHtml(card.value) +
      "</div></article>"
    );
  })
  .join("");

return (
  '<div style="display:flex;flex-wrap:wrap;gap:12px;width:100%;font-family:system-ui,-apple-system,sans-serif;">' +
  items +
  "</div>"
);`;

export function isBitifulDashboardUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname;
    return host === "console.bitiful.com" || host.endsWith(".bitiful.com");
  } catch {
    return url.includes("bitiful.com");
  }
}

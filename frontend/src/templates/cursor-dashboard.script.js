function decodeAttr(value) {
  if (!value) return "";
  if (value.indexOf("&lt;") < 0 && value.indexOf("&quot;") < 0) return value;
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/ +/g, " ").trim();
}

function parseTooltipHtml(tipHtml) {
  var plain = normalizeText(tipHtml);
  var dateMatch = plain.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Za-z]+ \d{1,2}, \d{4}/,
  );
  var linesMatch = tipHtml.match(/<strong>([^<]+)<\/strong>/);
  var diffsMatch = tipHtml.match(/<span[^>]*>([^<]*)<\/span>/);
  var noEdit = /No Lines Edited/i.test(tipHtml);
  var linesLabel = noEdit ? "0" : linesMatch ? linesMatch[1].trim() : "—";
  var lines = noEdit ? 0 : Number(String(linesLabel).replace(/,/g, "")) || 0;

  return {
    date: dateMatch ? dateMatch[0] : null,
    linesLabel: linesLabel,
    lines: lines,
    meta: diffsMatch ? diffsMatch[1].trim() : "",
  };
}

function resolveChartRoot(el) {
  if (el.querySelector("[data-tooltip-html]")) return el;
  var card = el.closest("div.space-y-6") || el.closest("main") || el;
  if (card.querySelector("[data-tooltip-html]")) return card;
  return el;
}

function collectRows(root) {
  var nodes = root.querySelectorAll("[data-tooltip-html]");
  var byDate = new Map();
  nodes.forEach(function (node) {
    var raw = node.getAttribute("data-tooltip-html");
    if (!raw) return;
    var parsed = parseTooltipHtml(decodeAttr(raw));
    if (!parsed.date) return;
    byDate.set(parsed.date, parsed);
  });
  return Array.from(byDate.values()).sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function startOfDay(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatShortDate(date) {
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
}

var root = resolveChartRoot(element);
var rows = collectRows(root);

if (!rows.length) {
  var bars = root.querySelectorAll('[data-tooltip-id="contribution-tooltip"]');
  bars.forEach(function (bar) {
    bar.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    bar.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  rows = collectRows(root);
}

if (!rows.length) {
  return (
    '<div style="font-family:system-ui,sans-serif;padding:14px 16px;border-radius:12px;background:rgba(15,23,42,.55);color:#94a3b8;">' +
    "未找到 AI Line Edits 图表数据，请确认选择器指向贡献图卡片。" +
    "</div>"
  );
}

var recentDays = 7;
var today = startOfDay(new Date());
var dayMs = 86400000;
var rowByDay = new Map();
rows.forEach(function (row) {
  rowByDay.set(startOfDay(new Date(row.date)).getTime(), row);
});

var recent = [];
for (var offset = recentDays - 1; offset >= 0; offset -= 1) {
  var day = new Date(today.getTime() - offset * dayMs);
  var key = day.getTime();
  var hit = rowByDay.get(key);
  recent.push(
    hit || {
      date: day.toISOString(),
      linesLabel: "0",
      lines: 0,
      meta: "",
      shortDate: formatShortDate(day),
    },
  );
}

recent.forEach(function (row) {
  if (!row.shortDate) {
    row.shortDate = formatShortDate(new Date(row.date));
  }
});

var total = recent.reduce(function (sum, row) {
  return sum + (row.lines || 0);
}, 0);

var maxLines = Math.max.apply(
  null,
  recent
    .map(function (row) {
      return row.lines || 0;
    })
    .concat([1]),
);

var cards = recent
  .map(function (row) {
    var intensity = row.lines > 0 ? Math.max(0.28, row.lines / maxLines) : 0.08;
    var bg = "rgba(31, 138, 101, " + intensity + ")";
    return (
      '<article style="flex:1 1 72px;min-width:68px;padding:10px 8px;border-radius:10px;background:' +
      bg +
      ';text-align:center;box-shadow:inset 0 0 0 1px rgba(74,222,128,.18);">' +
      '<div style="font-size:11px;line-height:1.3;color:#cbd5e1;margin-bottom:6px;">' +
      escapeHtml(row.shortDate) +
      "</div>" +
      '<div style="font-size:15px;line-height:1.2;font-weight:700;color:#ecfdf5;white-space:nowrap;">' +
      escapeHtml(row.linesLabel) +
      "</div>" +
      (row.meta
        ? '<div style="font-size:10px;color:#86efac;margin-top:4px;">' + escapeHtml(row.meta) + "</div>"
        : "") +
      "</article>"
    );
  })
  .join("");

return (
  '<div style="width:100%;font-family:system-ui,-apple-system,sans-serif;">' +
  '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px;">' +
  '<div style="font-size:13px;font-weight:600;color:#e2e8f0;">最近 ' +
  recentDays +
  " 天 Lines Edited</div>" +
  '<div style="font-size:12px;color:#94a3b8;">合计 <span style="color:#4ade80;font-weight:700;">' +
  escapeHtml(total.toLocaleString("en-US")) +
  "</span></div></div>" +
  '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
  cards +
  "</div></div>"
);

/**
 * Configure Cursor AI Line Edits monitor with script rendering.
 * Usage: node scripts/setup-cursor-dashboard.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8765";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const templateSource = readFileSync(
  join(root, "frontend/src/templates/cursor-dashboard.ts"),
  "utf8",
);
const scriptSource = readFileSync(
  join(root, "frontend/src/templates/cursor-dashboard.script.js"),
  "utf8",
);

const selectorMatch = templateSource.match(
  /export const CURSOR_DASHBOARD_SELECTOR\s*=\s*"([^"]+)"/,
);

if (!selectorMatch || !scriptSource.trim()) {
  throw new Error("Failed to read Cursor template files");
}

const MONITOR = {
  name: "Cursor Dashboard · AI Line Edits",
  url: "https://cursor.com/cn/dashboard",
  selector: selectorMatch[1],
  selector_type: "css",
  extract_mode: "script",
  extract_script: scriptSource.trim(),
  interval_minutes: 15,
  enabled: true,
};

async function api(method, path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function main() {
  const profiles = await api("GET", "/api/profiles");
  const profile =
    profiles.find((item) => item.site_domain === "cursor.com")
    ?? profiles.find((item) => item.name.toLowerCase().includes("cursor"));

  if (!profile) {
    throw new Error("未找到 cursor.com 配置档，请先登录并保存");
  }

  const monitors = await api("GET", "/api/monitors");
  const existing = monitors.find(
    (item) => item.url.includes("cursor.com") && item.url.includes("dashboard"),
  );

  const payload = { ...MONITOR, profile_id: profile.id };
  let monitorId;

  if (existing) {
    const updated = await api("PATCH", `/api/monitors/${existing.id}`, payload);
    monitorId = updated.id;
    console.log("Updated monitor:", monitorId);
  } else {
    const created = await api("POST", "/api/monitors", payload);
    monitorId = created.id;
    console.log("Created monitor:", monitorId);
  }

  const snapshot = await api("POST", `/api/monitors/${monitorId}/fetch`);
  if (snapshot.status === "error") {
    throw new Error(snapshot.error_message || "抓取失败");
  }

  const rendered = JSON.parse(snapshot.content || "{}");
  console.log("Fetch OK:", snapshot.fetched_at);
  console.log((rendered.html || "").slice(0, 700));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

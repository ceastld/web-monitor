/**
 * Create or update the bingleimuzi dashboard balance component monitor.
 * Usage: node scripts/setup-bingleimuzi-balance.mjs
 */

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8765";

const PROFILE = {
  name: "冰雷木子",
  site_domain: "api.bingleimuzi.eu.cc",
  description: "冰雷木子 API 控制台登录态",
};

const MONITOR = {
  name: "冰雷木子 API 余额",
  url: "https://api.bingleimuzi.eu.cc/dashboard",
  selector: "div.card.p-4:has(.bg-emerald-100)",
  selector_type: "css",
  extract_mode: "component",
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
  let profile = profiles.find((item) => item.name === PROFILE.name);
  if (!profile) {
    profile = await api("POST", "/api/profiles", PROFILE);
    console.log("Created profile:", profile.id);
  } else {
    console.log("Reusing profile:", profile.id);
  }

  const monitors = await api("GET", "/api/monitors");
  const existing = monitors.find((item) => item.name === MONITOR.name);
  const payload = { ...MONITOR, profile_id: profile.id };

  if (existing) {
    const updated = await api("PATCH", `/api/monitors/${existing.id}`, payload);
    console.log("Updated monitor:", updated.id);
    return;
  }

  const created = await api("POST", "/api/monitors", payload);
  console.log("Created monitor:", created.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

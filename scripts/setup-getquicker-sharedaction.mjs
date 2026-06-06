/**
 * Create or update the getquicker shared action component monitor.
 * Usage: node scripts/setup-getquicker-sharedaction.mjs
 */

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8765";

const MONITOR = {
  name: "Quicker 共享动作",
  url: "https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe",
  selector: "/html/body/div[1]/div[2]/div[2]/div/div[2]/div/section[2]/div[2]/div/div",
  selector_type: "xpath",
  extract_mode: "component",
  profile_id: null,
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
  const monitors = await api("GET", "/api/monitors");
  const existing = monitors.find((item) => item.url === MONITOR.url);

  if (existing) {
    const updated = await api("PATCH", `/api/monitors/${existing.id}`, MONITOR);
    console.log("Updated monitor:", updated.id);
    return;
  }

  const created = await api("POST", "/api/monitors", MONITOR);
  console.log("Created monitor:", created.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

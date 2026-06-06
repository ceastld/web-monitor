import { createHash } from "node:crypto";

import { monitorRepo, snapshotRepo } from "../db.js";
import type { Snapshot } from "../types.js";
import { browserManager } from "./browser.js";

function contentHash(content: string | null): string | null {
  if (content === null) return null;
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function runMonitor(monitorId: number): Promise<Snapshot> {
  const monitor = monitorRepo.get(monitorId);
  if (!monitor) {
    throw new Error("监控节点不存在");
  }

  const fetch = await browserManager.fetchContent({
    url: monitor.url,
    selector: monitor.selector,
    selector_type: monitor.selector_type,
    extract_mode: monitor.extract_mode,
    profile_id: monitor.profile_id,
    monitor_id: monitor.id,
  });

  const prevSnapshot = snapshotRepo.getLatestSuccess(monitorId);
  const newHash = contentHash(fetch.content);

  let changed = false;
  if (!fetch.error && prevSnapshot?.content_hash && newHash) {
    changed = prevSnapshot.content_hash !== newHash;
  }

  const fetchedAt = new Date().toISOString();
  const snapshot = snapshotRepo.create({
    monitor_id: monitor.id,
    content: fetch.content,
    content_hash: newHash,
    screenshot_path: fetch.screenshot_path,
    status: fetch.error ? "error" : "success",
    error_message: fetch.error ?? null,
    changed,
    fetched_at: fetchedAt,
  });

  monitorRepo.updateLastFetch(monitor.id, fetchedAt, snapshot.status);
  return snapshot;
}

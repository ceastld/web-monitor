import { Router } from "express";
import { z } from "zod";

import { monitorRepo, profileRepo, snapshotRepo } from "../db.js";
import { browserManager, type PreviewResult } from "../services/browser.js";
import { runMonitor } from "../services/monitor-runner.js";
import { monitorScheduler } from "../services/scheduler.js";

const router = Router();

const monitorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(2048),
  selector: z.string().min(1).max(1024),
  selector_type: z.string().default("css"),
  extract_mode: z.string().default("text"),
  profile_id: z.number().int().nullable().optional(),
  interval_minutes: z.number().int().min(1).max(1440).default(15),
  enabled: z.boolean().default(true),
});

const monitorUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().min(1).max(2048).optional(),
  selector: z.string().min(1).max(1024).optional(),
  selector_type: z.string().optional(),
  extract_mode: z.string().optional(),
  profile_id: z.number().int().nullable().optional(),
  interval_minutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
});

const discoverSelectorsSchema = z.object({
  url: z.string().min(1).max(2048),
  profile_id: z.number().int().nullable().optional(),
});

const previewDraftSchema = z.object({
  url: z.string().min(1).max(2048),
  selector: z.string().min(1).max(1024),
  selector_type: z.string().default("css"),
  extract_mode: z.string().default("component"),
  profile_id: z.number().int().nullable().optional(),
});

function resolveProfileName(profileId: number | null | undefined): string | null {
  if (profileId == null) return null;
  return profileRepo.get(profileId)?.name ?? null;
}

function previewToResponse(options: {
  url: string;
  profileId: number | null;
  profileName: string | null;
  monitorId: number | null;
  result: PreviewResult;
}) {
  const { url, profileId, profileName, monitorId, result } = options;
  const base = {
    monitor_id: monitorId,
    url,
    profile_id: profileId,
    profile_name: profileName,
    screenshot_path: result.screenshot_path,
    element_screenshot_path: result.element_screenshot_path ?? null,
    final_url: result.final_url,
    page_title: result.page_title,
    selector_content: result.selector_content,
    component_content: result.component_content ?? null,
    match_count: result.match_count ?? 0,
  };

  if (result.error) {
    return { ...base, status: "error", error_message: result.error };
  }
  return { ...base, status: "success", error_message: null };
}

router.get("", (_req, res) => {
  res.json(monitorRepo.list());
});

router.post("/discover-selectors", async (req, res) => {
  const parsed = discoverSelectorsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  if (parsed.data.profile_id != null && !profileRepo.get(parsed.data.profile_id)) {
    res.status(400).json({ detail: "关联的配置档不存在" });
    return;
  }

  const profileId = parsed.data.profile_id ?? null;
  const result = await browserManager.discoverSelectors(parsed.data.url, profileId);

  if (result.error) {
    res.json({
      url: parsed.data.url,
      profile_id: profileId,
      profile_name: resolveProfileName(profileId),
      screenshot_path: result.screenshot_path,
      final_url: result.final_url,
      page_title: result.page_title,
      candidates: [],
      status: "error",
      error_message: result.error,
    });
    return;
  }

  res.json({
    url: parsed.data.url,
    profile_id: profileId,
    profile_name: resolveProfileName(profileId),
    screenshot_path: result.screenshot_path,
    final_url: result.final_url,
    page_title: result.page_title,
    candidates: result.candidates,
    status: "success",
    error_message: null,
  });
});

router.post("/preview-draft", async (req, res) => {
  const parsed = previewDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  if (parsed.data.profile_id != null && !profileRepo.get(parsed.data.profile_id)) {
    res.status(400).json({ detail: "关联的配置档不存在" });
    return;
  }

  const profileId = parsed.data.profile_id ?? null;
  const result = await browserManager.previewPage({
    url: parsed.data.url,
    profile_id: profileId,
    selector: parsed.data.selector,
    selector_type: parsed.data.selector_type,
    extract_mode: parsed.data.extract_mode,
    monitor_id: null,
  });

  res.json(
    previewToResponse({
      url: parsed.data.url,
      profileId,
      profileName: resolveProfileName(profileId),
      monitorId: null,
      result,
    }),
  );
});

router.post("", (req, res) => {
  const parsed = monitorCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  if (parsed.data.profile_id != null && !profileRepo.get(parsed.data.profile_id)) {
    res.status(400).json({ detail: "关联的配置档不存在" });
    return;
  }

  const monitor = monitorRepo.create(parsed.data);
  if (monitor.enabled) {
    monitorScheduler.scheduleMonitor(monitor.id, monitor.interval_minutes);
  }
  res.status(201).json(monitor);
});

router.get("/:monitorId", (req, res) => {
  const monitorId = Number(req.params.monitorId);
  const monitor = monitorRepo.get(monitorId);
  if (!monitor) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }
  res.json(monitor);
});

router.patch("/:monitorId", (req, res) => {
  const monitorId = Number(req.params.monitorId);
  const parsed = monitorUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  if (parsed.data.profile_id != null && !profileRepo.get(parsed.data.profile_id)) {
    res.status(400).json({ detail: "关联的配置档不存在" });
    return;
  }

  const monitor = monitorRepo.update(monitorId, parsed.data);
  if (!monitor) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }

  monitorScheduler.unscheduleMonitor(monitor.id);
  if (monitor.enabled) {
    monitorScheduler.scheduleMonitor(monitor.id, monitor.interval_minutes);
  }
  res.json(monitor);
});

router.delete("/:monitorId", (req, res) => {
  const monitorId = Number(req.params.monitorId);
  if (!monitorRepo.get(monitorId)) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }

  monitorScheduler.unscheduleMonitor(monitorId);
  monitorRepo.delete(monitorId);
  res.status(204).send();
});

router.post("/:monitorId/preview", async (req, res) => {
  const monitorId = Number(req.params.monitorId);
  const monitor = monitorRepo.get(monitorId);
  if (!monitor) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }

  const result = await browserManager.previewPage({
    url: monitor.url,
    profile_id: monitor.profile_id,
    selector: monitor.selector,
    selector_type: monitor.selector_type,
    extract_mode: monitor.extract_mode,
    monitor_id: monitor.id,
  });

  res.json(
    previewToResponse({
      url: monitor.url,
      profileId: monitor.profile_id,
      profileName: resolveProfileName(monitor.profile_id),
      monitorId: monitor.id,
      result,
    }),
  );
});

router.post("/:monitorId/fetch", async (req, res) => {
  const monitorId = Number(req.params.monitorId);
  if (!monitorRepo.get(monitorId)) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }

  try {
    const snapshot = await runMonitor(monitorId);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/:monitorId/snapshots", (req, res) => {
  const monitorId = Number(req.params.monitorId);
  if (!monitorRepo.get(monitorId)) {
    res.status(404).json({ detail: "监控节点不存在" });
    return;
  }

  const limit = Number(req.query.limit ?? 20);
  res.json(snapshotRepo.listByMonitor(monitorId, limit));
});

export default router;

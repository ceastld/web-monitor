import { Router } from "express";
import { z } from "zod";

import { profileRepo } from "../db.js";
import { browserManager } from "../services/browser.js";

const router = Router();

const profileCreateSchema = z.object({
  name: z.string().min(1).max(120),
  site_domain: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  site_domain: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
});

const loginStartSchema = z.object({
  start_url: z.string().url().optional(),
  use_chrome_cdp: z.boolean().optional(),
});

const profileResolveSchema = z.object({
  url: z.string().url(),
});

function storageExists(profileId: number): boolean {
  return browserManager.profileHasStorage(profileId);
}

function parseSiteDomain(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

router.get("", (_req, res) => {
  res.json(profileRepo.list());
});

router.post("/resolve", (req, res) => {
  const parsed = profileResolveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  const siteDomain = parseSiteDomain(parsed.data.url);
  const existing = profileRepo.getBySiteDomain(siteDomain);
  if (existing) {
    res.json({
      profile: existing,
      created: false,
      has_storage: storageExists(existing.id),
      site_domain: siteDomain,
    });
    return;
  }

  const profile = profileRepo.create({
    name: siteDomain,
    site_domain: siteDomain,
    description: `自动创建于一键配置（${parsed.data.url}）`,
  });

  res.status(201).json({
    profile,
    created: true,
    has_storage: false,
    site_domain: siteDomain,
  });
});

router.post("", (req, res) => {
  const parsed = profileCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  if (profileRepo.getByName(parsed.data.name)) {
    res.status(400).json({ detail: "配置档名称已存在" });
    return;
  }

  const profile = profileRepo.create(parsed.data);
  res.status(201).json(profile);
});

router.get("/:profileId", (req, res) => {
  const profileId = Number(req.params.profileId);
  const profile = profileRepo.get(profileId);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }
  res.json(profile);
});

router.patch("/:profileId", (req, res) => {
  const profileId = Number(req.params.profileId);
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  const profile = profileRepo.update(profileId, parsed.data);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }
  res.json(profile);
});

router.delete("/:profileId", (req, res) => {
  const profileId = Number(req.params.profileId);
  if (!profileRepo.delete(profileId)) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }
  res.status(204).send();
});

router.post("/:profileId/login/start", async (req, res) => {
  const profileId = Number(req.params.profileId);
  const profile = profileRepo.get(profileId);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }

  const parsed = loginStartSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  const startUrl = parsed.data.start_url ?? `https://${profile.site_domain}`;

  browserManager.reconcileLoginSession(profileId);

  try {
    await browserManager.startLoginSession(
      profileId,
      startUrl,
      parsed.data.use_chrome_cdp ?? false,
    );
  } catch (error) {
    res.status(409).json({ detail: error instanceof Error ? error.message : String(error) });
    return;
  }

  profileRepo.updateLoginStatus(profileId, "logging_in");
  res.json({
    profile_id: profileId,
    status: "active",
    message: parsed.data.use_chrome_cdp
      ? `已在你的 Chrome 中打开 ${startUrl}，登录后点击「保存登录状态」`
      : `已打开浏览器窗口，请手动登录 ${profile.site_domain}，完成后点击「保存登录状态」`,
  });
});

router.post("/:profileId/import-chrome", async (req, res) => {
  const profileId = Number(req.params.profileId);
  const profile = profileRepo.get(profileId);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }

  try {
    const storagePath = await browserManager.importChromeLogin(profileId);
    const updated = profileRepo.updateLoginStatus(profileId, "logged_in", storagePath);
    res.json({
      profile: updated,
      message: `已从本机 Chrome 导入 ${profile.site_domain} 的登录环境`,
    });
  } catch (error) {
    res.status(400).json({ detail: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/:profileId/login/save", async (req, res) => {
  const profileId = Number(req.params.profileId);
  const profile = profileRepo.get(profileId);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }

  try {
    const storagePath = await browserManager.saveLoginSession(profileId);
    const updated = profileRepo.updateLoginStatus(profileId, "logged_in", storagePath);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ detail: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/:profileId/login/cancel", async (req, res) => {
  const profileId = Number(req.params.profileId);
  const profile = profileRepo.get(profileId);
  if (!profile) {
    res.status(404).json({ detail: "配置档不存在" });
    return;
  }

  await browserManager.cancelLoginSession(profileId);
  profileRepo.updateLoginStatus(
    profileId,
    storageExists(profileId) ? "logged_in" : "unknown",
  );

  res.json({
    profile_id: profileId,
    status: "cancelled",
    message: "已取消登录会话",
  });
});

export default router;

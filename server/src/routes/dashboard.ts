import { Router } from "express";

import { monitorRepo, profileRepo, snapshotRepo } from "../db.js";

const router = Router();

router.get("", (_req, res) => {
  const monitors = monitorRepo.list();
  const items = monitors.map((monitor) => {
    const profile =
      monitor.profile_id != null ? profileRepo.get(monitor.profile_id) ?? null : null;
    const latestSnapshot = snapshotRepo.getLatestByMonitor(monitor.id);
    return {
      monitor,
      profile_name: profile?.name ?? null,
      profile_login_status: profile?.login_status ?? null,
      latest_snapshot: latestSnapshot,
    };
  });
  res.json(items);
});

export default router;

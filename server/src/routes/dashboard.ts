import { Router } from "express";

import { monitorRepo, profileRepo, snapshotRepo } from "../db.js";

const router = Router();

router.get("", (_req, res) => {
  const monitors = monitorRepo.list();
  const items = monitors.map((monitor) => {
    const profileName =
      monitor.profile_id != null ? profileRepo.get(monitor.profile_id)?.name ?? null : null;
    const latestSnapshot = snapshotRepo.getLatestByMonitor(monitor.id);
    return {
      monitor,
      profile_name: profileName,
      latest_snapshot: latestSnapshot,
    };
  });
  res.json(items);
});

export default router;

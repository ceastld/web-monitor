import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import { settings } from "../config.js";

const router = Router();

router.get("/screenshots/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  if (safeName !== req.params.filename) {
    res.status(400).json({ detail: "非法文件名" });
    return;
  }

  const filePath = path.join(settings.screenshotsDir, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ detail: "截图不存在" });
    return;
  }

  res.sendFile(filePath);
});

export default router;

import { Router } from "express";

import { probeChromeCdp } from "../services/chrome-cdp.js";

const router = Router();

router.get("/chrome-cdp", async (_req, res) => {
  res.json(await probeChromeCdp());
});

router.get("/capabilities", async (_req, res) => {
  const chrome_cdp = await probeChromeCdp();
  res.json({
    chrome_cdp,
    interactive_browser: {
      runs_on_server: true,
      description:
        "选区、登录、一键添加会在运行后端的机器上打开浏览器窗口，远程访问前端时通常无法直接操作。",
    },
    remote_friendly: {
      dashboard: true,
      headless_fetch: true,
      manual_monitor_form: true,
      preview_draft: true,
    },
  });
});

export default router;

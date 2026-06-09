import fs from "node:fs";
import path from "node:path";

import cors from "cors";
import express from "express";

import { settings } from "./config.js";
import { checkpointAndCloseDb, initDb, monitorRepo, profileRepo } from "./db.js";
import dashboardRouter from "./routes/dashboard.js";
import filesRouter from "./routes/files.js";
import monitorsRouter from "./routes/monitors.js";
import profilesRouter from "./routes/profiles.js";
import systemRouter from "./routes/system.js";
import { browserManager } from "./services/browser.js";
import { monitorScheduler } from "./services/scheduler.js";

const app = express();

app.use(express.json());

if (settings.corsOrigins.length > 0) {
  app.use(cors({ origin: settings.corsOrigins, credentials: true }));
}

app.use("/api/system", systemRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/monitors", monitorsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/files", filesRouter);

const frontendDist = settings.frontendDist;
const assetsDir = path.join(frontendDist, "assets");

if (fs.existsSync(assetsDir)) {
  app.use("/assets", express.static(assetsDir));
}

app.get("/", (_req, res) => {
  const builtIndex = path.join(frontendDist, "index.html");
  if (fs.existsSync(builtIndex)) {
    res.sendFile(builtIndex);
    return;
  }
  res.status(503).json({ detail: "Frontend not built. Run: npm run build" });
});

app.get("*", (req, res) => {
  const fullPath = req.path.replace(/^\//, "");
  if (fullPath.startsWith("api/")) {
    res.status(404).json({ detail: "Not found" });
    return;
  }

  if (fs.existsSync(frontendDist)) {
    const candidate = path.join(frontendDist, fullPath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      res.sendFile(candidate);
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
    return;
  }

  res.status(404).json({ detail: "Not found" });
});

async function main(): Promise<void> {
  initDb();

  console.log(`[db] project root: ${settings.projectRoot}`);
  console.log(`[db] database: ${settings.dbPath}`);
  console.log(
    `[db] loaded ${profileRepo.list().length} profile(s), ${monitorRepo.list().length} monitor(s)`,
  );

  await browserManager.start();
  await monitorScheduler.start();

  const server = app.listen(settings.port, settings.host, () => {
    const port = settings.port;
    console.log(`${settings.appName} listening on http://localhost:${port}`);
    if (settings.host === "0.0.0.0") {
      console.log(`[server] LAN access enabled — use this machine's IP on port ${port}`);
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] shutting down (${signal})...`);

    monitorScheduler.shutdown();
    await browserManager.stop();
    checkpointAndCloseDb();

    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => void shutdown("SIGBREAK"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

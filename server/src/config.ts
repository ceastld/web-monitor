import { resolveDataPaths, resolveProjectRoot } from "./paths.js";

const projectRoot = resolveProjectRoot();
const dataPaths = resolveDataPaths(projectRoot);

export const settings = {
  appName: "Web Monitor",
  projectRoot,
  debug: process.env.DEBUG === "true",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8765),
  dataDir: dataPaths.dataDir,
  dbPath: dataPaths.dbPath,
  profilesDir: dataPaths.profilesDir,
  screenshotsDir: dataPaths.screenshotsDir,
  headless: process.env.HEADLESS !== "false",
  browserTimeoutMs: Number(process.env.BROWSER_TIMEOUT_MS ?? 30_000),
  previewTimeoutMs: Number(process.env.PREVIEW_TIMEOUT_MS ?? 20_000),
  previewSelectorTimeoutMs: Number(process.env.PREVIEW_SELECTOR_TIMEOUT_MS ?? 8_000),
  previewRenderWaitMs: Number(process.env.PREVIEW_RENDER_WAIT_MS ?? 1_000),
  browserKeepAlive: process.env.BROWSER_KEEP_ALIVE !== "false",
  defaultIntervalMinutes: Number(process.env.DEFAULT_INTERVAL_MINUTES ?? 15),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  frontendDist: dataPaths.frontendDist,
} as const;

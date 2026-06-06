import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  name?: string;
  workspaces?: string[];
}

/** Locate the web-monitor repository root regardless of dev (src) or prod (dist) cwd. */
export function resolveProjectRoot(): string {
  const envRoot = process.env.WEB_MONITOR_ROOT;
  if (envRoot) {
    return path.resolve(envRoot);
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
        if (pkg.name === "web-monitor") {
          return dir;
        }
      } catch {
        // ignore malformed package.json
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  // server/src or server/dist -> repository root is two levels up
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function resolveDataPaths(rootDir: string) {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(rootDir, process.env.DATA_DIR)
    : path.join(rootDir, "data");

  return {
    dataDir,
    dbPath: process.env.DB_PATH ? path.resolve(rootDir, process.env.DB_PATH) : path.join(dataDir, "web_monitor.db"),
    profilesDir: process.env.PROFILES_DIR
      ? path.resolve(rootDir, process.env.PROFILES_DIR)
      : path.join(dataDir, "profiles"),
    screenshotsDir: process.env.SCREENSHOTS_DIR
      ? path.resolve(rootDir, process.env.SCREENSHOTS_DIR)
      : path.join(dataDir, "screenshots"),
    frontendDist: path.join(rootDir, "frontend", "dist"),
  };
}

/** Copy an existing sqlite db from legacy locations into the canonical path. */
export function migrateLegacyDatabase(targetDbPath: string): void {
  if (fs.existsSync(targetDbPath)) {
    return;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.dirname(path.dirname(moduleDir));
  const legacyCandidates = [
    path.join(process.cwd(), "data", "web_monitor.db"),
    path.join(moduleDir, "..", "data", "web_monitor.db"),
    path.join(rootDir, "data", "web_monitor.db"),
  ];

  const seen = new Set<string>();
  for (const legacyPath of legacyCandidates) {
    const resolved = path.resolve(legacyPath);
    if (seen.has(resolved) || resolved === path.resolve(targetDbPath)) {
      continue;
    }
    seen.add(resolved);

    if (!fs.existsSync(resolved)) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
    fs.copyFileSync(resolved, targetDbPath);

    for (const suffix of ["-wal", "-shm"]) {
      const legacySidecar = `${resolved}${suffix}`;
      if (fs.existsSync(legacySidecar)) {
        fs.copyFileSync(legacySidecar, `${targetDbPath}${suffix}`);
      }
    }

    console.log(`[db] migrated legacy database from ${resolved}`);
    return;
  }
}

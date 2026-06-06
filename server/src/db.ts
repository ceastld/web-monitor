import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { settings } from "./config.js";
import { migrateLegacyDatabase } from "./paths.js";
import type { Monitor, Profile, Snapshot } from "./types.js";

let db: Database.Database | null = null;

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as number,
    name: row.name as string,
    site_domain: row.site_domain as string,
    description: row.description as string | null,
    storage_state_path: row.storage_state_path as string | null,
    login_status: row.login_status as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToMonitor(row: Record<string, unknown>): Monitor {
  return {
    id: row.id as number,
    name: row.name as string,
    url: row.url as string,
    selector: row.selector as string,
    selector_type: row.selector_type as string,
    extract_mode: row.extract_mode as string,
    profile_id: row.profile_id as number | null,
    interval_minutes: row.interval_minutes as number,
    enabled: Boolean(row.enabled),
    last_fetched_at: row.last_fetched_at as string | null,
    last_status: row.last_status as string | null,
    created_at: row.created_at as string,
  };
}

function rowToSnapshot(row: Record<string, unknown>): Snapshot {
  return {
    id: row.id as number,
    monitor_id: row.monitor_id as number,
    content: row.content as string | null,
    content_hash: row.content_hash as string | null,
    screenshot_path: row.screenshot_path as string | null,
    status: row.status as string,
    error_message: row.error_message as string | null,
    changed: Boolean(row.changed),
    fetched_at: row.fetched_at as string,
  };
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

function checkpointDb(mode: "PASSIVE" | "FULL" | "TRUNCATE" = "PASSIVE"): void {
  if (!db) return;
  try {
    db.pragma(`wal_checkpoint(${mode})`);
  } catch (error) {
    console.warn("[db] wal_checkpoint failed:", error);
  }
}

export function initDb(): void {
  fs.mkdirSync(settings.dataDir, { recursive: true });
  fs.mkdirSync(settings.profilesDir, { recursive: true });
  fs.mkdirSync(settings.screenshotsDir, { recursive: true });

  migrateLegacyDatabase(settings.dbPath);

  db = new Database(settings.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  checkpointDb("PASSIVE");

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      site_domain TEXT NOT NULL,
      description TEXT,
      storage_state_path TEXT,
      login_status TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      selector TEXT NOT NULL,
      selector_type TEXT NOT NULL DEFAULT 'css',
      extract_mode TEXT NOT NULL DEFAULT 'text',
      profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      content TEXT,
      content_hash TEXT,
      screenshot_path TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      changed INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_monitor_id ON snapshots(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_fetched_at ON snapshots(fetched_at);
  `);
}

export function checkpointAndCloseDb(): void {
  checkpointDb("TRUNCATE");
  db?.close();
  db = null;
}

export function closeDb(): void {
  checkpointAndCloseDb();
}

export const profileRepo = {
  list(): Profile[] {
    const rows = getDb().prepare("SELECT * FROM profiles ORDER BY id DESC").all();
    return rows.map((row) => rowToProfile(row as Record<string, unknown>));
  },

  get(id: number): Profile | null {
    const row = getDb().prepare("SELECT * FROM profiles WHERE id = ?").get(id);
    return row ? rowToProfile(row as Record<string, unknown>) : null;
  },

  getByName(name: string): Profile | null {
    const row = getDb().prepare("SELECT * FROM profiles WHERE name = ?").get(name);
    return row ? rowToProfile(row as Record<string, unknown>) : null;
  },

  create(data: { name: string; site_domain: string; description?: string | null }): Profile {
    const result = getDb()
      .prepare(
        `INSERT INTO profiles (name, site_domain, description, login_status)
         VALUES (?, ?, ?, 'unknown')`,
      )
      .run(data.name, data.site_domain, data.description ?? null);
    return profileRepo.get(result.lastInsertRowid as number)!;
  },

  update(
    id: number,
    data: Partial<{ name: string; site_domain: string; description: string | null }>,
  ): Profile | null {
    const existing = profileRepo.get(id);
    if (!existing) return null;

    getDb()
      .prepare(
        `UPDATE profiles
         SET name = ?, site_domain = ?, description = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        data.name ?? existing.name,
        data.site_domain ?? existing.site_domain,
        data.description !== undefined ? data.description : existing.description,
        id,
      );
    return profileRepo.get(id);
  },

  updateLoginStatus(id: number, loginStatus: string, storageStatePath?: string | null): Profile | null {
    if (storageStatePath !== undefined) {
      getDb()
        .prepare(
          `UPDATE profiles
           SET login_status = ?, storage_state_path = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(loginStatus, storageStatePath, id);
    } else {
      getDb()
        .prepare(
          `UPDATE profiles SET login_status = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(loginStatus, id);
    }
    return profileRepo.get(id);
  },

  delete(id: number): boolean {
    const result = getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
    if (result.changes > 0) {
      const profileDir = path.join(settings.profilesDir, String(id));
      if (fs.existsSync(profileDir)) {
        for (const item of fs.readdirSync(profileDir)) {
          fs.unlinkSync(path.join(profileDir, item));
        }
        fs.rmdirSync(profileDir);
      }
      return true;
    }
    return false;
  },
};

export const monitorRepo = {
  list(): Monitor[] {
    const rows = getDb().prepare("SELECT * FROM monitors ORDER BY id DESC").all();
    return rows.map((row) => rowToMonitor(row as Record<string, unknown>));
  },

  listEnabled(): Monitor[] {
    const rows = getDb().prepare("SELECT * FROM monitors WHERE enabled = 1").all();
    return rows.map((row) => rowToMonitor(row as Record<string, unknown>));
  },

  get(id: number): Monitor | null {
    const row = getDb().prepare("SELECT * FROM monitors WHERE id = ?").get(id);
    return row ? rowToMonitor(row as Record<string, unknown>) : null;
  },

  create(data: {
    name: string;
    url: string;
    selector: string;
    selector_type?: string;
    extract_mode?: string;
    profile_id?: number | null;
    interval_minutes?: number;
    enabled?: boolean;
  }): Monitor {
    const result = getDb()
      .prepare(
        `INSERT INTO monitors
         (name, url, selector, selector_type, extract_mode, profile_id, interval_minutes, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.url,
        data.selector,
        data.selector_type ?? "css",
        data.extract_mode ?? "text",
        data.profile_id ?? null,
        data.interval_minutes ?? settings.defaultIntervalMinutes,
        data.enabled !== false ? 1 : 0,
      );
    return monitorRepo.get(result.lastInsertRowid as number)!;
  },

  update(
    id: number,
    data: Partial<{
      name: string;
      url: string;
      selector: string;
      selector_type: string;
      extract_mode: string;
      profile_id: number | null;
      interval_minutes: number;
      enabled: boolean;
    }>,
  ): Monitor | null {
    const existing = monitorRepo.get(id);
    if (!existing) return null;

    getDb()
      .prepare(
        `UPDATE monitors SET
          name = ?, url = ?, selector = ?, selector_type = ?, extract_mode = ?,
          profile_id = ?, interval_minutes = ?, enabled = ?
         WHERE id = ?`,
      )
      .run(
        data.name ?? existing.name,
        data.url ?? existing.url,
        data.selector ?? existing.selector,
        data.selector_type ?? existing.selector_type,
        data.extract_mode ?? existing.extract_mode,
        data.profile_id !== undefined ? data.profile_id : existing.profile_id,
        data.interval_minutes ?? existing.interval_minutes,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
        id,
      );
    return monitorRepo.get(id);
  },

  updateLastFetch(id: number, fetchedAt: string, status: string): void {
    getDb()
      .prepare("UPDATE monitors SET last_fetched_at = ?, last_status = ? WHERE id = ?")
      .run(fetchedAt, status, id);
  },

  delete(id: number): boolean {
    const result = getDb().prepare("DELETE FROM monitors WHERE id = ?").run(id);
    return result.changes > 0;
  },
};

export const snapshotRepo = {
  listByMonitor(monitorId: number, limit: number): Snapshot[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM snapshots
         WHERE monitor_id = ?
         ORDER BY fetched_at DESC
         LIMIT ?`,
      )
      .all(monitorId, Math.min(limit, 100));
    return rows.map((row) => rowToSnapshot(row as Record<string, unknown>));
  },

  getLatestByMonitor(monitorId: number): Snapshot | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM snapshots
         WHERE monitor_id = ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get(monitorId);
    return row ? rowToSnapshot(row as Record<string, unknown>) : null;
  },

  getLatestSuccess(monitorId: number): Snapshot | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM snapshots
         WHERE monitor_id = ? AND status = 'success'
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get(monitorId);
    return row ? rowToSnapshot(row as Record<string, unknown>) : null;
  },

  create(data: {
    monitor_id: number;
    content: string | null;
    content_hash: string | null;
    screenshot_path: string | null;
    status: string;
    error_message: string | null;
    changed: boolean;
    fetched_at: string;
  }): Snapshot {
    const result = getDb()
      .prepare(
        `INSERT INTO snapshots
         (monitor_id, content, content_hash, screenshot_path, status, error_message, changed, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.monitor_id,
        data.content,
        data.content_hash,
        data.screenshot_path,
        data.status,
        data.error_message,
        data.changed ? 1 : 0,
        data.fetched_at,
      );
    const row = getDb().prepare("SELECT * FROM snapshots WHERE id = ?").get(result.lastInsertRowid);
    return rowToSnapshot(row as Record<string, unknown>);
  },
};

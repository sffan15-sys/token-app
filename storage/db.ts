/**
 * Shared local storage layer for all platform collectors.
 *
 * Single SQLite file (data/token-app.db, gitignored) with two tables:
 *
 *   usage_records  - normalized usage/cost/rate-limit datapoints, one row
 *                     per (platform, metric, window) reading. This is the
 *                     common schema every collector writes into, so a
 *                     future backend/API layer can query across platforms
 *                     without knowing platform-specific shapes.
 *
 *   collector_errors - defensive record of collector runs that saw an
 *                     unexpected/missing shape (e.g. Claude's undocumented
 *                     statusline JSON changing) or a hard failure (e.g.
 *                     Vercel 403 plan mismatch). Written instead of
 *                     crashing or silently dropping data, per SPECS.md.
 *
 * Implementation note: originally built against better-sqlite3, but that
 * package requires a native build (node-gyp + Python) and this machine had
 * no usable Python interpreter for node-gyp, so the install failed. Node
 * 22.5+ ships a built-in `node:sqlite` module (DatabaseSync) that needs no
 * native compilation - swapped to that instead. Same on-disk SQLite file,
 * same schema; only the driver differs. `node:sqlite` is still
 * experimental as of Node 24 (stability: 1.1) but is synchronous and
 * dependency-free, which fits this single-user local CLI use case well.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Data directory is overridable via DATA_DIR so multiple fully-isolated
 * instances of this app (e.g. one per user) can run from the same checkout
 * with zero shared state - each instance just points at its own directory.
 * See README.md "Running a second, isolated instance" for the multi-user
 * setup this exists for.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "token-app.db");

export interface UsageRecord {
  /** Platform identifier, e.g. "vercel", "claude". */
  platform: string;
  /** ISO 8601 timestamp marking the start of the measurement window. */
  window_start: string;
  /** ISO 8601 timestamp marking the end of the measurement window. */
  window_end: string;
  /** Metric name, e.g. "cost", "five_hour_used_percentage". */
  metric: string;
  /** Numeric value of the metric. */
  value: number;
  /** Unit for the value, e.g. "usd", "percent". */
  unit: string;
  /** ISO 8601 timestamp of when the collector fetched/wrote this record. */
  fetched_at: string;
  /** Optional source-reported subscription plan identifier.
   *
   * This is deliberately source data, not a user-entered guess. It is
   * currently populated by the Codex collector from wham/usage.plan_type.
   */
  plan_type?: string | null;
  /** Optional raw source payload (JSON string) for debugging/audit. */
  raw?: string | null;
}

export interface CollectorError {
  platform: string;
  /** ISO 8601 timestamp. */
  occurred_at: string;
  /** Short machine-friendly reason, e.g. "missing_field", "http_403". */
  kind: string;
  message: string;
  /** Optional raw payload/context (JSON string) for debugging. */
  raw?: string | null;
}

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      plan_type TEXT,
      raw TEXT,
      UNIQUE(platform, metric, window_start, window_end) ON CONFLICT REPLACE
    );
    CREATE INDEX IF NOT EXISTS idx_usage_records_platform_time
      ON usage_records(platform, window_start);

    CREATE TABLE IF NOT EXISTS collector_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      raw TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_collector_errors_platform_time
      ON collector_errors(platform, occurred_at);
  `);

  // Additive migration for databases created before source-reported plan
  // metadata was promoted out of the raw JSON blob.
  const planTypeColumn = db
    .prepare("SELECT name FROM pragma_table_info('usage_records') WHERE name = 'plan_type'")
    .get();
  if (!planTypeColumn) {
    db.exec("ALTER TABLE usage_records ADD COLUMN plan_type TEXT;");
  }

  // Existing Codex rows already retained the real wham response in `raw`.
  // Backfill them once so the UI can derive the current plan price without
  // waiting for the next successful collector poll.
  db.exec(`
    UPDATE usage_records
    SET plan_type = lower(json_extract(raw, '$.plan_type'))
    WHERE platform = 'codex'
      AND plan_type IS NULL
      AND raw IS NOT NULL
      AND json_valid(raw)
      AND typeof(json_extract(raw, '$.plan_type')) = 'text';
  `);
  return db;
}

export function insertUsageRecords(records: UsageRecord[]): number {
  if (records.length === 0) return 0;
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO usage_records
      (platform, window_start, window_end, metric, value, unit, fetched_at, plan_type, raw)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("BEGIN");
  try {
    for (const r of records) {
      stmt.run(
        r.platform,
        r.window_start,
        r.window_end,
        r.metric,
        r.value,
        r.unit,
        r.fetched_at,
        r.plan_type ?? null,
        r.raw ?? null
      );
    }
    database.exec("COMMIT");
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
  return records.length;
}

export function insertCollectorError(err: CollectorError): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO collector_errors (platform, occurred_at, kind, message, raw)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(err.platform, err.occurred_at, err.kind, err.message, err.raw ?? null);
}

/**
 * Local REST API for the frontend, backed directly by storage/db.ts's
 * SQLite tables. Single-user personal tool — no auth, no multi-tenancy,
 * runs on localhost only. Response shapes deliberately mirror
 * frontend/src/types.ts's UsageRecord so the frontend's existing
 * selectors (lib/selectors.ts, lib/status.ts) work unchanged against
 * real data.
 */

import cors from "cors";
import express, { type Request, type Response } from "express";
import { getDb, insertUsageRecords, type UsageRecord } from "../storage/db.js";
import { applyConfigToEnv, configStatus, writeConfig, type LocalConfig } from "./config.js";

interface UsageRow {
  id: number;
  platform: string;
  window_start: string;
  window_end: string;
  metric: string;
  value: number;
  unit: string;
  fetched_at: string;
  plan_type: string | null;
  raw: string | null;
}

interface ErrorRow {
  id: number;
  platform: string;
  occurred_at: string;
  kind: string;
  message: string;
  raw: string | null;
}

/** Pull an optional businessTag back out of the `raw` JSON blob manual-log writes there. */
function rowToUsageRecord(row: UsageRow): UsageRecord & { businessTag?: string | null } {
  let businessTag: string | null | undefined;
  if (row.raw) {
    try {
      const parsed = JSON.parse(row.raw);
      if (parsed && typeof parsed.businessTag === "string") businessTag = parsed.businessTag;
    } catch {
      // raw isn't JSON (or isn't ours) — fine, just no businessTag.
    }
  }
  return {
    platform: row.platform,
    window_start: row.window_start,
    window_end: row.window_end,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    fetched_at: row.fetched_at,
    plan_type: row.plan_type,
    raw: row.raw,
    ...(businessTag !== undefined ? { businessTag } : {}),
  };
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GET /api/usage — latest reading per (platform, metric).
  app.get("/api/usage", (_req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT u.* FROM usage_records u
         INNER JOIN (
           SELECT platform, metric, MAX(fetched_at) AS max_fetched_at
           FROM usage_records
           GROUP BY platform, metric
         ) latest
         ON u.platform = latest.platform AND u.metric = latest.metric AND u.fetched_at = latest.max_fetched_at
         ORDER BY u.platform, u.metric`
      )
      .all() as unknown as UsageRow[];
    res.json({ records: rows.map(rowToUsageRecord) });
  });

  // GET /api/usage/:platform — full history for one platform (capped, most recent first on the wire
  // but returned time-ascending since that's what the chart/selector code expects).
  app.get("/api/usage/:platform", (req: Request, res: Response) => {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 2000, 5000);
    const rows = db
      .prepare(
        `SELECT * FROM usage_records WHERE platform = ? ORDER BY fetched_at DESC LIMIT ?`
      )
      .all(req.params.platform, limit) as unknown as UsageRow[];
    rows.reverse();
    res.json({ records: rows.map(rowToUsageRecord) });
  });

  // GET /api/errors — recent collector_errors, so the frontend can show real stale/broken status.
  app.get("/api/errors", (req: Request, res: Response) => {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = db
      .prepare(`SELECT * FROM collector_errors ORDER BY occurred_at DESC LIMIT ?`)
      .all(limit) as unknown as ErrorRow[];
    res.json({ errors: rows });
  });

  // POST /api/manual-log — generic endpoint retained for platforms that may legitimately need
  // manual capture in the future. Gemini and Cursor intentionally have no manual-log UI/path.
  // Accepts platform, value (0-100 %), and optional businessTag. Stores a UsageRecord with
  // metric "manual_used_percentage" so
  // selectors.ts's snapshotForWindow (which expects `${window.key}_used_percentage`) can find it
  // when the platform's window key is "manual"/"session"/etc — see README for the mapping note.
  app.post("/api/manual-log", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const platform = typeof body.platform === "string" ? body.platform.trim() : "";
    const value = Number(body.value);
    const metric = typeof body.metric === "string" && body.metric ? body.metric : "manual_used_percentage";
    const unit = typeof body.unit === "string" && body.unit ? body.unit : "percent";
    const businessTag = typeof body.businessTag === "string" && body.businessTag.trim() ? body.businessTag.trim() : undefined;

    if (platform === "gemini" || platform === "cursor") {
      res.status(400).json({
        error: `${platform} does not allow manual usage logs; use its real API collector or unavailable state`,
      });
      return;
    }

    if (!platform || Number.isNaN(value)) {
      res.status(400).json({ error: "platform (string) and value (number) are required" });
      return;
    }

    const now = new Date();
    const fetchedAt = now.toISOString();
    // Manual logs are point-in-time glances at an in-app banner, not a metered window with a
    // real start/end — mirror mockData.ts's manual-entry convention of a symmetric ±2.5h window
    // around the reading so the "resets in" UI has something plausible to show.
    const windowStart = typeof body.window_start === "string" ? body.window_start : new Date(now.getTime() - 2.5 * 3600_000).toISOString();
    const windowEnd = typeof body.window_end === "string" ? body.window_end : new Date(now.getTime() + 2.5 * 3600_000).toISOString();

    const record: UsageRecord = {
      platform,
      window_start: windowStart,
      window_end: windowEnd,
      metric,
      value,
      unit,
      fetched_at: fetchedAt,
      plan_type: null,
      raw: JSON.stringify({ source: "manual", ...(businessTag ? { businessTag } : {}) }),
    };
    insertUsageRecords([record]);
    res.status(201).json({
      record: rowToUsageRecord({
        ...record,
        id: 0,
        plan_type: record.plan_type ?? null,
        raw: record.raw ?? null,
      }),
    });
  });

  // GET /api/config — which keys are currently set (booleans only — never returns values).
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({ status: configStatus() });
  });

  // POST /api/config — persist API keys/tokens to the local git-ignored config file, and apply
  // them to this process's env immediately so a scheduler run right after saving picks them up.
  app.post("/api/config", (req: Request, res: Response) => {
    const body: LocalConfig = req.body ?? {};
    writeConfig(body);
    applyConfigToEnv();
    res.json({ status: configStatus() });
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  return app;
}

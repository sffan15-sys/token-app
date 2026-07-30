/**
 * Express API shared by the hosted Vercel Function and the local companion
 * process. Hosted requests use Postgres; the local process exists for the
 * Settings UI and interval scheduler, not as the production data store.
 */

import crypto from "node:crypto";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  insertCollectorError,
  insertUsageRecords,
  latestUsageRecords,
  platformUsageRecords,
  recentCollectorErrors,
  type CollectorError,
  type UsageRecord,
  type UsageRow,
} from "../storage/db.js";
import {
  applyConfigToEnv,
  configStatus,
  planSelections,
  writeConfig,
  type LocalConfig,
  type PlanSelections,
} from "./config.js";

const HOSTED = process.env.VERCEL === "1";
const MAX_INGEST_ITEMS = 500;

/** Pull an optional businessTag back out of the `raw` JSON blob manual-log writes there. */
function rowToUsageRecord(row: UsageRow): UsageRecord & { businessTag?: string | null } {
  let businessTag: string | null | undefined;
  if (row.raw) {
    try {
      const parsed = JSON.parse(row.raw);
      if (parsed && typeof parsed.businessTag === "string") businessTag = parsed.businessTag;
    } catch {
      // raw is optional debugging context and is not guaranteed to be JSON.
    }
  }
  return {
    platform: row.platform,
    window_start: row.window_start,
    window_end: row.window_end,
    metric: row.metric,
    value: Number(row.value),
    unit: row.unit,
    fetched_at: row.fetched_at,
    plan_type: row.plan_type,
    raw: row.raw,
    ...(businessTag !== undefined ? { businessTag } : {}),
  };
}

function secretMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function requireWriteSecret(req: Request, res: Response, next: NextFunction): void {
  // Local Settings/manual-log traffic stays on loopback. The public hosted
  // surface always requires a configured secret.
  if (!HOSTED) {
    next();
    return;
  }
  const expected = process.env.TOKEN_APP_WRITE_SECRET;
  if (!expected) {
    res.status(503).json({ error: "Hosted write secret is not configured." });
    return;
  }
  const supplied = req.get("X-Token-App-Secret");
  if (!secretMatches(supplied, expected)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  next();
}

function isNonEmptyString(value: unknown, maxLength = 20_000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value, 100) && Number.isFinite(Date.parse(value));
}

function isUsageRecord(value: unknown): value is UsageRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.platform, 100) &&
    isIsoDate(record.window_start) &&
    isIsoDate(record.window_end) &&
    isNonEmptyString(record.metric, 300) &&
    typeof record.value === "number" &&
    Number.isFinite(record.value) &&
    isNonEmptyString(record.unit, 100) &&
    isIsoDate(record.fetched_at) &&
    (record.plan_type == null || isNonEmptyString(record.plan_type, 100)) &&
    (record.raw == null || isNonEmptyString(record.raw, 250_000))
  );
}

function isCollectorError(value: unknown): value is CollectorError {
  if (!value || typeof value !== "object") return false;
  const error = value as Record<string, unknown>;
  return (
    isNonEmptyString(error.platform, 100) &&
    isIsoDate(error.occurred_at) &&
    isNonEmptyString(error.kind, 100) &&
    isNonEmptyString(error.message, 20_000) &&
    (error.raw == null || isNonEmptyString(error.raw, 250_000))
  );
}

function hostedPlans(): PlanSelections {
  const selections: PlanSelections = {};
  const entries = [
    ["claude", "CLAUDE_PLAN"],
    ["codex", "CODEX_PLAN"],
    ["gemini", "GEMINI_PLAN"],
    ["vercel", "VERCEL_PLAN"],
    ["cursor", "CURSOR_PLAN"],
  ] as const;
  for (const [platform, envKey] of entries) {
    const value = process.env[envKey]?.trim();
    if (value) selections[platform] = value;
  }
  return selections;
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Latest reading per (platform, metric).
  app.get("/api/usage", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await latestUsageRecords();
      res.json({ records: rows.map(rowToUsageRecord) });
    } catch (error) {
      next(error);
    }
  });

  // Full history for one platform, returned time-ascending for the charts.
  app.get(
    "/api/usage/:platform",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 2000, 1), 5000);
        const rows = await platformUsageRecords(req.params.platform, limit);
        res.json({ records: rows.map(rowToUsageRecord) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/errors", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
      res.json({ errors: await recentCollectorErrors(limit) });
    } catch (error) {
      next(error);
    }
  });

  // Local collectors send normalized records/errors here. This is the only
  // collector-facing database write path.
  app.post(
    "/api/ingest",
    requireWriteSecret,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const records = Array.isArray(req.body?.records) ? req.body.records : [];
        const errors = Array.isArray(req.body?.errors) ? req.body.errors : [];
        if (records.length + errors.length === 0) {
          res.status(400).json({ error: "At least one record or error is required." });
          return;
        }
        if (records.length + errors.length > MAX_INGEST_ITEMS) {
          res.status(413).json({ error: `At most ${MAX_INGEST_ITEMS} items may be ingested at once.` });
          return;
        }
        if (!records.every(isUsageRecord) || !errors.every(isCollectorError)) {
          res.status(400).json({ error: "One or more ingest items have an invalid shape." });
          return;
        }
        const recordsWritten = await insertUsageRecords(records);
        for (const error of errors) await insertCollectorError(error);
        res.status(201).json({ recordsWritten, errorsWritten: errors.length });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/manual-log",
    requireWriteSecret,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body ?? {};
        const platform = typeof body.platform === "string" ? body.platform.trim() : "";
        const value = Number(body.value);
        const metric =
          typeof body.metric === "string" && body.metric
            ? body.metric
            : "manual_used_percentage";
        const unit =
          typeof body.unit === "string" && body.unit ? body.unit : "percent";
        const businessTag =
          typeof body.businessTag === "string" && body.businessTag.trim()
            ? body.businessTag.trim()
            : undefined;

        if (platform === "gemini" || platform === "cursor") {
          res.status(400).json({
            error: `${platform} does not allow manual usage logs; use its real API collector or unavailable state`,
          });
          return;
        }
        if (!platform || !Number.isFinite(value)) {
          res.status(400).json({ error: "platform (string) and value (number) are required" });
          return;
        }

        const now = new Date();
        const fetchedAt = now.toISOString();
        const record: UsageRecord = {
          platform,
          window_start:
            typeof body.window_start === "string"
              ? body.window_start
              : new Date(now.getTime() - 2.5 * 3_600_000).toISOString(),
          window_end:
            typeof body.window_end === "string"
              ? body.window_end
              : new Date(now.getTime() + 2.5 * 3_600_000).toISOString(),
          metric,
          value,
          unit,
          fetched_at: fetchedAt,
          plan_type: null,
          raw: JSON.stringify({
            source: "manual",
            ...(businessTag ? { businessTag } : {}),
          }),
        };
        await insertUsageRecords([record]);
        res.status(201).json({
          record: rowToUsageRecord({
            ...record,
            id: 0,
            plan_type: record.plan_type ?? null,
            raw: record.raw ?? null,
          }),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Hosted instances expose no local credential-file state. Non-secret plan
  // selections may be supplied as Vercel environment variables.
  app.get("/api/config", (_req: Request, res: Response) => {
    if (HOSTED) {
      res.json({
        mode: "hosted",
        status: Object.fromEntries(
          Object.keys(configStatus()).map((key) => [key, false])
        ),
        plans: hostedPlans(),
      });
      return;
    }
    res.json({
      mode: "local",
      status: configStatus(),
      plans: planSelections(),
    });
  });

  app.post(
    "/api/config",
    requireWriteSecret,
    (req: Request, res: Response) => {
      if (HOSTED) {
        res.status(409).json({
          error:
            "Collector credentials are local-only. Save them through the local companion Settings UI.",
        });
        return;
      }
      const body: LocalConfig = req.body ?? {};
      writeConfig(body);
      applyConfigToEnv();
      res.json({
        mode: "local",
        status: configStatus(),
        plans: planSelections(),
      });
    }
  );

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, mode: HOSTED ? "hosted" : "local", time: new Date().toISOString() });
  });

  // Direct visits to React Router paths should land on the CDN-served SPA.
  // Vercel serves public/index.html before invoking Express for "/".
  app.get(/^\/(?!api(?:\/|$)).*/, (_req: Request, res: Response) => {
    res.redirect(302, "/");
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api] ${message}`);
    res.status(500).json({ error: "Internal server error." });
  };
  app.use(errorHandler);

  return app;
}

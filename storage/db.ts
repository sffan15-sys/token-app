/**
 * Hosted Postgres storage layer.
 *
 * Vercel Postgres was retired in favor of Marketplace providers. The app
 * uses Neon's serverless driver against DATABASE_URL (the variable injected
 * by the Vercel Neon integration), while accepting POSTGRES_URL as a
 * compatibility fallback.
 *
 * This module is used only by the hosted/local API. Local collectors write
 * through collectors/ingest.ts instead, because they have no reason to hold
 * a database credential.
 */

import { neon } from "@neondatabase/serverless";
import type { CollectorError, UsageRecord } from "./types.js";

export type { CollectorError, UsageRecord } from "./types.js";

export interface UsageRow extends UsageRecord {
  id: number;
  plan_type: string | null;
  raw: string | null;
}

export interface ErrorRow extends CollectorError {
  id: number;
  raw: string | null;
}

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaPromise: Promise<void> | undefined;

function connectionString(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "No Postgres connection string is configured. Connect the Vercel Neon integration " +
        "so DATABASE_URL is injected (POSTGRES_URL is also accepted)."
    );
  }
  return value;
}

export function getDb(): ReturnType<typeof neon> {
  if (!sqlClient) sqlClient = neon(connectionString());
  return sqlClient;
}

/** Idempotent boot-time migration, cached for each warm serverless instance. */
export function initializeDatabase(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS usage_records (
          id BIGSERIAL PRIMARY KEY,
          platform TEXT NOT NULL,
          window_start TEXT NOT NULL,
          window_end TEXT NOT NULL,
          metric TEXT NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          unit TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          plan_type TEXT,
          raw TEXT,
          UNIQUE(platform, metric, window_start, window_end)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_usage_records_platform_time
          ON usage_records(platform, window_start)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS collector_errors (
          id BIGSERIAL PRIMARY KEY,
          platform TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          raw TEXT
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_collector_errors_platform_time
          ON collector_errors(platform, occurred_at)
      `;
    })().catch((error) => {
      // Permit a later invocation to retry a transient migration failure.
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function insertUsageRecords(records: UsageRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  await initializeDatabase();
  const sql = getDb();
  const normalized = records.map((record) => ({
    ...record,
    plan_type: record.plan_type ?? null,
    raw: record.raw ?? null,
  }));

  await sql`
    INSERT INTO usage_records
      (platform, window_start, window_end, metric, value, unit, fetched_at, plan_type, raw)
    SELECT
      record.platform,
      record.window_start,
      record.window_end,
      record.metric,
      record.value,
      record.unit,
      record.fetched_at,
      record.plan_type,
      record.raw
    FROM jsonb_to_recordset(${JSON.stringify(normalized)}::jsonb) AS record(
      platform TEXT,
      window_start TEXT,
      window_end TEXT,
      metric TEXT,
      value DOUBLE PRECISION,
      unit TEXT,
      fetched_at TEXT,
      plan_type TEXT,
      raw TEXT
    )
    ON CONFLICT (platform, metric, window_start, window_end) DO UPDATE SET
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      fetched_at = EXCLUDED.fetched_at,
      plan_type = EXCLUDED.plan_type,
      raw = EXCLUDED.raw
  `;
  return records.length;
}

export async function insertCollectorError(error: CollectorError): Promise<void> {
  await initializeDatabase();
  const sql = getDb();
  await sql`
    INSERT INTO collector_errors (platform, occurred_at, kind, message, raw)
    VALUES (
      ${error.platform},
      ${error.occurred_at},
      ${error.kind},
      ${error.message},
      ${error.raw ?? null}
    )
  `;
}

export async function latestUsageRecords(): Promise<UsageRow[]> {
  await initializeDatabase();
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT ON (platform, metric)
      id::int AS id,
      platform,
      window_start,
      window_end,
      metric,
      value,
      unit,
      fetched_at,
      plan_type,
      raw
    FROM usage_records
    ORDER BY platform, metric, fetched_at DESC, id DESC
  `;
  return rows as unknown as UsageRow[];
}

export async function platformUsageRecords(
  platform: string,
  limit: number
): Promise<UsageRow[]> {
  await initializeDatabase();
  const sql = getDb();
  const rows = await sql`
    SELECT
      id::int AS id,
      platform,
      window_start,
      window_end,
      metric,
      value,
      unit,
      fetched_at,
      plan_type,
      raw
    FROM usage_records
    WHERE platform = ${platform}
    ORDER BY fetched_at DESC, id DESC
    LIMIT ${limit}
  `;
  return (rows as unknown as UsageRow[]).reverse();
}

export async function recentCollectorErrors(limit: number): Promise<ErrorRow[]> {
  await initializeDatabase();
  const sql = getDb();
  const rows = await sql`
    SELECT
      id::int AS id,
      platform,
      occurred_at,
      kind,
      message,
      raw
    FROM collector_errors
    ORDER BY occurred_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ErrorRow[];
}

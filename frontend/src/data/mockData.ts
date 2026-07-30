/**
 * Mock data layer.
 *
 * `PLATFORMS` below is real, static UI metadata (labels/colors/window
 * shapes) — it is NOT mock telemetry and is
 * still imported by the running app (components, Settings, etc).
 *
 * `MOCK_USAGE_RECORDS` / `MOCK_ALERTS` ARE mock telemetry. As of the
 * backend/API work (server/, frontend/src/lib/api.ts), the running app no
 * longer displays these — Home/Alerts/PlatformDetail fetch real data from
 * the local API server instead. This module (and its two mock exports) is
 * kept only for local dev/testing without a live server/DB running (e.g.
 * component work in isolation) — shaped exactly like storage/db.ts's
 * UsageRecord so it stayed a drop-in stand-in while the real pipeline was
 * being built. Gemini and Cursor intentionally have no fabricated telemetry:
 * Gemini is fed by its Cloud Monitoring collector, while Cursor is listed as
 * unavailable because individual plans expose no usage API.
 */
import type { Alert, PlatformMeta, UsageRecord } from "../types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const PLATFORMS: PlatformMeta[] = [
  {
    id: "claude",
    label: "Claude",
    tier: "official",
    dataMode: "window",
    color: "orange",
    windows: [
      { key: "five_hour", label: "5-hour", durationMs: 5 * HOUR },
      { key: "seven_day", label: "7-day", durationMs: 7 * DAY },
    ],
  },
  {
    id: "codex",
    label: "ChatGPT / Codex",
    tier: "official",
    dataMode: "window",
    color: "aqua",
    windows: [
      { key: "five_hour", label: "5-hour", durationMs: 5 * HOUR },
      { key: "weekly", label: "Weekly", durationMs: 7 * DAY },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    tier: "official",
    dataMode: "quota",
    color: "blue",
    windows: [],
    connectionNote: "API quota data via Google Cloud Monitoring",
  },
  {
    id: "vercel",
    label: "Vercel",
    tier: "official",
    dataMode: "pool",
    color: "violet",
    windows: [{ key: "billing_period", label: "Billing period", durationMs: 30 * DAY }],
  },
  {
    id: "cursor",
    label: "Cursor",
    tier: "unavailable",
    dataMode: "unavailable",
    color: "aqua",
    windows: [],
    connectionNote: "Not connected — no API available on individual plans",
  },
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Deterministic pseudo-random so mock data is stable across reloads. */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = Date.now();

/** Rich, "actively burning" rolling window: several readings climbing since window start, with some jitter. */
function genRollingWindow(
  platform: string,
  metric: string,
  windowStartMs: number,
  durationMs: number,
  startPct: number,
  endPct: number,
  rng: () => number,
  points = 10
): UsageRecord[] {
  const windowEndMs = windowStartMs + durationMs;
  const records: UsageRecord[] = [];
  for (let i = 0; i < points; i++) {
    const frac = i / (points - 1);
    const t = windowStartMs + frac * durationMs * Math.min(1, (now - windowStartMs) / durationMs || 1);
    const noise = (rng() - 0.5) * 4;
    const value = Math.max(0, Math.min(100, startPct + (endPct - startPct) * frac + noise));
    records.push({
      platform,
      window_start: iso(windowStartMs),
      window_end: iso(windowEndMs),
      metric,
      value: Math.round(value * 10) / 10,
      unit: "percent",
      fetched_at: iso(Math.min(t, now)),
    });
  }
  return records;
}

const rng = mulberry32(42);

const records: UsageRecord[] = [];

// --- Claude: five_hour window ~65% through, used_percentage climbing to 58%. Also 3 past windows for history. ---
{
  const currentWindowStart = now - 3.2 * HOUR;
  records.push(
    ...genRollingWindow("claude", "five_hour_used_percentage", currentWindowStart, 5 * HOUR, 4, 58, rng)
  );
  // past windows (efficiency history)
  const pastPeaks = [72, 44, 91, 38, 66];
  pastPeaks.forEach((peak, idx) => {
    const start = currentWindowStart - (idx + 1) * 5 * HOUR - idx * 1.5 * HOUR;
    records.push(
      ...genRollingWindow("claude", "five_hour_used_percentage", start, 5 * HOUR, 2, peak, rng, 6)
    );
  });

  // seven_day window, ~3 days in, 41% used
  const weekStart = now - 3 * DAY - 4 * HOUR;
  records.push(
    ...genRollingWindow("claude", "seven_day_used_percentage", weekStart, 7 * DAY, 3, 41, rng, 14)
  );
}

// --- Codex: five_hour window fresh (refreshed 18 min ago), weekly mid-pack ---
{
  const currentWindowStart = now - 18 * 60 * 1000;
  records.push(
    ...genRollingWindow("codex", "five_hour_used_percentage", currentWindowStart, 5 * HOUR, 0, 6, rng, 3)
  );
  const pastPeaks = [55, 88, 30];
  pastPeaks.forEach((peak, idx) => {
    const start = currentWindowStart - (idx + 1) * 5 * HOUR - idx * HOUR;
    records.push(...genRollingWindow("codex", "five_hour_used_percentage", start, 5 * HOUR, 2, peak, rng, 6));
  });

  const weekStart = now - 2 * DAY - 2 * HOUR;
  records.push(
    ...genRollingWindow("codex", "weekly_used_percentage", weekStart, 7 * DAY, 2, 34, rng, 10)
  );
  for (const record of records) {
    if (record.platform === "codex") record.plan_type = "plus";
  }
}

// --- Vercel: official, billing period, usage in $ vs plan + request count metric ---
{
  const periodStart = now - 18 * DAY;
  const points = 18;
  for (let i = 0; i < points; i++) {
    const t = periodStart + i * DAY;
    if (t > now) break;
    const cost = 4.2 + i * 0.85 + (rng() - 0.5) * 1.5;
    records.push({
      platform: "vercel",
      window_start: iso(periodStart),
      window_end: iso(periodStart + 30 * DAY),
      metric: "billing_period_cost",
      value: Math.max(0, Math.round(cost * 100) / 100),
      unit: "usd",
      fetched_at: iso(t),
    });
  }
  // Plan cap context stored as a separate metric so the UI can compute %.
  records.push({
    platform: "vercel",
    window_start: iso(periodStart),
    window_end: iso(periodStart + 30 * DAY),
    metric: "billing_period_included_usd",
    value: 20,
    unit: "usd",
    fetched_at: iso(now),
  });
  records.push({
    platform: "vercel",
    window_start: iso(periodStart),
    window_end: iso(periodStart + 30 * DAY),
    metric: "billing_period_usage_value",
    value: 15.4,
    unit: "usd",
    fetched_at: iso(now),
  });
}

export const MOCK_USAGE_RECORDS: UsageRecord[] = records;

export const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    platform: "claude",
    severity: "warning",
    kind: "approaching_limit",
    message: "Claude 5-hour window at 58% with 1h 48m left — pace is a bit ahead of your usual.",
    created_at: iso(now - 12 * 60 * 1000),
    active: true,
    businessTag: "Acme Consulting",
  },
  {
    id: "a4",
    platform: "codex",
    severity: "info",
    kind: "window_refreshed",
    message: "Codex 5-hour window refreshed 18 minutes ago — good time to batch heavy work.",
    created_at: iso(now - 18 * 60 * 1000),
    active: true,
  },
  {
    id: "a5",
    platform: "claude",
    severity: "warning",
    kind: "burn_rate",
    message: "Claude 5-hour window used 30% in the last hour, ~2x your median hourly rate.",
    created_at: iso(now - DAY),
    active: false,
  },
];

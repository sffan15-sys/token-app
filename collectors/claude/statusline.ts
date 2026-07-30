/**
 * Claude Code statusLine hook collector.
 *
 * Per SPECS.md 1a: Claude Code (since CLI v2.1.6) invokes the script
 * configured as `statusLine` on every turn, passing a JSON payload on
 * stdin and expecting a rendered status-line string on stdout. We piggy-
 * back on that invocation to append a normalized usage record to the
 * shared store, in addition to printing a status line.
 *
 * Expected payload shape (undocumented, per SPECS.md flagged as
 * MEDIUM stability risk - Anthropic has closed feature requests for a
 * stable `claude usage --json` and this JSON could change shape without
 * notice between CLI versions):
 *
 *   {
 *     rate_limits: {
 *       five_hour: { used_percentage: number, resets_at: number },
 *       seven_day: { used_percentage: number, resets_at: number }
 *     },
 *     ...other fields we don't currently use (model, cwd, etc.)
 *   }
 *
 * Because the shape is undocumented and could change, every field is
 * validated defensively. If the expected fields are missing/malformed we
 * write a collector_errors row (kind: "missing_field" / "invalid_shape")
 * instead of crashing or silently dropping the read, per the task
 * requirement. We still print *something* on stdout in all cases so the
 * user's actual Claude Code status line doesn't go blank/break.
 *
 * Wiring this up (once verified against a live payload):
 *   In Claude Code settings (~/.claude/settings.json or project settings):
 *     {
 *       "statusLine": {
 *         "type": "command",
 *         "command": "tsx C:/Users/Fourtys/Documents/Claude/Projects/token-app/collectors/claude/statusline.ts"
 *       }
 *     }
 *   (or point at a compiled dist/ JS file + `node` if avoiding a tsx
 *   runtime dependency in the hook path is preferred - see README.)
 */

import { applyConfigToEnv } from "../../server/config.js";
import { insertCollectorError, insertUsageRecords, type UsageRecord } from "../ingest.js";

const PLATFORM = "claude";

interface RateLimitWindow {
  used_percentage: number;
  resets_at: number; // unix epoch seconds
}

interface StatusLinePayload {
  rate_limits?: {
    five_hour?: Partial<RateLimitWindow>;
    seven_day?: Partial<RateLimitWindow>;
  };
  [key: string]: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate one rate-limit window's shape. Returns field-level problems, if any. */
function validateWindow(name: string, win: unknown): { ok: RateLimitWindow | null; problems: string[] } {
  const problems: string[] = [];
  if (typeof win !== "object" || win === null) {
    problems.push(`rate_limits.${name} is missing or not an object`);
    return { ok: null, problems };
  }
  const w = win as Record<string, unknown>;
  if (!isFiniteNumber(w.used_percentage)) {
    problems.push(`rate_limits.${name}.used_percentage is missing or not a number`);
  } else if (w.used_percentage < 0 || w.used_percentage > 100) {
    problems.push(`rate_limits.${name}.used_percentage (${w.used_percentage}) is out of expected 0-100 range`);
  }
  if (!isFiniteNumber(w.resets_at)) {
    problems.push(`rate_limits.${name}.resets_at is missing or not a number`);
  }
  if (problems.length > 0) return { ok: null, problems };
  return {
    ok: { used_percentage: w.used_percentage as number, resets_at: w.resets_at as number },
    problems: [],
  };
}

function epochSecondsToIso(secs: number): string {
  return new Date(secs * 1000).toISOString();
}

export interface ProcessResult {
  statusLineText: string;
  recordsWritten: number;
  hadError: boolean;
}

export async function processStatusLinePayload(raw: string): Promise<ProcessResult> {
  const fetchedAt = new Date().toISOString();

  let payload: StatusLinePayload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "invalid_json",
      message: `statusLine stdin payload was not valid JSON: ${(err as Error).message}`,
      raw: raw.slice(0, 2000),
    });
    return { statusLineText: "[token-app: invalid statusline JSON]", recordsWritten: 0, hadError: true };
  }

  if (typeof payload !== "object" || payload === null || typeof payload.rate_limits !== "object" || payload.rate_limits === null) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "missing_field",
      message: "statusLine payload is missing top-level 'rate_limits' object. Shape may have changed - see SPECS.md 1a.",
      raw: raw.slice(0, 2000),
    });
    return { statusLineText: "[token-app: no rate_limits in payload]", recordsWritten: 0, hadError: true };
  }

  const fiveHour = validateWindow("five_hour", payload.rate_limits.five_hour);
  const sevenDay = validateWindow("seven_day", payload.rate_limits.seven_day);
  const problems = [...fiveHour.problems, ...sevenDay.problems];

  if (problems.length > 0) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "invalid_shape",
      message: `statusLine rate_limits payload failed validation: ${problems.join("; ")}`,
      raw: raw.slice(0, 2000),
    });
  }

  const records: UsageRecord[] = [];

  if (fiveHour.ok) {
    const resetsIso = epochSecondsToIso(fiveHour.ok.resets_at);
    records.push(
      {
        platform: PLATFORM,
        window_start: fetchedAt,
        window_end: resetsIso,
        metric: "five_hour_used_percentage",
        value: fiveHour.ok.used_percentage,
        unit: "percent",
        fetched_at: fetchedAt,
      },
      {
        platform: PLATFORM,
        window_start: fetchedAt,
        window_end: resetsIso,
        metric: "five_hour_resets_at",
        value: fiveHour.ok.resets_at,
        unit: "unix_seconds",
        fetched_at: fetchedAt,
      }
    );
  }

  if (sevenDay.ok) {
    const resetsIso = epochSecondsToIso(sevenDay.ok.resets_at);
    records.push(
      {
        platform: PLATFORM,
        window_start: fetchedAt,
        window_end: resetsIso,
        metric: "seven_day_used_percentage",
        value: sevenDay.ok.used_percentage,
        unit: "percent",
        fetched_at: fetchedAt,
      },
      {
        platform: PLATFORM,
        window_start: fetchedAt,
        window_end: resetsIso,
        metric: "seven_day_resets_at",
        value: sevenDay.ok.resets_at,
        unit: "unix_seconds",
        fetched_at: fetchedAt,
      }
    );
  }

  const recordsWritten = await insertUsageRecords(records);

  const parts: string[] = [];
  if (fiveHour.ok) parts.push(`5h: ${fiveHour.ok.used_percentage.toFixed(0)}%`);
  if (sevenDay.ok) parts.push(`7d: ${sevenDay.ok.used_percentage.toFixed(0)}%`);
  const statusLineText = parts.length > 0 ? parts.join(" | ") : "[token-app: rate limit data unavailable]";

  return { statusLineText, recordsWritten, hadError: problems.length > 0 };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("collectors/claude/statusline.ts");
if (isMain) {
  applyConfigToEnv();
  readStdin()
    .then(async (raw) => {
      const result = await processStatusLinePayload(raw);
      // Claude Code renders whatever we print on stdout as the status line.
      process.stdout.write(result.statusLineText);
    })
    .catch(async (err) => {
      // Never let the hook crash Claude Code's UI - degrade to a visible
      // marker on the status line plus a best-effort error record.
      try {
        await insertCollectorError({
          platform: PLATFORM,
          occurred_at: new Date().toISOString(),
          kind: "unhandled_exception",
          message: (err as Error).message,
        });
      } catch {
        // storage itself failed; nothing more we can safely do here.
      }
      process.stdout.write("[token-app: collector error]");
    });
}

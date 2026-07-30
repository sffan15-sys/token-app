/**
 * Codex CLI (consumer ChatGPT Plus/Pro) rate-limit collector.
 *
 * VERIFIED LIVE against a real Codex CLI installation on 2026-07-30 (Codex
 * CLI 0.144.6, Windows, ~/.codex/auth.json, auth_mode "chatgpt"). This is
 * NOT the endpoint path SPECS.md guessed (`/api/codex/usage`) - the real,
 * currently-live endpoint the Codex CLI itself polls is:
 *
 *   GET https://chatgpt.com/backend-api/wham/usage
 *   Headers:
 *     Authorization: Bearer <tokens.access_token from ~/.codex/auth.json>
 *     chatgpt-account-id: <tokens.account_id from ~/.codex/auth.json>
 *
 * Confirmed real response shape (fields actually seen, not hypothesized):
 *   {
 *     user_id, account_id, email, plan_type,
 *     rate_limit: {
 *       allowed: boolean, limit_reached: boolean,
 *       primary_window: { used_percent, limit_window_seconds,
 *                          reset_after_seconds, reset_at } | null,
 *       secondary_window: <same shape> | null
 *     },
 *     code_review_rate_limit, additional_rate_limits,
 *     credits: { has_credits, unlimited, overage_limit_reached, balance,
 *                approx_local_messages, approx_cloud_messages },
 *     spend_control: { reached, individual_limit },
 *     rate_limit_reached_type, promo,
 *     rate_limit_reset_credits: { available_count, applicable_available_count }
 *   }
 *
 * Notes on the shape:
 *   - There is no fixed "primary = 5hr, secondary = weekly" guarantee -
 *     each window object carries its own `limit_window_seconds`, so this
 *     collector labels windows by their actual duration (~18000s = 5hr,
 *     ~604800s = weekly) rather than assuming which slot they land in.
 *   - `secondary_window` was `null` in the verified live response (this
 *     account had only a primary/weekly window active at read time) -
 *     collector handles either window being null.
 *   - `reset_at` is unix epoch seconds.
 *
 * Auth/trust boundary: reads the Codex CLI's own local OAuth token from
 * ~/.codex/auth.json (or $CODEX_HOME/auth.json), same trust boundary as
 * Claude Code's statusline collector reading its own local state - this is
 * the CLI's own stored session, not a scraped browser cookie. The token
 * value itself is never logged, printed, or written to git; only the
 * normalized usage numbers are persisted.
 *
 * Stability risk: MEDIUM-HIGH per SPECS.md 2a - this is an undocumented,
 * internal endpoint. It could change shape or require different headers
 * without notice. This collector validates the shape on every read and
 * writes to collector_errors (rather than silently degrading) if expected
 * fields are missing, matching the pattern used by the other collectors.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { insertCollectorError, insertUsageRecords, type UsageRecord } from "../../storage/db.js";

const PLATFORM = "codex";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

interface CodexAuthTokens {
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
  id_token?: string;
}

interface CodexAuthFile {
  auth_mode?: string;
  tokens?: CodexAuthTokens;
  account_id?: string;
  last_refresh?: string;
}

interface RateLimitWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
}

interface WhamUsageResponse {
  plan_type?: string;
  rate_limit?: {
    allowed?: boolean;
    limit_reached?: boolean;
    primary_window?: RateLimitWindow | null;
    secondary_window?: RateLimitWindow | null;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: string;
  };
  [key: string]: unknown;
}

function getCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

/** Read the Codex CLI's own local OAuth token. Never logs the token value. */
function readLocalCodexAuth(): CodexAuthTokens {
  const authPath = path.join(getCodexHome(), "auth.json");
  if (!fs.existsSync(authPath)) {
    throw new Error(
      `No Codex CLI credential file found at ${authPath}. Install/log into the ` +
        `Codex CLI (\`codex login\`) first, or set CODEX_HOME if it lives elsewhere.`
    );
  }
  const raw = fs.readFileSync(authPath, "utf8");
  const parsed = JSON.parse(raw) as CodexAuthFile;
  const accessToken = parsed.tokens?.access_token;
  const accountId = parsed.tokens?.account_id ?? parsed.account_id;
  if (!accessToken) {
    throw new Error(
      `~/.codex/auth.json exists but has no tokens.access_token - is the Codex CLI ` +
        `logged in via ChatGPT auth (auth_mode "chatgpt")? API-key-only auth mode ` +
        `does not carry a usable session token for this endpoint.`
    );
  }
  return { access_token: accessToken, account_id: accountId };
}

/** Label a window by its actual duration rather than assuming slot order. */
function windowLabel(w: RateLimitWindow): string {
  const days = w.limit_window_seconds / 86400;
  if (Math.abs(days - 7) < 0.5) return "weekly";
  const hours = w.limit_window_seconds / 3600;
  if (Math.abs(hours - 5) < 0.5) return "five_hour";
  return `window_${w.limit_window_seconds}s`;
}

function windowToRecords(
  label: string,
  w: RateLimitWindow,
  fetchedAt: string,
  raw: string
): UsageRecord[] {
  const windowEnd = new Date(w.reset_at * 1000).toISOString();
  const windowStart = new Date(w.reset_at * 1000 - w.limit_window_seconds * 1000).toISOString();
  return [
    {
      platform: PLATFORM,
      window_start: windowStart,
      window_end: windowEnd,
      metric: `${label}_used_percentage`,
      value: w.used_percent,
      unit: "percent",
      fetched_at: fetchedAt,
      raw,
    },
  ];
}

export async function collectCodexUsage(): Promise<{ recordsWritten: number }> {
  const fetchedAt = new Date().toISOString();

  let tokens: CodexAuthTokens;
  try {
    tokens = readLocalCodexAuth();
  } catch (err) {
    const message = (err as Error).message;
    insertCollectorError({ platform: PLATFORM, occurred_at: fetchedAt, kind: "missing_credential", message });
    throw err;
  }

  let response: Response;
  try {
    response = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        ...(tokens.account_id ? { "chatgpt-account-id": tokens.account_id } : {}),
        "User-Agent": "token-app-codex-collector/0.1",
      },
    });
  } catch (err) {
    const message = `Network error calling Codex wham/usage: ${(err as Error).message}`;
    insertCollectorError({ platform: PLATFORM, occurred_at: fetchedAt, kind: "network_error", message });
    throw new Error(message);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = `Codex wham/usage returned HTTP ${response.status}: ${body}`;
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: `http_${response.status}`,
      message,
      raw: body || null,
    });
    throw new Error(message);
  }

  const bodyText = await response.text();
  let data: WhamUsageResponse;
  try {
    data = JSON.parse(bodyText) as WhamUsageResponse;
  } catch {
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "invalid_json",
      message: "Codex wham/usage response was not valid JSON.",
      raw: bodyText.slice(0, 2000),
    });
    throw new Error("Codex wham/usage response was not valid JSON.");
  }

  if (!data.rate_limit || (data.rate_limit.primary_window == null && data.rate_limit.secondary_window == null)) {
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "missing_field",
      message:
        "Codex wham/usage response had no rate_limit.primary_window/secondary_window - " +
        "endpoint shape may have changed. See collectors/codex/collect.ts header comment " +
        "for the last verified shape.",
      raw: bodyText.slice(0, 2000),
    });
    return { recordsWritten: 0 };
  }

  const allRecords: UsageRecord[] = [];
  const raw = JSON.stringify(data);
  for (const w of [data.rate_limit.primary_window, data.rate_limit.secondary_window]) {
    if (!w) continue;
    allRecords.push(...windowToRecords(windowLabel(w), w, fetchedAt, raw));
  }

  if (data.credits && data.credits.has_credits && data.credits.balance != null) {
    const balance = Number(data.credits.balance);
    if (!Number.isNaN(balance)) {
      allRecords.push({
        platform: PLATFORM,
        window_start: fetchedAt,
        window_end: fetchedAt,
        metric: "credit_balance",
        value: balance,
        unit: "usd",
        fetched_at: fetchedAt,
        raw,
      });
    }
  }

  const recordsWritten = insertUsageRecords(allRecords);
  return { recordsWritten };
}

// Allow running directly: `npm run collect:codex` or `tsx collectors/codex/collect.ts`
if (process.argv[1]?.endsWith("collect.ts")) {
  collectCodexUsage()
    .then((result) => {
      console.log(`Codex collector: wrote ${result.recordsWritten} records.`);
    })
    .catch((err) => {
      console.error(`Codex collector failed: ${err.message}`);
      process.exitCode = 1;
    });
}

/**
 * Vercel usage/billing collector.
 *
 * Hits GET /v1/billing/charges (FOCUS v1.3 JSONL format) and normalizes
 * each charge line into the shared UsageRecord schema. It also writes one
 * `billing_period_cost` record containing the real net sum of BilledCost
 * across the current calendar month. That aggregate is what the frontend
 * uses; it includes base seats, usage, credits, adjustments, and taxes
 * exactly when those categories are present in the returned charge data.
 *
 * Docs verified live against vercel.com/docs/rest-api/billing/list-focus-billing-charges
 * on 2026-07-30:
 *   - GET https://api.vercel.com/v1/billing/charges
 *   - Required query params: from, to (ISO 8601 UTC, `to` exclusive, max 1yr range)
 *   - Optional: teamId or slug (which team to query on behalf of)
 *   - Auth: Bearer <personal access token>, read from env var VERCEL_TOKEN
 *   - Only available for Owner/Member/Developer/Security/Billing/Enterprise
 *     Viewer roles on a Pro or Enterprise team. On a Hobby team (or
 *     insufficient role) this returns 403 - handled explicitly below
 *     rather than left to throw a raw fetch error.
 *   - Response is newline-delimited JSON (application/jsonl), one charge
 *     object per line, each with FOCUS v1.3 fields (BilledCost,
 *     ChargePeriodStart/End, ServiceName, ConsumedQuantity/Unit, etc).
 *
 * The aggregate never adds a guessed Vercel seat price. BilledCost is the
 * invoiced amount supplied by Vercel's billing API.
 */

import { insertCollectorError, insertUsageRecords, type UsageRecord } from "../../storage/db.js";
import { applyConfigToEnv } from "../../server/config.js";

const VERCEL_API_BASE = "https://api.vercel.com";
const PLATFORM = "vercel";

/** One line of the FOCUS v1.3 JSONL response from /v1/billing/charges. */
interface FocusCharge {
  BilledCost: number;
  BillingCurrency: string;
  ChargeCategory: "Adjustment" | "Credit" | "Purchase" | "Tax" | "Usage";
  ChargePeriodStart: string;
  ChargePeriodEnd: string;
  ConsumedQuantity: number | null;
  ConsumedUnit: string | null;
  EffectiveCost: number;
  ServiceName: string;
  ServiceProviderName: string;
  Tags: Record<string, string>;
  PricingCategory: string;
  PricingCurrency: string;
  PricingQuantity: number;
  PricingUnit: string;
  [key: string]: unknown;
}

export interface CollectVercelOptions {
  /** ISO 8601 UTC date-time, inclusive start. Defaults to 7 days ago. */
  from?: string;
  /** ISO 8601 UTC date-time, exclusive end. Defaults to now. */
  to?: string;
  /** Team ID to query on behalf of. Optional if the token has one default team. */
  teamId?: string;
  /** Team slug, alternative to teamId. */
  slug?: string;
}

class VercelPlanMismatchError extends Error {
  constructor(status: number, body: string) {
    super(
      `Vercel billing/charges returned ${status} - this endpoint requires a Pro or ` +
        `Enterprise team with an Owner/Member/Developer/Security/Billing/Enterprise ` +
        `Viewer role. If this team is on the Hobby plan, or the token's role is ` +
        `insufficient, that's the expected cause (see SPECS.md section 4). Body: ${body}`
    );
    this.name = "VercelPlanMismatchError";
  }
}

function currentUtcMonth(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Defensively parse one JSONL line into a FocusCharge, or return null if malformed. */
function parseChargeLine(line: string): FocusCharge | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (
      typeof obj.BilledCost !== "number" ||
      typeof obj.BillingCurrency !== "string" ||
      typeof obj.ChargeCategory !== "string" ||
      typeof obj.ChargePeriodStart !== "string" ||
      typeof obj.ChargePeriodEnd !== "string" ||
      typeof obj.ServiceName !== "string"
    ) {
      return null;
    }
    return obj as FocusCharge;
  } catch {
    return null;
  }
}

function chargeToUsageRecords(charge: FocusCharge, fetchedAt: string): UsageRecord[] {
  const base = {
    platform: PLATFORM,
    window_start: charge.ChargePeriodStart,
    window_end: charge.ChargePeriodEnd,
    fetched_at: fetchedAt,
    raw: JSON.stringify(charge),
  };
  const records: UsageRecord[] = [
    {
      ...base,
      metric: `cost.${charge.ServiceName}.billed`,
      value: charge.BilledCost,
      unit: charge.BillingCurrency || "USD",
    },
    {
      ...base,
      metric: `cost.${charge.ServiceName}.effective`,
      value: charge.EffectiveCost,
      unit: charge.PricingCurrency || "USD",
    },
  ];
  if (typeof charge.ConsumedQuantity === "number" && charge.ConsumedUnit) {
    records.push({
      ...base,
      metric: `usage.${charge.ServiceName}`,
      value: charge.ConsumedQuantity,
      unit: charge.ConsumedUnit,
    });
  }
  return records;
}

export async function collectVercelUsage(opts: CollectVercelOptions = {}): Promise<{
  recordsWritten: number;
  chargesSeen: number;
}> {
  const token = process.env.VERCEL_TOKEN;
  const fetchedAt = new Date().toISOString();

  if (!token) {
    const message =
      "VERCEL_TOKEN env var is not set. This collector needs a personal access " +
      "token (Settings > Tokens on vercel.com) with access to the target team.";
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "missing_token",
      message,
    });
    throw new Error(message);
  }

  const defaultMonth = currentUtcMonth();
  const from = opts.from ?? defaultMonth.start;
  const to = opts.to ?? new Date().toISOString();
  const aggregateWindowEnd = opts.to ?? defaultMonth.end;

  const url = new URL("/v1/billing/charges", VERCEL_API_BASE);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  if (opts.teamId) url.searchParams.set("teamId", opts.teamId);
  if (opts.slug) url.searchParams.set("slug", opts.slug);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/jsonl",
      },
    });
  } catch (err) {
    const message = `Network error calling Vercel billing/charges: ${(err as Error).message}`;
    insertCollectorError({ platform: PLATFORM, occurred_at: fetchedAt, kind: "network_error", message });
    throw new Error(message);
  }

  // Rate limit headers, per SPECS.md - log if we're close to the limit but
  // don't fail the collection over it.
  const rlRemaining = response.headers.get("x-ratelimit-remaining");
  const rlLimit = response.headers.get("x-ratelimit-limit");
  if (rlRemaining && rlLimit && Number(rlRemaining) < Number(rlLimit) * 0.1) {
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "rate_limit_warning",
      message: `Vercel API rate limit low: ${rlRemaining}/${rlLimit} remaining.`,
    });
  }

  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    const err = new VercelPlanMismatchError(response.status, body);
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "plan_mismatch_403",
      message: err.message,
      raw: body || null,
    });
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = `Vercel billing/charges returned HTTP ${response.status}: ${body}`;
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
  const lines = bodyText.split("\n");

  const allRecords: UsageRecord[] = [];
  const charges: FocusCharge[] = [];
  let chargesSeen = 0;
  let malformedLines = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const charge = parseChargeLine(line);
    if (!charge) {
      malformedLines++;
      continue;
    }
    chargesSeen++;
    charges.push(charge);
    allRecords.push(...chargeToUsageRecords(charge, fetchedAt));
  }

  if (malformedLines > 0) {
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "malformed_jsonl_lines",
      message: `${malformedLines} of ${lines.length} JSONL line(s) from Vercel billing/charges did not match the expected FOCUS shape and were skipped.`,
    });
  }

  const billedByCurrency = new Map<string, number>();
  const billedByCategory: Record<string, number> = {};
  for (const charge of charges) {
    const currency = charge.BillingCurrency.toUpperCase();
    billedByCurrency.set(currency, (billedByCurrency.get(currency) ?? 0) + charge.BilledCost);
    billedByCategory[charge.ChargeCategory] =
      (billedByCategory[charge.ChargeCategory] ?? 0) + charge.BilledCost;
  }

  if (billedByCurrency.size <= 1) {
    const [currency = "USD", unroundedTotal = 0] =
      billedByCurrency.entries().next().value ?? [];
    const total = Math.round((unroundedTotal + Number.EPSILON) * 100) / 100;
    allRecords.push({
      platform: PLATFORM,
      window_start: from,
      window_end: aggregateWindowEnd,
      metric: "billing_period_cost",
      value: total,
      unit: currency.toLowerCase(),
      fetched_at: fetchedAt,
      raw: JSON.stringify({
        source: "vercel_focus_v1.3",
        query_from: from,
        query_to: to,
        charge_count: chargesSeen,
        billing_currency: currency,
        billed_by_category: billedByCategory,
      }),
    });
  } else {
    insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "mixed_billing_currencies",
      message:
        "Vercel returned billing charges in multiple currencies for one period. " +
        "Per-charge records were stored, but no single USD total was fabricated.",
      raw: JSON.stringify({ currencies: [...billedByCurrency.keys()] }),
    });
  }

  const recordsWritten = insertUsageRecords(allRecords);
  return { recordsWritten, chargesSeen };
}

// Allow running directly: `npm run collect:vercel` or `tsx collectors/vercel/collect.ts`
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("collectors/vercel/collect.ts");
if (isMain) {
  // Picks up keys saved via the Settings UI / POST /api/config (data/local-config.json) so the
  // owner doesn't have to `export VERCEL_TOKEN=...` by hand before running this directly.
  applyConfigToEnv();
  collectVercelUsage({ teamId: process.env.VERCEL_TEAM_ID })
    .then((result) => {
      console.log(`Vercel collector: wrote ${result.recordsWritten} records from ${result.chargesSeen} charges.`);
    })
    .catch((err) => {
      console.error(`Vercel collector failed: ${err.message}`);
      process.exitCode = 1;
    });
}

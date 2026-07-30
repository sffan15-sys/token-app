/**
 * OpenAI API (pay-per-token developer usage) collector - official tier.
 *
 * Two independent data sources, both documented:
 *
 * 1. Rate-limit headers (works with any plain OPENAI_API_KEY):
 *    every OpenAI API response carries `x-ratelimit-limit-requests`,
 *    `x-ratelimit-remaining-requests`, `x-ratelimit-limit-tokens`,
 *    `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`,
 *    `x-ratelimit-reset-tokens`. We hit a cheap, free-to-call endpoint
 *    (`GET /v1/models`) purely to read these headers off the response -
 *    no cost, no side effects.
 *
 * 2. Organization usage (`GET /v1/organization/usage/completions`, plus
 *    sibling `.../usage/{images,audio,embeddings,moderations,...}`):
 *    the current, documented replacement for the older `/v1/usage`
 *    endpoint referenced in SPECS.md (that endpoint is legacy/being
 *    phased out per platform.openai.com's own docs as of this writing).
 *    This requires an **Admin API key** (org owner/admin scope), same
 *    trust tier as Anthropic's Admin API per SPECS.md 1b - a plain
 *    per-project OPENAI_API_KEY will get a 401/403 here, which is
 *    expected and handled as a soft failure (logged, not thrown) rather
 *    than treated as a broken collector, since header-capture (source 1)
 *    still succeeds independently.
 *
 * NOT LIVE-TESTED: no OPENAI_API_KEY is configured on this machine, so
 * this collector is written against current OpenAI API docs/precedent
 * (same shape family as `platform.openai.com/docs/api-reference/usage`)
 * but has not been run against a real key. To verify: set OPENAI_API_KEY
 * (and ideally an Admin-scoped key) and run
 * `npm run collect:openai`, then confirm the header names and the
 * usage bucket JSON shape below still match what comes back.
 */

import { insertCollectorError, insertUsageRecords, type UsageRecord } from "../ingest.js";
import { applyConfigToEnv } from "../../server/config.js";

const PLATFORM = "openai";
const API_BASE = "https://api.openai.com";

interface UsageBucketResult {
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
  model?: string;
  project_id?: string;
  [key: string]: unknown;
}

interface UsageBucket {
  object: "bucket";
  start_time: number;
  end_time: number;
  results: UsageBucketResult[];
}

interface UsagePageResponse {
  object: "page";
  data: UsageBucket[];
  has_more?: boolean;
  next_page?: string | null;
}

function isoFromEpochSeconds(s: number): string {
  return new Date(s * 1000).toISOString();
}

async function requireApiKey(fetchedAt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const message = "OPENAI_API_KEY env var is not set.";
    await insertCollectorError({ platform: PLATFORM, occurred_at: fetchedAt, kind: "missing_token", message });
    throw new Error(message);
  }
  return key;
}

/** Source 1: rate-limit headers, works with any plain API key. */
async function collectRateLimitHeaders(apiKey: string, fetchedAt: string): Promise<UsageRecord[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "network_error",
      message: `Network error calling OpenAI /v1/models for rate-limit headers: ${(err as Error).message}`,
    });
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: `http_${response.status}`,
      message: `OpenAI /v1/models returned HTTP ${response.status}: ${body}`,
      raw: body || null,
    });
    return [];
  }

  const h = response.headers;
  const pairs: [string, string, string][] = [
    ["ratelimit_requests_remaining", "x-ratelimit-remaining-requests", "count"],
    ["ratelimit_requests_limit", "x-ratelimit-limit-requests", "count"],
    ["ratelimit_tokens_remaining", "x-ratelimit-remaining-tokens", "count"],
    ["ratelimit_tokens_limit", "x-ratelimit-limit-tokens", "count"],
  ];

  const records: UsageRecord[] = [];
  const rawHeaders: Record<string, string | null> = {};
  for (const [, headerName] of pairs) {
    rawHeaders[headerName] = h.get(headerName);
  }

  let anyFound = false;
  for (const [metric, headerName, unit] of pairs) {
    const v = h.get(headerName);
    if (v == null) continue;
    const num = Number(v);
    if (Number.isNaN(num)) continue;
    anyFound = true;
    records.push({
      platform: PLATFORM,
      window_start: fetchedAt,
      window_end: fetchedAt,
      metric,
      value: num,
      unit,
      fetched_at: fetchedAt,
      raw: JSON.stringify(rawHeaders),
    });
  }

  if (!anyFound) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "missing_field",
      message:
        "OpenAI /v1/models response had none of the expected x-ratelimit-* headers - " +
        "header names may have changed. See collectors/openai/collect.ts.",
      raw: JSON.stringify(rawHeaders),
    });
  }

  return records;
}

/** Source 2: org-level usage buckets. Requires Admin API key; soft-fails otherwise. */
async function collectOrganizationUsage(
  apiKey: string,
  fetchedAt: string,
  opts: { startTime?: number; endTime?: number } = {}
): Promise<UsageRecord[]> {
  const startTime = opts.startTime ?? Math.floor(Date.now() / 1000) - 7 * 86400;
  const endTime = opts.endTime;

  const url = new URL("/v1/organization/usage/completions", API_BASE);
  url.searchParams.set("start_time", String(startTime));
  if (endTime) url.searchParams.set("end_time", String(endTime));
  url.searchParams.set("bucket_width", "1d");

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch (err) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "network_error",
      message: `Network error calling OpenAI organization/usage/completions: ${(err as Error).message}`,
    });
    return [];
  }

  if (response.status === 401 || response.status === 403) {
    // Expected when OPENAI_API_KEY is a plain project key, not an Admin key.
    const body = await response.text().catch(() => "");
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "admin_key_required",
      message:
        `OpenAI organization/usage/completions returned HTTP ${response.status} - this ` +
        `endpoint requires an Admin API key (org owner/admin scope), not a plain project ` +
        `key. Rate-limit-header collection (source 1) is unaffected. Body: ${body}`,
      raw: body || null,
    });
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: `http_${response.status}`,
      message: `OpenAI organization/usage/completions returned HTTP ${response.status}: ${body}`,
      raw: body || null,
    });
    return [];
  }

  let data: UsagePageResponse;
  try {
    data = (await response.json()) as UsagePageResponse;
  } catch {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "invalid_json",
      message: "OpenAI organization/usage/completions response was not valid JSON.",
    });
    return [];
  }

  if (!Array.isArray(data.data)) {
    await insertCollectorError({
      platform: PLATFORM,
      occurred_at: fetchedAt,
      kind: "missing_field",
      message: "OpenAI organization/usage/completions response had no `data` bucket array.",
      raw: JSON.stringify(data).slice(0, 2000),
    });
    return [];
  }

  const records: UsageRecord[] = [];
  for (const bucket of data.data) {
    const windowStart = isoFromEpochSeconds(bucket.start_time);
    const windowEnd = isoFromEpochSeconds(bucket.end_time);
    for (const result of bucket.results ?? []) {
      const modelTag = result.model ? `.${result.model}` : "";
      const raw = JSON.stringify(result);
      if (typeof result.input_tokens === "number") {
        records.push({
          platform: PLATFORM,
          window_start: windowStart,
          window_end: windowEnd,
          metric: `completions_input_tokens${modelTag}`,
          value: result.input_tokens,
          unit: "tokens",
          fetched_at: fetchedAt,
          raw,
        });
      }
      if (typeof result.output_tokens === "number") {
        records.push({
          platform: PLATFORM,
          window_start: windowStart,
          window_end: windowEnd,
          metric: `completions_output_tokens${modelTag}`,
          value: result.output_tokens,
          unit: "tokens",
          fetched_at: fetchedAt,
          raw,
        });
      }
      if (typeof result.num_model_requests === "number") {
        records.push({
          platform: PLATFORM,
          window_start: windowStart,
          window_end: windowEnd,
          metric: `completions_requests${modelTag}`,
          value: result.num_model_requests,
          unit: "count",
          fetched_at: fetchedAt,
          raw,
        });
      }
    }
  }

  return records;
}

export async function collectOpenAiUsage(): Promise<{ recordsWritten: number }> {
  const fetchedAt = new Date().toISOString();
  const apiKey = await requireApiKey(fetchedAt);

  const [headerRecords, usageRecords] = await Promise.all([
    collectRateLimitHeaders(apiKey, fetchedAt),
    collectOrganizationUsage(apiKey, fetchedAt),
  ]);

  const recordsWritten = await insertUsageRecords([...headerRecords, ...usageRecords]);
  return { recordsWritten };
}

// Allow running directly: `npm run collect:openai` or `tsx collectors/openai/collect.ts`
if (process.argv[1]?.endsWith("collect.ts")) {
  applyConfigToEnv();
  collectOpenAiUsage()
    .then((result) => {
      console.log(`OpenAI collector: wrote ${result.recordsWritten} records.`);
    })
    .catch((err) => {
      console.error(`OpenAI collector failed: ${err.message}`);
      process.exitCode = 1;
    });
}

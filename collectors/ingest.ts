/**
 * Local-to-hosted persistence transport used by every collector.
 *
 * Collectors still run on the owner's machine because several of them read
 * local CLI state. Their normalized output is POSTed to the hosted API so
 * Postgres, not a local file, is the single source of truth.
 */

import type { CollectorError, UsageRecord } from "../storage/types.js";

export type { CollectorError, UsageRecord } from "../storage/types.js";

const INGEST_PATH = "/api/ingest";

interface IngestResponse {
  recordsWritten: number;
  errorsWritten: number;
}

function ingestConfig(): { url: string; secret: string } {
  const baseUrl = process.env.TOKEN_APP_API_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.TOKEN_APP_API_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new Error(
      "Hosted ingest is not configured. Set TOKEN_APP_API_URL and " +
        "TOKEN_APP_API_SECRET (or save both in data/local-config.json via the local Settings UI)."
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("TOKEN_APP_API_URL must be an absolute http(s) URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("TOKEN_APP_API_URL must use http or https.");
  }
  return { url: `${baseUrl}${INGEST_PATH}`, secret };
}

async function postIngest(body: {
  records?: UsageRecord[];
  errors?: CollectorError[];
}): Promise<IngestResponse> {
  const { url, secret } = ingestConfig();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token-App-Secret": secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(
      `Could not reach hosted token-app ingest endpoint: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Hosted token-app ingest returned HTTP ${response.status}: ${responseText.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(responseText) as IngestResponse;
  } catch {
    throw new Error("Hosted token-app ingest returned invalid JSON.");
  }
}

/** Same call shape collectors used with the old local database adapter. */
export async function insertUsageRecords(records: UsageRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const result = await postIngest({ records });
  return result.recordsWritten;
}

/** Same call shape collectors used with the old local database adapter. */
export async function insertCollectorError(error: CollectorError): Promise<void> {
  await postIngest({ errors: [error] });
}

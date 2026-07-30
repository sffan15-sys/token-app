/**
 * Gemini API quota collector via Google Cloud Monitoring.
 *
 * Every Google AI Studio API key belongs to a GCP project. Google records
 * quota consumption for consumed APIs in that project as
 * `serviceruntime.googleapis.com/quota/*` Cloud Monitoring metrics. This
 * collector reads those metrics for both Gemini service routes:
 *
 *   - generativelanguage.googleapis.com (direct Gemini / AI Studio API)
 *   - aiplatform.googleapis.com (Gemini through Vertex AI)
 *
 * Authentication follows Google's standard service-account OAuth flow:
 * `GOOGLE_APPLICATION_CREDENTIALS` points to a service-account JSON key and
 * `GEMINI_GCP_PROJECT_ID` names the project whose metrics should be read.
 * The service account needs `roles/monitoring.viewer` on that project.
 *
 * VERIFIED AGAINST CURRENT GOOGLE DOCUMENTATION (2026-07-30):
 *   - projects.timeSeries.list is
 *     GET https://monitoring.googleapis.com/v3/projects/{project}/timeSeries
 *   - each request filter must name one exact metric type, so the collector
 *     iterates the documented serviceruntime quota metric family below
 *   - the monitored resource is `consumer_quota` and its `service` label
 *     identifies the consumed API
 *   - FULL responses contain TimeSeries points whose TypedValue is one of
 *     int64Value (JSON string), doubleValue, boolValue, etc.
 *   - service-account JWT assertions use RS256 and the
 *     https://www.googleapis.com/auth/monitoring.read OAuth scope
 *
 * LIVE-CREDENTIAL CAVEAT: no GCP service-account key is available in this
 * environment, so OAuth exchange, Gemini-specific label values, and real
 * response bytes still need one live run to confirm. Parsing is deliberately
 * defensive: missing credentials and malformed responses are written to
 * collector_errors and return a zero/partial result instead of crashing.
 */

import { createSign } from "node:crypto";
import fs from "node:fs";
import { applyConfigToEnv } from "../../server/config.js";
import { insertCollectorError, insertUsageRecords, type UsageRecord } from "../ingest.js";

const PLATFORM = "gemini";
const MONITORING_API_BASE = "https://monitoring.googleapis.com";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const MONITORING_READ_SCOPE = "https://www.googleapis.com/auth/monitoring.read";
const METRIC_PREFIX = "serviceruntime.googleapis.com/";

const GEMINI_SERVICES = [
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
] as const;

/**
 * timeSeries.list requires one exact metric type per request. These are all
 * currently documented serviceruntime quota time-series metric types.
 */
const QUOTA_METRIC_TYPES = [
  "serviceruntime.googleapis.com/quota/allocation/usage",
  "serviceruntime.googleapis.com/quota/concurrent/exceeded",
  "serviceruntime.googleapis.com/quota/concurrent/limit",
  "serviceruntime.googleapis.com/quota/concurrent/usage",
  "serviceruntime.googleapis.com/quota/exceeded",
  "serviceruntime.googleapis.com/quota/limit",
  "serviceruntime.googleapis.com/quota/rate/net_usage",
  "serviceruntime.googleapis.com/quota/ratev2/exceeded",
  "serviceruntime.googleapis.com/quota/ratev2/limit",
  "serviceruntime.googleapis.com/quota/ratev2/net_usage",
] as const;

interface ServiceAccountCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
}

interface MonitoringTypedValue {
  boolValue?: boolean;
  int64Value?: string;
  doubleValue?: number;
  stringValue?: string;
  distributionValue?: unknown;
}

interface MonitoringPoint {
  interval?: {
    startTime?: string;
    endTime?: string;
  };
  value?: MonitoringTypedValue;
}

interface MonitoringTimeSeries {
  metric?: {
    type?: string;
    labels?: Record<string, string>;
  };
  resource?: {
    type?: string;
    labels?: Record<string, string>;
  };
  metricKind?: string;
  valueType?: string;
  points?: MonitoringPoint[];
  unit?: string;
}

interface ListTimeSeriesResponse {
  timeSeries?: MonitoringTimeSeries[];
  nextPageToken?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface CollectGeminiOptions {
  /** Inclusive RFC 3339 start. Defaults to seven days ago. */
  from?: string;
  /** Inclusive RFC 3339 end. Defaults to now. */
  to?: string;
}

export interface CollectGeminiResult {
  recordsWritten: number;
  timeSeriesSeen: number;
  pointsSeen: number;
  pointsSkipped: number;
}

function emptyResult(): CollectGeminiResult {
  return { recordsWritten: 0, timeSeriesSeen: 0, pointsSeen: 0, pointsSkipped: 0 };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function logCollectorError(
  occurredAt: string,
  kind: string,
  message: string,
  raw?: string | null
): Promise<void> {
  await insertCollectorError({
    platform: PLATFORM,
    occurred_at: occurredAt,
    kind,
    message,
    raw: raw ?? null,
  });
}

async function readCredentials(
  fetchedAt: string
): Promise<ServiceAccountCredentials | null> {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    await logCollectorError(
      fetchedAt,
      "missing_credential",
      "GOOGLE_APPLICATION_CREDENTIALS env var is not set. It must point to a " +
        "service-account JSON key with roles/monitoring.viewer on the Gemini GCP project."
    );
    return null;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(credentialsPath, "utf8");
  } catch (err) {
    await logCollectorError(
      fetchedAt,
      "missing_credential",
      `Could not read the service-account key at GOOGLE_APPLICATION_CREDENTIALS: ${(err as Error).message}`
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await logCollectorError(
      fetchedAt,
      "malformed_credential",
      "GOOGLE_APPLICATION_CREDENTIALS did not contain valid JSON. The key contents were not logged."
    );
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Partial<ServiceAccountCredentials>).client_email !== "string" ||
    typeof (parsed as Partial<ServiceAccountCredentials>).private_key !== "string"
  ) {
    await logCollectorError(
      fetchedAt,
      "malformed_credential",
      "The service-account JSON key is missing client_email or private_key. The key contents were not logged."
    );
    return null;
  }

  return parsed as ServiceAccountCredentials;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createJwtAssertion(credentials: ServiceAccountCredentials, tokenUri: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({
    alg: "RS256",
    typ: "JWT",
    ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}),
  });
  const claims = base64UrlJson({
    iss: credentials.client_email,
    scope: MONITORING_READ_SCOPE,
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function getAccessToken(
  credentials: ServiceAccountCredentials,
  fetchedAt: string
): Promise<string | null> {
  const tokenUri = credentials.token_uri || DEFAULT_TOKEN_URI;
  let assertion: string;
  try {
    assertion = createJwtAssertion(credentials, tokenUri);
  } catch (err) {
    await logCollectorError(
      fetchedAt,
      "malformed_credential",
      `Could not sign a service-account JWT: ${(err as Error).message}. The private key was not logged.`
    );
    return null;
  }

  let response: Response;
  try {
    response = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch (err) {
    await logCollectorError(
      fetchedAt,
      "auth_network_error",
      `Network error exchanging the Google service-account JWT: ${(err as Error).message}`
    );
    return null;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    await logCollectorError(
      fetchedAt,
      `auth_http_${response.status}`,
      `Google OAuth token exchange returned HTTP ${response.status}: ${bodyText}`,
      bodyText.slice(0, 2000) || null
    );
    return null;
  }

  let tokenResponse: OAuthTokenResponse;
  try {
    tokenResponse = JSON.parse(bodyText) as OAuthTokenResponse;
  } catch {
    await logCollectorError(
      fetchedAt,
      "malformed_auth_response",
      "Google OAuth token exchange returned invalid JSON.",
      bodyText.slice(0, 2000)
    );
    return null;
  }

  if (typeof tokenResponse.access_token !== "string" || !tokenResponse.access_token) {
    await logCollectorError(
      fetchedAt,
      "malformed_auth_response",
      "Google OAuth token response had no access_token.",
      bodyText.slice(0, 2000)
    );
    return null;
  }

  return tokenResponse.access_token;
}

function numericPointValue(value: MonitoringTypedValue | undefined): number | null {
  if (!value) return null;
  if (typeof value.doubleValue === "number" && Number.isFinite(value.doubleValue)) {
    return value.doubleValue;
  }
  if (typeof value.int64Value === "string" && value.int64Value.trim()) {
    const parsed = Number(value.int64Value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.boolValue === "boolean") return value.boolValue ? 1 : 0;
  return null;
}

function slug(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/\.googleapis\.com/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unknown";
}

function serviceSlug(service: string): string {
  return service === "generativelanguage.googleapis.com" ? "direct" : "vertex";
}

/**
 * Include the quota dimension and all discriminating labels in the metric
 * name. The storage schema's uniqueness key contains `metric`, so this keeps
 * separate model/method/location/limit series from overwriting each other.
 */
function normalizedMetricName(series: MonitoringTimeSeries, service: string): string | null {
  const metricType = series.metric?.type;
  if (!metricType?.startsWith(`${METRIC_PREFIX}quota/`)) return null;

  const family = metricType.slice(METRIC_PREFIX.length).split("/").map(slug).join(".");
  const metricLabels = series.metric?.labels ?? {};
  const resourceLabels = series.resource?.labels ?? {};
  const dimension =
    metricLabels.quota_metric ||
    metricLabels.limit_name ||
    metricLabels.method ||
    "total";
  const identityLabels = Object.entries({ ...metricLabels, location: resourceLabels.location })
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${slug(key)}_${slug(value)}`)
    .join(".");

  return [
    "quota",
    serviceSlug(service),
    family,
    slug(dimension),
    identityLabels,
  ]
    .filter(Boolean)
    .join(".");
}

function timeSeriesToRecords(
  series: MonitoringTimeSeries,
  expectedService: string,
  fetchedAt: string
): { records: UsageRecord[]; pointsSeen: number; pointsSkipped: number } {
  const metric = normalizedMetricName(series, expectedService);
  const service = series.resource?.labels?.service;
  const points = series.points;

  if (
    !metric ||
    series.resource?.type !== "consumer_quota" ||
    service !== expectedService ||
    !Array.isArray(points)
  ) {
    return { records: [], pointsSeen: Array.isArray(points) ? points.length : 0, pointsSkipped: 1 };
  }

  const records: UsageRecord[] = [];
  let pointsSkipped = 0;
  for (const point of points) {
    const endTime = point.interval?.endTime;
    const startTime = point.interval?.startTime || endTime;
    const value = numericPointValue(point.value);
    if (!startTime || !endTime || value === null) {
      pointsSkipped++;
      continue;
    }

    records.push({
      platform: PLATFORM,
      window_start: startTime,
      window_end: endTime,
      metric,
      value,
      unit: !series.unit || series.unit === "1" ? "count" : series.unit,
      fetched_at: fetchedAt,
      raw: JSON.stringify({
        metric: series.metric,
        resource: series.resource,
        metricKind: series.metricKind,
        valueType: series.valueType,
        unit: series.unit,
        point,
      }),
    });
  }

  return { records, pointsSeen: points.length, pointsSkipped };
}

async function listMetricTimeSeries(
  projectId: string,
  accessToken: string,
  service: string,
  metricType: string,
  from: string,
  to: string,
  fetchedAt: string
): Promise<{
  records: UsageRecord[];
  timeSeriesSeen: number;
  pointsSeen: number;
  pointsSkipped: number;
  failed: boolean;
}> {
  const records: UsageRecord[] = [];
  let timeSeriesSeen = 0;
  let pointsSeen = 0;
  let pointsSkipped = 0;
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const url = new URL(
      `/v3/projects/${encodeURIComponent(projectId)}/timeSeries`,
      MONITORING_API_BASE
    );
    url.searchParams.set(
      "filter",
      `metric.type="${metricType}" AND resource.type="consumer_quota" AND ` +
        `resource.label."service"="${service}"`
    );
    url.searchParams.set("interval.startTime", from);
    url.searchParams.set("interval.endTime", to);
    url.searchParams.set("view", "FULL");
    url.searchParams.set("pageSize", "10000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err) {
      await logCollectorError(
        fetchedAt,
        "network_error",
        `Network error listing ${metricType} for ${service}: ${(err as Error).message}`
      );
      return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: true };
    }

    const bodyText = await response.text();
    if (!response.ok) {
      await logCollectorError(
        fetchedAt,
        `http_${response.status}`,
        `Cloud Monitoring timeSeries.list returned HTTP ${response.status} for ` +
          `${metricType} / ${service}: ${bodyText}`,
        bodyText.slice(0, 2000) || null
      );
      return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: true };
    }

    let data: ListTimeSeriesResponse;
    try {
      data = JSON.parse(bodyText) as ListTimeSeriesResponse;
    } catch {
      await logCollectorError(
        fetchedAt,
        "malformed_response",
        `Cloud Monitoring returned invalid JSON for ${metricType} / ${service}.`,
        bodyText.slice(0, 2000)
      );
      return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: true };
    }

    // An empty object is a valid no-data response. A present non-array
    // timeSeries field is a malformed shape.
    if (data.timeSeries !== undefined && !Array.isArray(data.timeSeries)) {
      await logCollectorError(
        fetchedAt,
        "malformed_response",
        `Cloud Monitoring response had a non-array timeSeries field for ${metricType} / ${service}.`,
        bodyText.slice(0, 2000)
      );
      return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: true };
    }

    for (const series of data.timeSeries ?? []) {
      timeSeriesSeen++;
      const parsed = timeSeriesToRecords(series, service, fetchedAt);
      records.push(...parsed.records);
      pointsSeen += parsed.pointsSeen;
      pointsSkipped += parsed.pointsSkipped;
    }

    pageToken =
      typeof data.nextPageToken === "string" && data.nextPageToken
        ? data.nextPageToken
        : undefined;
    pageCount++;
    if (pageCount >= 100 && pageToken) {
      await logCollectorError(
        fetchedAt,
        "pagination_limit",
        `Stopped Cloud Monitoring pagination after 100 pages for ${metricType} / ${service}.`
      );
      return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: true };
    }
  } while (pageToken);

  return { records, timeSeriesSeen, pointsSeen, pointsSkipped, failed: false };
}

export async function collectGeminiUsage(
  opts: CollectGeminiOptions = {}
): Promise<CollectGeminiResult> {
  const fetchedAt = new Date().toISOString();
  const projectId = process.env.GEMINI_GCP_PROJECT_ID;
  if (!projectId) {
    await logCollectorError(
      fetchedAt,
      "missing_project_id",
      "GEMINI_GCP_PROJECT_ID env var is not set. It must name the GCP project backing the Gemini API key."
    );
    return emptyResult();
  }

  const credentials = await readCredentials(fetchedAt);
  if (!credentials) return emptyResult();

  const accessToken = await getAccessToken(credentials, fetchedAt);
  if (!accessToken) return emptyResult();

  const from = opts.from ?? isoDaysAgo(7);
  const to = opts.to ?? fetchedAt;
  const allRecords: UsageRecord[] = [];
  let timeSeriesSeen = 0;
  let pointsSeen = 0;
  let pointsSkipped = 0;

  for (const service of GEMINI_SERVICES) {
    for (const metricType of QUOTA_METRIC_TYPES) {
      const result = await listMetricTimeSeries(
        projectId,
        accessToken,
        service,
        metricType,
        from,
        to,
        fetchedAt
      );
      allRecords.push(...result.records);
      timeSeriesSeen += result.timeSeriesSeen;
      pointsSeen += result.pointsSeen;
      pointsSkipped += result.pointsSkipped;
      if (result.failed) {
        // Authentication/permission/API failures generally affect every
        // subsequent request too, so stop rather than generating 19 copies.
        const recordsWritten = await insertUsageRecords(allRecords);
        return { recordsWritten, timeSeriesSeen, pointsSeen, pointsSkipped };
      }
    }
  }

  if (pointsSkipped > 0) {
    await logCollectorError(
      fetchedAt,
      "malformed_response",
      `${pointsSkipped} of ${pointsSeen} Cloud Monitoring point(s) did not match the ` +
        "documented consumer_quota numeric/bool TimeSeries shape and were skipped."
    );
  }

  const recordsWritten = await insertUsageRecords(allRecords);
  return { recordsWritten, timeSeriesSeen, pointsSeen, pointsSkipped };
}

// Allow running directly: `npm run collect:gemini` or
// `tsx collectors/gemini/collect.ts`.
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("collectors/gemini/collect.ts");
if (isMain) {
  applyConfigToEnv();
  collectGeminiUsage()
    .then((result) => {
      console.log(
        `Gemini collector: wrote ${result.recordsWritten} records from ` +
          `${result.timeSeriesSeen} time series (${result.pointsSkipped} skipped points).`
      );
    })
    .catch((err) => {
      console.error(`Gemini collector failed unexpectedly: ${err.message}`);
      process.exitCode = 1;
    });
}

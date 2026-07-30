/** Normalized usage/cost/rate-limit datapoint shared by every collector. */
export interface UsageRecord {
  /** Platform identifier, e.g. "vercel", "claude". */
  platform: string;
  /** ISO 8601 timestamp marking the start of the measurement window. */
  window_start: string;
  /** ISO 8601 timestamp marking the end of the measurement window. */
  window_end: string;
  /** Metric name, e.g. "cost", "five_hour_used_percentage". */
  metric: string;
  /** Numeric value of the metric. */
  value: number;
  /** Unit for the value, e.g. "usd", "percent". */
  unit: string;
  /** ISO 8601 timestamp of when the collector fetched this record. */
  fetched_at: string;
  /** Optional source-reported subscription plan identifier. */
  plan_type?: string | null;
  /** Optional raw source payload (JSON string) for debugging/audit. */
  raw?: string | null;
}

export interface CollectorError {
  platform: string;
  /** ISO 8601 timestamp. */
  occurred_at: string;
  /** Short machine-friendly reason, e.g. "missing_field", "http_403". */
  kind: string;
  message: string;
  /** Optional raw payload/context (JSON string) for debugging. */
  raw?: string | null;
}

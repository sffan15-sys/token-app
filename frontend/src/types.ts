/**
 * Core data shapes for the UI. UsageRecord mirrors storage/db.ts's
 * UsageRecord exactly so the mock data layer can be swapped for a real
 * fetch client against the SQLite-backed store without touching any
 * component. Alert / PlatformMeta are UI-side additions invented for
 * this task (no backend alert engine exists yet — see SPECS.md/CLAUDE.md).
 */

export interface UsageRecord {
  platform: string;
  window_start: string; // ISO 8601
  window_end: string; // ISO 8601
  metric: string;
  value: number;
  unit: string;
  fetched_at: string; // ISO 8601
  raw?: string | null;
  /** Optional free-text business/project label ("which business is this session for").
   * Cheap groundwork for cost-per-business attribution — see design/persona-fixes-changelog.md. */
  businessTag?: string | null;
}

export type AlertSeverity = "critical" | "serious" | "warning" | "info";

export type AlertKind =
  | "approaching_limit"
  | "burn_rate"
  | "window_refreshed"
  | "idle_allowance"
  | "use_it_or_lose_it"
  | "overage_risk"
  | "collector_stale";

export interface Alert {
  id: string;
  platform: string;
  severity: AlertSeverity;
  kind: AlertKind;
  message: string;
  created_at: string; // ISO 8601
  active: boolean;
  /** Optional business/project this alert affects, e.g. "Business X" — lets the
   * alert feed distinguish business-critical impact from idle/untagged noise. */
  businessTag?: string | null;
}

export type PlatformTier = "official" | "manual" | "unavailable";

export type PlatformDataMode = "window" | "pool" | "quota" | "unavailable";

export interface WindowMeta {
  /** Metric prefix, e.g. "five_hour", "seven_day", "monthly". */
  key: string;
  label: string;
  /** Window length in ms, used to compute reset countdowns from window_end. */
  durationMs: number;
}

export interface PlatformMeta {
  id: string;
  label: string;
  tier: PlatformTier;
  dataMode: PlatformDataMode;
  color: "blue" | "orange" | "aqua" | "violet";
  windows: WindowMeta[];
  /** Plain-language integration state for sources that need special context. */
  connectionNote?: string;
  /** Flat monthly subscription price in USD, if the plan is a flat-fee subscription
   * (vs. pure pay-per-token). Illustrative mock values — see mockData.ts comment. */
  monthlyCostUsd?: number;
}

export type Status = "good" | "watch" | "hot" | "stale";

import type { Status } from "../types";

const WATCH_THRESHOLD = 70;
const HOT_THRESHOLD = 90;
/** No fresh reading within this many hours => treat as stale/unknown, for
 * frequently-polled sources (rolling session windows). */
const STALE_HOURS_LIVE = 6;
/** Looser staleness bar for daily/manual-cadence sources (billing-period
 * usage, manual logs) — a 12h gap there is normal, not a broken collector. */
const STALE_HOURS_SLOW = 48;

export function statusForUsage(
  usedPercent: number | null,
  lastFetchedAt: string | null,
  cadence: "live" | "slow" = "live"
): Status {
  if (usedPercent === null || lastFetchedAt === null) return "stale";
  const hoursSinceFetch = (Date.now() - new Date(lastFetchedAt).getTime()) / 36e5;
  const staleThreshold = cadence === "slow" ? STALE_HOURS_SLOW : STALE_HOURS_LIVE;
  if (hoursSinceFetch > staleThreshold) return "stale";
  if (usedPercent >= HOT_THRESHOLD) return "hot";
  if (usedPercent >= WATCH_THRESHOLD) return "watch";
  return "good";
}

const STATUS_RANK: Record<Status, number> = { stale: 0, good: 1, watch: 2, hot: 3 };

/**
 * Combine multiple windows (e.g. five_hour AND seven_day) into a single
 * status by taking whichever window is MOST constrained, not just the
 * first/primary one. Fixes the bug flagged in research/codex-critique.md
 * #3: a "Healthy" 5-hour badge could otherwise hide a tight weekly cap
 * entirely, because callers only ever looked at meta.windows[0].
 */
export function worstStatus(statuses: Status[]): Status {
  if (statuses.length === 0) return "stale";
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), statuses[0]);
}

export const STATUS_LABEL: Record<Status, string> = {
  good: "Healthy",
  watch: "Watch",
  hot: "Hot",
  stale: "No data",
};

export const STATUS_VAR: Record<Status, string> = {
  good: "--status-good",
  watch: "--status-warning",
  hot: "--status-critical",
  stale: "--status-stale",
};

export const STATUS_BG_VAR: Record<Status, string> = {
  good: "--status-good-bg",
  watch: "--status-warning-bg",
  hot: "--status-critical-bg",
  stale: "--status-stale-bg",
};

import type { PlatformMeta, UsageRecord, WindowMeta } from "../types";

export interface WindowSnapshot {
  window: WindowMeta;
  latest: UsageRecord | null;
  series: UsageRecord[]; // all records for this platform+metric in the latest window, time-ordered
  usedPercent: number | null; // null when the metric isn't percent-shaped (e.g. $ pools)
  resetAt: string | null;
  lastFetchedAt: string | null;
}

function metricFor(window: WindowMeta): string {
  return `${window.key}_used_percentage`;
}

/** Records for a platform+metric, restricted to the most recent window_start, time-ordered. */
export function latestWindowRecords(records: UsageRecord[], platform: string, metric: string): UsageRecord[] {
  const forMetric = records.filter((r) => r.platform === platform && r.metric === metric);
  if (forMetric.length === 0) return [];
  const latestStart = forMetric.reduce((max, r) => (r.window_start > max ? r.window_start : max), forMetric[0].window_start);
  return forMetric
    .filter((r) => r.window_start === latestStart)
    .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
}

export function snapshotForWindow(records: UsageRecord[], platform: string, window: WindowMeta): WindowSnapshot {
  const metric = metricFor(window);
  const series = latestWindowRecords(records, platform, metric);
  const latest = series.length > 0 ? series[series.length - 1] : null;
  return {
    window,
    latest,
    series,
    usedPercent: latest ? latest.value : null,
    resetAt: latest ? latest.window_end : null,
    lastFetchedAt: latest ? latest.fetched_at : null,
  };
}

/** All past (non-current) windows for a metric, one representative (peak) record per window, most recent first. */
export function pastWindowPeaks(records: UsageRecord[], platform: string, window: WindowMeta, excludeWindowStart: string | null): { windowStart: string; peak: number }[] {
  const metric = metricFor(window);
  const forMetric = records.filter((r) => r.platform === platform && r.metric === metric && r.window_start !== excludeWindowStart);
  const byWindow = new Map<string, number>();
  for (const r of forMetric) {
    const cur = byWindow.get(r.window_start) ?? 0;
    if (r.value > cur) byWindow.set(r.window_start, r.value);
  }
  return [...byWindow.entries()]
    .map(([windowStart, peak]) => ({ windowStart, peak }))
    .sort((a, b) => b.windowStart.localeCompare(a.windowStart))
    .slice(0, 8)
    .reverse();
}

/** For $-pool style platforms (currently Vercel): latest cost record + included-usd cap record. */
export function poolSnapshot(records: UsageRecord[], platform: string) {
  const costRecords = records
    .filter((r) => r.platform === platform && r.metric === "billing_period_cost")
    .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
  const capRecord = records.find((r) => r.platform === platform && r.metric === "billing_period_included_usd") ?? null;
  const latest = costRecords.length > 0 ? costRecords[costRecords.length - 1] : null;
  const cap = capRecord ? capRecord.value : null;
  const usedPercent = latest && cap ? Math.min(100, (latest.value / cap) * 100) : null;
  return { latest, series: costRecords, cap, usedPercent };
}

export function isPoolPlatform(meta: PlatformMeta): boolean {
  return meta.dataMode === "pool";
}

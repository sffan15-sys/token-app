/**
 * Minimal real alert derivation from live usage records + collector_errors,
 * replacing the hand-authored MOCK_ALERTS. No baseline/burn-rate engine
 * exists yet (per CLAUDE.md Step 3/4, "Not started" — a proper anomaly
 * engine is future work), so this only covers what can be computed
 * directly from current snapshots without history/baselines:
 *
 *   - approaching_limit: current window >=70% (warning) / >=90% (critical)
 *   - collector_stale: platform's most recent reading is older than its
 *     expected cadence (reuses lib/status.ts's existing staleness logic)
 *   - a passthrough alert per recent collector_errors row, so a broken
 *     collector (bad token, endpoint shape change, etc) is visible instead
 *     of silently missing data
 */
import type { CollectorErrorRow } from "./api";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "./selectors";
import { statusForUsage } from "./status";
import type { Alert, PlatformMeta, UsageRecord } from "../types";

function severityForPercent(pct: number): Alert["severity"] {
  return pct >= 90 ? "critical" : "warning";
}

export function deriveAlerts(platforms: PlatformMeta[], records: UsageRecord[], errors: CollectorErrorRow[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const meta of platforms) {
    const cadence = meta.tier === "manual" ? "slow" : "live";

    if (isPoolPlatform(meta)) {
      const snap = poolSnapshot(records, meta.id);
      const status = statusForUsage(snap.usedPercent, snap.latest?.fetched_at ?? null, cadence);
      if (status === "watch" || status === "hot") {
        alerts.push({
          id: `approaching_limit-${meta.id}-pool`,
          platform: meta.id,
          severity: severityForPercent(snap.usedPercent ?? 0),
          kind: "approaching_limit",
          message: `${meta.label} billing period at ${snap.usedPercent?.toFixed(0)}% of included usage.`,
          created_at: snap.latest?.fetched_at ?? now,
          active: true,
        });
      }
      if (status === "stale") {
        alerts.push({
          id: `collector_stale-${meta.id}-pool`,
          platform: meta.id,
          severity: "serious",
          kind: "collector_stale",
          message: `${meta.label} has no logged reading recently — data may be stale, not necessarily a real outage.`,
          created_at: now,
          active: true,
        });
      }
      continue;
    }

    for (const window of meta.windows) {
      const snap = snapshotForWindow(records, meta.id, window);
      const status = statusForUsage(snap.usedPercent, snap.lastFetchedAt, cadence);
      if (status === "watch" || status === "hot") {
        alerts.push({
          id: `approaching_limit-${meta.id}-${window.key}`,
          platform: meta.id,
          severity: severityForPercent(snap.usedPercent ?? 0),
          kind: "approaching_limit",
          message: `${meta.label} ${window.label} window at ${snap.usedPercent?.toFixed(0)}% used.`,
          created_at: snap.lastFetchedAt ?? now,
          active: true,
        });
      }
      if (status === "stale") {
        alerts.push({
          id: `collector_stale-${meta.id}-${window.key}`,
          platform: meta.id,
          severity: "serious",
          kind: "collector_stale",
          message: `${meta.label} ${window.label} window has no recent reading — collector may be broken or, for manual-log platforms, just overdue.`,
          created_at: now,
          active: true,
        });
      }
    }
  }

  for (const err of errors) {
    alerts.push({
      id: `collector_error-${err.id}`,
      platform: err.platform,
      severity: err.kind.startsWith("http_") || err.kind === "missing_token" || err.kind === "missing_credential" ? "serious" : "info",
      kind: "collector_stale",
      message: `${err.platform} collector error (${err.kind}): ${err.message}`,
      created_at: err.occurred_at,
      active: true,
    });
  }

  return alerts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

import { Link } from "react-router-dom";
import { UsageBar } from "./UsageBar";
import { StatusPill } from "./StatusPill";
import { derivePlatformCost, formatCostForTable } from "../lib/costs";
import { formatDuration, formatRelativeTime } from "../lib/format";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { statusForUsage, worstStatus } from "../lib/status";
import type { PlatformMeta, UsageRecord } from "../types";

interface Row {
  meta: PlatformMeta;
  status: ReturnType<typeof statusForUsage>;
  statusText: string | null;
  primaryLabel: string;
  primaryPercent: number | null;
  primaryText: string | null;
  primaryStatus: ReturnType<typeof statusForUsage>;
  secondaryLabel: string | null;
  secondaryPercent: number | null;
  secondaryText: string | null;
  secondaryStatus: ReturnType<typeof statusForUsage> | null;
  resetText: string;
  lastLoggedText: string | null;
  platformNote: string | null;
  monthlyCostText: string;
}

function buildRow(meta: PlatformMeta, records: UsageRecord[]): Row {
  const cadence = meta.tier === "manual" ? "slow" : "live";
  const monthlyCostText = formatCostForTable(
    derivePlatformCost(meta, records)
  );

  if (meta.dataMode === "unavailable") {
    return {
      meta,
      status: "stale",
      statusText: "Not connected",
      primaryLabel: "Availability",
      primaryPercent: null,
      primaryText: "No API available on individual plans",
      primaryStatus: "stale",
      secondaryLabel: null,
      secondaryPercent: null,
      secondaryText: "Team Admin API only",
      secondaryStatus: null,
      resetText: "—",
      lastLoggedText: null,
      platformNote: meta.connectionNote ?? null,
      monthlyCostText,
    };
  }

  if (meta.dataMode === "quota") {
    const platformRecords = records
      .filter((record) => record.platform === meta.id && record.metric.startsWith("quota."))
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
    const latest = platformRecords[0] ?? null;
    const latestMetrics = new Set(platformRecords.map((record) => record.metric)).size;
    const status = statusForUsage(latest ? 0 : null, latest?.fetched_at ?? null, "live");
    return {
      meta,
      status,
      statusText: latest ? "Collector active" : "No data yet",
      primaryLabel: "Quota metrics",
      primaryPercent: null,
      primaryText: latest
        ? `${latestMetrics} quota metric${latestMetrics === 1 ? "" : "s"}`
        : "No quota readings",
      primaryStatus: status,
      secondaryLabel: null,
      secondaryPercent: null,
      secondaryText: latest
        ? `${latest.value.toLocaleString()} ${latest.unit}`
        : "Run the Gemini collector",
      secondaryStatus: null,
      resetText: latest ? formatRelativeTime(latest.fetched_at) : "—",
      lastLoggedText: null,
      platformNote: meta.connectionNote ?? null,
      monthlyCostText,
    };
  }

  if (isPoolPlatform(meta)) {
    const snap = poolSnapshot(records, meta.id);
    const status = statusForUsage(snap.usedPercent, snap.latest?.fetched_at ?? null, cadence);
    return {
      meta,
      status,
      statusText: null,
      primaryLabel: meta.windows[0].label,
      primaryPercent: snap.usedPercent,
      primaryText: null,
      primaryStatus: status,
      secondaryLabel: null,
      secondaryPercent: null,
      secondaryText: null,
      secondaryStatus: null,
      resetText: "—",
      lastLoggedText: snap.latest ? formatRelativeTime(snap.latest.fetched_at) : "no data",
      platformNote: null,
      monthlyCostText,
    };
  }

  const primaryWindow = meta.windows[0];
  const primarySnap = snapshotForWindow(records, meta.id, primaryWindow);
  const primaryStatus = statusForUsage(primarySnap.usedPercent, primarySnap.lastFetchedAt, cadence);

  const secondaryWindow = meta.windows[1];
  const secondarySnap = secondaryWindow ? snapshotForWindow(records, meta.id, secondaryWindow) : null;
  const secondaryStatus = secondarySnap
    ? statusForUsage(secondarySnap.usedPercent, secondarySnap.lastFetchedAt, cadence)
    : null;

  const status = worstStatus(secondaryStatus ? [primaryStatus, secondaryStatus] : [primaryStatus]);

  // Time-to-reset shown for whichever window is currently driving the badge.
  const driving = secondaryStatus && secondaryStatus !== "stale" && secondarySnap &&
    (primaryStatus === "stale" || secondaryStatus !== primaryStatus ? secondaryStatus === status : false)
    ? { snap: secondarySnap, label: secondaryWindow!.label }
    : { snap: primarySnap, label: primaryWindow.label };
  const resetAt = driving.snap.resetAt;
  const isFuture = resetAt ? new Date(resetAt).getTime() > Date.now() : false;
  const resetText = resetAt
    ? isFuture
      ? `${formatDuration(new Date(resetAt).getTime() - Date.now())} (${driving.label})`
      : `ended ${formatRelativeTime(resetAt)}`
    : "—";

  return {
    meta,
    status,
    statusText: null,
    primaryLabel: primaryWindow.label,
    primaryPercent: primarySnap.usedPercent,
    primaryText: null,
    primaryStatus,
    secondaryLabel: secondaryWindow?.label ?? null,
    secondaryPercent: secondarySnap?.usedPercent ?? null,
    secondaryText: null,
    secondaryStatus,
    resetText,
    lastLoggedText: meta.tier === "manual" ? (primarySnap.lastFetchedAt ? formatRelativeTime(primarySnap.lastFetchedAt) : "not logged") : null,
    platformNote: null,
    monthlyCostText,
  };
}

const SWATCH_VAR: Record<PlatformMeta["color"], string> = {
  blue: "--series-blue",
  orange: "--series-orange",
  aqua: "--series-aqua",
  violet: "--series-violet",
};

/**
 * Primary platform overview: one row per platform, columns scannable in
 * under 2 seconds — status chip + inline bars instead of prose sentences.
 * Replaces the card grid per owner's explicit "columns and rows, bars not
 * text" ask. See design/ux-brainstorm.md.
 */
export function PlatformTable({ platforms, records }: { platforms: PlatformMeta[]; records: UsageRecord[] }) {
  const rows = platforms.map((meta) => buildRow(meta, records));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)" }}>
            {["Platform", "Status", "Primary usage", "Secondary / details", "Reset / updated", "Monthly cost"].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.meta.id}
              className="transition-colors hover:bg-[var(--surface-raised)]"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <td className="px-4 py-3">
                <Link to={`/platform/${row.meta.id}`} className="flex items-center gap-2 font-medium" style={{ color: "var(--text-primary)" }}>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: `var(${SWATCH_VAR[row.meta.color]})` }}
                  />
                  {row.meta.label}
                </Link>
                {row.lastLoggedText && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    logged {row.lastLoggedText}
                  </div>
                )}
                {row.platformNote && (
                  <div className="mt-0.5 max-w-52 text-xs" style={{ color: "var(--text-muted)" }}>
                    {row.platformNote}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={row.status} text={row.statusText ?? undefined} />
              </td>
              <td className="px-4 py-3">
                {row.primaryText ? (
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {row.primaryText}
                  </span>
                ) : (
                  <UsageBar percent={row.primaryPercent} status={row.primaryStatus} />
                )}
              </td>
              <td className="px-4 py-3">
                {row.secondaryText ? (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {row.secondaryText}
                  </span>
                ) : row.secondaryLabel ? (
                  <UsageBar percent={row.secondaryPercent} status={row.secondaryStatus ?? "stale"} />
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    n/a
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular text-xs" style={{ color: "var(--text-secondary)" }}>
                {row.resetText}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular text-xs" style={{ color: "var(--text-secondary)" }}>
                {row.monthlyCostText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

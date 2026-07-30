import { Link } from "react-router-dom";
import { UsageBar } from "./UsageBar";
import { StatusPill } from "./StatusPill";
import { formatDuration, formatRelativeTime } from "../lib/format";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { statusForUsage, worstStatus } from "../lib/status";
import type { PlatformMeta, UsageRecord } from "../types";

interface Row {
  meta: PlatformMeta;
  status: ReturnType<typeof statusForUsage>;
  primaryLabel: string;
  primaryPercent: number | null;
  primaryStatus: ReturnType<typeof statusForUsage>;
  secondaryLabel: string | null;
  secondaryPercent: number | null;
  secondaryStatus: ReturnType<typeof statusForUsage> | null;
  resetText: string;
  lastLoggedText: string | null;
  monthlyCostUsd: number | null;
}

function buildRow(meta: PlatformMeta, records: UsageRecord[]): Row {
  const cadence = meta.tier === "manual" ? "slow" : "live";

  if (isPoolPlatform(meta)) {
    const snap = poolSnapshot(records, meta.id);
    const status = statusForUsage(snap.usedPercent, snap.latest?.fetched_at ?? null, cadence);
    return {
      meta,
      status,
      primaryLabel: meta.windows[0].label,
      primaryPercent: snap.usedPercent,
      primaryStatus: status,
      secondaryLabel: null,
      secondaryPercent: null,
      secondaryStatus: null,
      resetText: "—",
      lastLoggedText: snap.latest ? formatRelativeTime(snap.latest.fetched_at) : "no data",
      monthlyCostUsd: meta.monthlyCostUsd ?? null,
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
    primaryLabel: primaryWindow.label,
    primaryPercent: primarySnap.usedPercent,
    primaryStatus,
    secondaryLabel: secondaryWindow?.label ?? null,
    secondaryPercent: secondarySnap?.usedPercent ?? null,
    secondaryStatus,
    resetText,
    lastLoggedText: meta.tier === "manual" ? (primarySnap.lastFetchedAt ? formatRelativeTime(primarySnap.lastFetchedAt) : "not logged") : null,
    monthlyCostUsd: meta.monthlyCostUsd ?? null,
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
            {["Platform", "Status", "5hr / primary", "Weekly / secondary", "Reset in", "Monthly cost"].map((h) => (
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
              </td>
              <td className="px-4 py-3">
                <StatusPill status={row.status} />
              </td>
              <td className="px-4 py-3">
                <UsageBar percent={row.primaryPercent} status={row.primaryStatus} />
              </td>
              <td className="px-4 py-3">
                {row.secondaryLabel ? (
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
                {row.monthlyCostUsd !== null ? `$${row.monthlyCostUsd}/mo` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

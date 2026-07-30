import { Link } from "react-router-dom";
import { Gauge } from "./Gauge";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";
import { formatDuration, formatPercent, formatRelativeTime } from "../lib/format";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { statusForUsage, worstStatus } from "../lib/status";
import type { PlatformMeta, UsageRecord } from "../types";

const SERIES_VAR: Record<PlatformMeta["color"], string> = {
  blue: "--series-blue",
  orange: "--series-orange",
  aqua: "--series-aqua",
  violet: "--series-violet",
};

function verdict(usedPercent: number | null, resetAt: string | null, status: string): string {
  if (usedPercent === null) return "No data yet — log a reading to get started.";
  if (status === "stale") return "No recent data — collector may be stale.";
  const isFuture = resetAt ? new Date(resetAt).getTime() > Date.now() : false;
  const resetText = resetAt
    ? isFuture
      ? `resets ${formatRelativeTime(resetAt)}`
      : `window ended ${formatRelativeTime(resetAt)}`
    : "";
  if (usedPercent < 15) return `Fresh window, plenty of headroom${resetText ? `, ${resetText}` : ""}.`;
  if (usedPercent >= 90) return `${formatPercent(usedPercent)} used — close to the limit${resetText ? `, ${resetText}` : ""}.`;
  return `${formatPercent(usedPercent)} used${resetText ? `, ${resetText}` : ""}.`;
}

export function PlatformCard({ meta, records }: { meta: PlatformMeta; records: UsageRecord[] }) {
  const seriesColor = `var(${SERIES_VAR[meta.color]})`;
  const pooled = isPoolPlatform(meta);

  if (meta.dataMode === "unavailable") {
    return (
      <Link
        to={`/platform/${meta.id}`}
        className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--border-strong)]"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {meta.label}
          </div>
          <StatusPill status="stale" text="Not connected" />
        </div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {meta.connectionNote ?? "No API integration is available."}
        </div>
      </Link>
    );
  }

  if (meta.dataMode === "quota") {
    const platformRecords = records
      .filter((record) => record.platform === meta.id && record.metric.startsWith("quota."))
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
    const latest = platformRecords[0] ?? null;
    const status = statusForUsage(latest ? 0 : null, latest?.fetched_at ?? null, "live");
    const metricCount = new Set(platformRecords.map((record) => record.metric)).size;
    return (
      <Link
        to={`/platform/${meta.id}`}
        className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--border-strong)]"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {meta.label}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Google Cloud Monitoring quota metrics
            </div>
          </div>
          <StatusPill status={status} text={latest ? "Collector active" : "No data yet"} />
        </div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {latest
            ? `${metricCount} quota metric${metricCount === 1 ? "" : "s"} · updated ${formatRelativeTime(latest.fetched_at)}`
            : "No quota readings yet — run the Gemini collector."}
        </div>
      </Link>
    );
  }

  if (pooled) {
    const snap = poolSnapshot(records, meta.id);
    const status = statusForUsage(snap.usedPercent, snap.latest?.fetched_at ?? null, "slow");
    const sparkData = snap.series.slice(-12).map((r) => ({ fetched_at: r.fetched_at, value: r.value }));
    return (
      <Link
        to={`/platform/${meta.id}`}
        className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--border-strong)]"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {meta.label}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {meta.tier === "manual" ? "Manual log" : "Auto-synced"}
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="flex items-center gap-4">
          <Gauge percent={snap.usedPercent} status={status} size={80} strokeWidth={7} />
          <div className="flex-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {snap.latest ? (
              <>
                <div className="tabular">
                  ${snap.latest.value.toFixed(2)} of ${snap.cap?.toFixed(0) ?? "—"} used
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  last logged {formatRelativeTime(snap.latest.fetched_at)}
                </div>
              </>
            ) : (
              <div>No spend logged yet</div>
            )}
          </div>
        </div>

        {meta.tier === "manual" ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {snap.series.length} logged reading{snap.series.length === 1 ? "" : "s"} — sparse data, chart lives in detail view
          </div>
        ) : (
          sparkData.length >= 2 && <Sparkline data={sparkData} color={seriesColor} unit="$" />
        )}
      </Link>
    );
  }

  const primaryWindow = meta.windows[0];
  const snap = snapshotForWindow(records, meta.id, primaryWindow);
  const cadence = meta.tier === "manual" ? "slow" : "live";
  const primaryStatus = statusForUsage(snap.usedPercent, snap.lastFetchedAt, cadence);
  const sparkData = snap.series.slice(-15).map((r) => ({ fetched_at: r.fetched_at, value: r.value }));
  const secondaryWindow = meta.windows[1];
  const secondarySnap = secondaryWindow ? snapshotForWindow(records, meta.id, secondaryWindow) : null;
  const secondaryStatus = secondarySnap
    ? statusForUsage(secondarySnap.usedPercent, secondarySnap.lastFetchedAt, cadence)
    : null;
  // Card badge reflects whichever active window is most constrained, not just
  // the primary one — a tight weekly cap shouldn't hide behind a healthy
  // 5-hour badge. See lib/status.ts worstStatus + research/codex-critique.md #3.
  const status = worstStatus(secondaryStatus ? [primaryStatus, secondaryStatus] : [primaryStatus]);

  return (
    <Link
      to={`/platform/${meta.id}`}
      className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--border-strong)]"
      style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {meta.label}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {primaryWindow.label} window
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="flex items-center gap-4">
        <Gauge percent={snap.usedPercent} status={status} size={80} strokeWidth={7} />
        <div className="flex-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {verdict(snap.usedPercent, snap.resetAt, status)}
        </div>
      </div>

      {meta.tier === "manual" ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {snap.lastFetchedAt ? `Last logged ${formatRelativeTime(snap.lastFetchedAt)}` : "Not logged yet"}
        </div>
      ) : (
        sparkData.length >= 2 && <Sparkline data={sparkData} color={seriesColor} />
      )}

      {secondarySnap && (
        <div
          className="flex items-center justify-between border-t pt-2 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span>{secondaryWindow!.label}</span>
          <span className="tabular">
            {secondarySnap.usedPercent !== null ? formatPercent(secondarySnap.usedPercent) : "—"}
            {secondarySnap.resetAt ? ` · resets in ${formatDuration(new Date(secondarySnap.resetAt).getTime() - Date.now())}` : ""}
          </span>
        </div>
      )}
    </Link>
  );
}

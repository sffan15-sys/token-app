import { Link, useParams } from "react-router-dom";
import { Gauge } from "../components/Gauge";
import { StatusPill } from "../components/StatusPill";
import { UsageHistoryChart } from "../components/UsageHistoryChart";
import { EfficiencyBars } from "../components/EfficiencyBars";
import { MOCK_USAGE_RECORDS, PLATFORMS } from "../data/mockData";
import { formatDuration, formatRelativeTime, formatShortTime } from "../lib/format";
import { isPoolPlatform, pastWindowPeaks, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { statusForUsage } from "../lib/status";

const SERIES_VAR: Record<string, string> = {
  blue: "--series-blue",
  orange: "--series-orange",
  aqua: "--series-aqua",
  violet: "--series-violet",
};

export function PlatformDetail() {
  const { platformId } = useParams<{ platformId: string }>();
  const meta = PLATFORMS.find((p) => p.id === platformId);

  if (!meta) {
    return (
      <div className="p-6">
        <p>Unknown platform.</p>
        <Link to="/" className="underline">
          Back home
        </Link>
      </div>
    );
  }

  const color = `var(${SERIES_VAR[meta.color]})`;
  const pooled = isPoolPlatform(meta);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link to="/" className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← Home
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {meta.label}
          </h1>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {meta.tier === "manual" ? "Manual log source" : "Auto-synced collector"}
          </span>
        </div>
      </div>

      {pooled ? (
        <PoolDetail platformId={meta.id} color={color} />
      ) : (
        <div className="flex flex-col gap-6">
          {meta.windows.map((w) => {
            const snap = snapshotForWindow(MOCK_USAGE_RECORDS, meta.id, w);
            const status = statusForUsage(snap.usedPercent, snap.lastFetchedAt, meta.tier === "manual" ? "slow" : "live");
            const chartData = snap.series.map((r) => ({ fetched_at: r.fetched_at, value: r.value }));
            const pastPeaks = pastWindowPeaks(MOCK_USAGE_RECORDS, meta.id, w, snap.latest?.window_start ?? null).map((p) => ({
              windowStart: p.windowStart,
              peak: p.peak,
            }));

            return (
              <section key={w.key} className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {w.label} window
                  </h2>
                  <StatusPill status={status} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-6">
                  <Gauge percent={snap.usedPercent} status={status} size={110} strokeWidth={9} />
                  <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <div>
                      {snap.resetAt ? (
                        <>
                          Resets <span className="tabular font-medium">{formatRelativeTime(snap.resetAt)}</span>
                        </>
                      ) : (
                        "No active window data"
                      )}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {snap.lastFetchedAt ? `Last reading ${formatRelativeTime(snap.lastFetchedAt)}` : "No readings yet"}
                    </div>
                  </div>
                </div>

                {chartData.length >= 2 ? (
                  <div className="mt-4">
                    <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Usage this window
                    </div>
                    <UsageHistoryChart data={chartData} color={color} />
                  </div>
                ) : (
                  <div className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    Not enough readings yet to chart — trend charting unlocks once more data accumulates.
                  </div>
                )}

                {pastPeaks.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Peak usage per past window (waste check)
                    </div>
                    <EfficiencyBars data={pastPeaks} />
                  </div>
                )}
              </section>
            );
          })}

          <RawReadingsTable platformId={meta.id} />
        </div>
      )}
    </div>
  );
}

function PoolDetail({ platformId, color }: { platformId: string; color: string }) {
  const snap = poolSnapshot(MOCK_USAGE_RECORDS, platformId);
  const status = statusForUsage(snap.usedPercent, snap.latest?.fetched_at ?? null, "slow");
  const chartData = snap.series.map((r) => ({ fetched_at: r.fetched_at, value: r.value }));

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Billing period
          </h2>
          <StatusPill status={status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <Gauge percent={snap.usedPercent} status={status} size={110} strokeWidth={9} />
          <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            <div className="tabular">
              ${snap.latest?.value.toFixed(2) ?? "0.00"} of ${snap.cap?.toFixed(0) ?? "—"} included usage spent
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {snap.latest ? `Last logged ${formatRelativeTime(snap.latest.fetched_at)}` : "No spend logged yet"}
            </div>
          </div>
        </div>

        {chartData.length >= 2 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Spend over billing period
            </div>
            <UsageHistoryChart
              data={chartData.map((d) => ({ ...d, value: snap.cap ? Math.min(100, (d.value / snap.cap) * 100) : 0 }))}
              color={color}
            />
          </div>
        )}
      </section>
      <RawReadingsTable platformId={platformId} />
    </div>
  );
}

function RawReadingsTable({ platformId }: { platformId: string }) {
  const rows = MOCK_USAGE_RECORDS.filter((r) => r.platform === platformId)
    .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))
    .slice(0, 20);

  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Recent readings
        </h2>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Debug view — checkable if a best-effort collector's shape changes
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="py-1 pr-4 font-normal">Metric</th>
              <th className="py-1 pr-4 font-normal">Value</th>
              <th className="py-1 pr-4 font-normal">Fetched</th>
              <th className="py-1 font-normal">Window ends</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 pr-4" style={{ color: "var(--text-secondary)" }}>
                  {r.metric}
                </td>
                <td className="py-1 pr-4 tabular" style={{ color: "var(--text-primary)" }}>
                  {r.value}
                  {r.unit === "percent" ? "%" : r.unit === "usd" ? " USD" : ""}
                </td>
                <td className="py-1 pr-4 tabular" style={{ color: "var(--text-muted)" }}>
                  {formatShortTime(r.fetched_at)}
                </td>
                <td className="py-1 tabular" style={{ color: "var(--text-muted)" }}>
                  {formatDuration(new Date(r.window_end).getTime() - Date.now())}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center" style={{ color: "var(--text-muted)" }}>
                  No readings recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

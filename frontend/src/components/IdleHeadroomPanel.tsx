import { Link } from "react-router-dom";
import { PLATFORMS } from "../data/mockData";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { formatPercent } from "../lib/format";
import type { UsageRecord } from "../types";

const HEADROOM_THRESHOLD = 40; // usedPercent below this = "healthy headroom"

/**
 * "Paid-for-and-idle right now" rollup — CLAUDE.md calls this out
 * explicitly as a goal (route the next task to what's already paid
 * for instead of a metered platform). A filtered chip list, not a
 * chart, per design/ux-brainstorm.md — it's a fast yes/no answer.
 */
export function IdleHeadroomPanel({ records }: { records: UsageRecord[] }) {
  const candidates = PLATFORMS.map((meta) => {
    if (isPoolPlatform(meta)) {
      const snap = poolSnapshot(records, meta.id);
      return { meta, usedPercent: snap.usedPercent };
    }
    const snap = snapshotForWindow(records, meta.id, meta.windows[0]);
    return { meta, usedPercent: snap.usedPercent };
  }).filter((c) => c.usedPercent !== null && c.usedPercent < HEADROOM_THRESHOLD);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Paid-for and idle right now
      </div>
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Route your next task here before burning a metered platform.
      </div>
      {candidates.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing has meaningful headroom right now.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <Link
              key={c.meta.id}
              to={`/platform/${c.meta.id}`}
              className="rounded-full border px-3 py-1 text-xs font-medium tabular"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              {c.meta.label} · {formatPercent(c.usedPercent!)} used
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

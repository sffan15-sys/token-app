import { PLATFORMS } from "../data/mockData";
import { isPoolPlatform, poolSnapshot } from "../lib/selectors";
import type { UsageRecord } from "../types";

/**
 * "Flat subscriptions + metered spend so far this period" rollup.
 * Closes the owner's own named gap (design/critique-claude.md 2.1,
 * research/codex-critique.md #2): the app had gauges for allowance
 * consumption but no dollar figure for what the whole stack actually costs.
 */
export function CostSummary({ records }: { records: UsageRecord[] }) {
  const flatTotal = PLATFORMS.reduce((sum, p) => sum + (p.monthlyCostUsd ?? 0), 0);
  const meteredTotal = PLATFORMS.reduce((sum, p) => {
    if (!isPoolPlatform(p)) return sum;
    const snap = poolSnapshot(records, p.id);
    return sum + (snap.latest?.value ?? 0);
  }, 0);
  const total = flatTotal + meteredTotal;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        This month's AI spend
      </div>
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Flat subscriptions + metered usage billed so far this period, across all platforms.
      </div>
      <div className="flex items-end gap-2 mb-3">
        <div className="text-3xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
          ${total.toFixed(2)}
        </div>
        <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          / mo (est.)
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Flat subscriptions:</span>{" "}
          <span className="tabular">${flatTotal.toFixed(2)}</span>
        </span>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Metered so far:</span>{" "}
          <span className="tabular">${meteredTotal.toFixed(2)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        {PLATFORMS.map((p) => {
          const metered = isPoolPlatform(p) ? poolSnapshot(records, p.id).latest?.value ?? null : null;
          return (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{p.label}</span>
              <span className="tabular" style={{ color: "var(--text-muted)" }}>
                {p.monthlyCostUsd ? `$${p.monthlyCostUsd.toFixed(0)}/mo` : "usage-based"}
                {metered !== null ? ` + $${metered.toFixed(2)} used` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

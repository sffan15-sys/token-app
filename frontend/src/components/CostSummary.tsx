import { PLATFORMS } from "../data/mockData";
import { deriveCostSummary } from "../lib/costs";
import type { UsageRecord } from "../types";

/**
 * Known-cost rollup only. Every included dollar comes from either a
 * source-reported subscription plan with one unambiguous public list price,
 * or real billing charges collected from the provider. Unknown platforms are
 * shown explicitly and never silently treated as $0.
 */
export function CostSummary({ records }: { records: UsageRecord[] }) {
  const summary = deriveCostSummary(PLATFORMS, records);

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <div
        className="text-sm font-semibold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        This month's known spend
      </div>
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Automatically detected subscriptions plus real billed charges. Unknown
        costs are excluded.
      </div>
      <div className="flex items-end gap-2 mb-3">
        <div
          className="text-3xl font-semibold tabular"
          style={{ color: "var(--text-primary)" }}
        >
          ${summary.knownTotal.toFixed(2)}
        </div>
        <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          known so far
        </div>
      </div>
      <div
        className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>
          <span style={{ color: "var(--text-muted)" }}>
            Detected subscriptions:
          </span>{" "}
          <span className="tabular">
            ${summary.subscriptionTotal.toFixed(2)}
          </span>
        </span>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Billed charges:</span>{" "}
          <span className="tabular">${summary.billedTotal.toFixed(2)}</span>
        </span>
      </div>
      {summary.unknown.length > 0 && (
        <div className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Excludes {summary.unknown.length} platform
          {summary.unknown.length === 1 ? "" : "s"} with no automatically
          verifiable cost.
        </div>
      )}
      <div
        className="flex flex-col gap-2 border-t pt-2"
        style={{ borderColor: "var(--border)" }}
      >
        {PLATFORMS.map((platform) => {
          const cost = summary.costs.find(
            (entry) => entry.platformId === platform.id
          )!;
          const value =
            cost.amountUsd !== null
              ? cost.kind === "subscription"
                ? `$${cost.amountUsd.toFixed(2)}/mo`
                : `$${cost.amountUsd.toFixed(2)} billed`
              : cost.status === "not_connected"
                ? "Not connected"
                : "Cost unknown";
          const showLabel =
            cost.label !== "Cost unknown" && cost.label !== "Not connected";

          return (
            <div
              key={platform.id}
              className="flex items-start justify-between gap-4 text-xs"
            >
              <span style={{ color: "var(--text-secondary)" }}>
                {platform.label}
              </span>
              <span
                className="max-w-[70%] text-right"
                style={{ color: "var(--text-muted)" }}
              >
                <span className="tabular">{value}</span>
                {showLabel ? ` · ${cost.label}` : ""}
                <span className="block">{cost.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

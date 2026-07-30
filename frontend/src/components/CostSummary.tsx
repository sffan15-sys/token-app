import { Link } from "react-router-dom";
import { PLATFORMS } from "../data/mockData";
import { deriveCostSummary } from "../lib/costs";
import { deriveWasteSummary, type PlatformWasteEstimate } from "../lib/waste";
import type { PlanSelections, UsageRecord } from "../types";

function wasteValue(estimate: PlatformWasteEstimate): string {
  if (
    estimate.status === "window_proxy" ||
    estimate.status === "credit_forecast"
  ) {
    return estimate.label;
  }
  if (estimate.status === "not_applicable") return "$0 at risk";
  return estimate.label;
}

/**
 * Spend and unused value belong together, but the estimate deliberately keeps
 * provider-specific units: completed window percentages for Claude/Codex,
 * Vercel's published dollar credit, and explicit unmeasurable states elsewhere.
 */
export function CostSummary({
  records,
  historyRecords,
  planSelections = {},
}: {
  records: UsageRecord[];
  historyRecords: UsageRecord[];
  planSelections?: PlanSelections;
}) {
  const summary = deriveCostSummary(PLATFORMS, records, planSelections);
  const waste = deriveWasteSummary(
    PLATFORMS,
    historyRecords,
    summary.costs,
    planSelections
  );

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            This month's known spend
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Selected or detected plans plus real billed charges. Unknown costs
            are excluded.
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div
              className="text-3xl font-semibold tabular"
              style={{ color: "var(--text-primary)" }}
            >
              ${summary.knownTotal.toFixed(2)}
            </div>
            <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
              known so far
            </div>
          </div>
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            ${summary.subscriptionTotal.toFixed(2)} subscriptions · $
            {summary.billedTotal.toFixed(2)} billed
          </div>
        </div>

        <div>
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Unused value estimate
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Honest proxies only—never an invented token allowance.
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div
              className="text-3xl font-semibold tabular"
              style={{ color: "var(--text-primary)" }}
            >
              {waste.measurableCount > 0
                ? `~$${waste.estimatedUnusedTotal.toFixed(2)}`
                : "—"}
            </div>
            <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
              likely unused
            </div>
          </div>
          <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {waste.measurableCount} measurable · {waste.notMeasurableCount} not
            yet measurable
            {waste.needsPlanCount > 0
              ? ` · ${waste.needsPlanCount} need a plan`
              : ""}
          </div>
        </div>
      </div>

      {(summary.unknown.length > 0 || waste.needsPlanCount > 0) && (
        <div className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link
            to="/settings"
            className="font-medium underline underline-offset-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Choose plans in Settings
          </Link>{" "}
          to fill missing costs. A selected plan can override automatic
          detection.
        </div>
      )}

      <div
        className="mt-4 flex flex-col border-t"
        style={{ borderColor: "var(--border)" }}
      >
        {PLATFORMS.map((platform) => {
          const cost = summary.costs.find(
            (entry) => entry.platformId === platform.id
          )!;
          const estimate = waste.estimates.find(
            (entry) => entry.platformId === platform.id
          )!;
          const costValue =
            cost.amountUsd !== null
              ? cost.kind === "subscription"
                ? `$${cost.amountUsd.toFixed(2)}/mo`
                : `$${cost.amountUsd.toFixed(2)} billed`
              : cost.status === "not_connected"
                ? "Not connected"
                : "Cost unknown";

          return (
            <div
              key={platform.id}
              className="grid gap-2 border-b py-3 text-xs sm:grid-cols-[8rem_1fr_1fr]"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {platform.label}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                <span
                  className="block tabular"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {costValue}
                  {cost.label !== "Cost unknown" &&
                  cost.label !== "Not connected"
                    ? ` · ${cost.label}`
                    : ""}
                </span>
                <span className="block">{cost.detail}</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                <span
                  className="block tabular"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {wasteValue(estimate)}
                </span>
                <span className="block">{estimate.detail}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        “Likely unused” is a monthly value signal, not a refund amount. Window
        estimates use completed observed rate-limit windows; Vercel uses an
        end-of-period credit forecast after enough of the billing period has
        elapsed.
      </p>
    </div>
  );
}

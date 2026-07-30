import { findPlan } from "../data/planCatalog";
import type {
  PlanSelections,
  PlatformMeta,
  UsageRecord,
} from "../types";
import type { DerivedPlatformCost } from "./costs";

export type WasteStatus =
  | "window_proxy"
  | "credit_forecast"
  | "not_measurable"
  | "not_applicable"
  | "needs_plan"
  | "insufficient_data";

export interface PlatformWasteEstimate {
  platformId: string;
  status: WasteStatus;
  amountUsd: number | null;
  unusedPercent: number | null;
  label: string;
  detail: string;
  sampleCount: number;
}

interface MetricWindowAverage {
  metric: string;
  averageUsedPercent: number;
  sampleCount: number;
}

function monthStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * One peak/final observed value per completed provider window. Group by reset
 * timestamp because Claude's statusline payload exposes the end but not the
 * true start of its rolling window.
 */
function completedWindowAverages(
  meta: PlatformMeta,
  records: UsageRecord[],
  now: Date
): MetricWindowAverage[] {
  const periodStart = monthStart(now);
  const nowMs = now.getTime();

  return meta.windows
    .map((window): MetricWindowAverage | null => {
      const metric = `${window.key}_used_percentage`;
      const peaksByEnd = new Map<string, number>();

      for (const record of records) {
        if (
          record.platform !== meta.id ||
          record.metric !== metric ||
          record.unit.toLowerCase() !== "percent"
        ) {
          continue;
        }
        const endMs = new Date(record.window_end).getTime();
        if (
          !Number.isFinite(endMs) ||
          endMs > nowMs ||
          endMs < periodStart ||
          !Number.isFinite(record.value)
        ) {
          continue;
        }
        const value = Math.max(0, Math.min(100, record.value));
        peaksByEnd.set(
          record.window_end,
          Math.max(peaksByEnd.get(record.window_end) ?? 0, value)
        );
      }

      const peaks = [...peaksByEnd.values()];
      if (peaks.length === 0) return null;
      return {
        metric,
        averageUsedPercent:
          peaks.reduce((sum, value) => sum + value, 0) / peaks.length,
        sampleCount: peaks.length,
      };
    })
    .filter((average): average is MetricWindowAverage => average !== null);
}

function windowWasteEstimate(
  meta: PlatformMeta,
  historyRecords: UsageRecord[],
  cost: DerivedPlatformCost,
  now: Date
): PlatformWasteEstimate {
  if (
    cost.status !== "known" ||
    cost.kind !== "subscription" ||
    cost.amountUsd === null
  ) {
    return {
      platformId: meta.id,
      status: "needs_plan",
      amountUsd: null,
      unusedPercent: null,
      label: "Choose a plan",
      detail:
        "A known monthly price is required before unused value can be estimated.",
      sampleCount: 0,
    };
  }
  if (cost.amountUsd === 0) {
    return {
      platformId: meta.id,
      status: "not_applicable",
      amountUsd: 0,
      unusedPercent: null,
      label: "No paid value at risk",
      detail: "The selected or detected plan is free.",
      sampleCount: 0,
    };
  }

  const averages = completedWindowAverages(meta, historyRecords, now);
  if (averages.length === 0) {
    return {
      platformId: meta.id,
      status: "insufficient_data",
      amountUsd: null,
      unusedPercent: null,
      label: "Waiting for completed windows",
      detail:
        "The estimate starts after at least one observed rate-limit window completes this month.",
      sampleCount: 0,
    };
  }

  // Whichever tracked limit type was more utilized is the conservative plan
  // utilization proxy. This avoids double-counting 5-hour and weekly limits.
  const driving = [...averages].sort(
    (a, b) => b.averageUsedPercent - a.averageUsedPercent
  )[0];
  const unusedPercent = Math.max(0, 100 - driving.averageUsedPercent);
  const amountUsd = cost.amountUsd * (unusedPercent / 100);
  const totalSamples = averages.reduce(
    (sum, average) => sum + average.sampleCount,
    0
  );
  const windowLabel = driving.metric
    .replace("_used_percentage", "")
    .replaceAll("_", "-");

  return {
    platformId: meta.id,
    status: "window_proxy",
    amountUsd,
    unusedPercent,
    label: `~$${amountUsd.toFixed(2)} likely unused`,
    detail:
      `${unusedPercent.toFixed(0)}% unused window-capacity proxy from ${totalSamples} completed observed window${totalSamples === 1 ? "" : "s"}; ` +
      `${windowLabel} was the more-used limit type. Token ceilings are not exposed.`,
    sampleCount: totalSamples,
  };
}

function latestMetric(
  records: UsageRecord[],
  platformId: string,
  metric: string
): UsageRecord | null {
  return (
    records
      .filter(
        (record) =>
          record.platform === platformId && record.metric === metric
      )
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] ?? null
  );
}

function vercelWasteEstimate(
  historyRecords: UsageRecord[],
  planSelections: PlanSelections,
  now: Date
): PlatformWasteEstimate {
  const selectedPlan = findPlan("vercel", planSelections.vercel);
  if (!selectedPlan) {
    return {
      platformId: "vercel",
      status: "needs_plan",
      amountUsd: null,
      unusedPercent: null,
      label: "Select Hobby or Pro",
      detail:
        "Real billed charges remain known, but plan context is needed to tell whether a prepaid usage credit exists.",
      sampleCount: 0,
    };
  }
  if (selectedPlan.monthlyUsd === 0) {
    return {
      platformId: "vercel",
      status: "not_applicable",
      amountUsd: 0,
      unusedPercent: null,
      label: "No prepaid credit",
      detail: "Vercel Hobby has capped free usage rather than a paid bucket.",
      sampleCount: 0,
    };
  }

  const includedUsd = selectedPlan.allowance.includedUsd;
  if (
    selectedPlan.allowance.kind !== "usd_credit" ||
    includedUsd === undefined
  ) {
    return {
      platformId: "vercel",
      status: "not_applicable",
      amountUsd: null,
      unusedPercent: null,
      label: "No public prepaid bucket",
      detail: "This selected plan has no fixed public usage credit to track.",
      sampleCount: 0,
    };
  }

  const usage = latestMetric(
    historyRecords,
    "vercel",
    "billing_period_usage_value"
  );
  if (!usage || usage.unit.toLowerCase() !== "usd") {
    return {
      platformId: "vercel",
      status: "insufficient_data",
      amountUsd: null,
      unusedPercent: null,
      label: "Waiting for usage-value data",
      detail:
        "Run the updated Vercel collector to separate resource usage from seats, credits, tax, and adjustments.",
      sampleCount: 0,
    };
  }

  const startMs = new Date(usage.window_start).getTime();
  const endMs = new Date(usage.window_end).getTime();
  const nowMs = now.getTime();
  const observedMs = new Date(usage.fetched_at).getTime();
  const durationMs = endMs - startMs;
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(observedMs) ||
    durationMs <= 0
  ) {
    return {
      platformId: "vercel",
      status: "insufficient_data",
      amountUsd: null,
      unusedPercent: null,
      label: "Invalid billing period",
      detail: "The collector did not provide a usable billing-period range.",
      sampleCount: 0,
    };
  }
  if (endMs <= monthStart(now) || startMs > nowMs) {
    return {
      platformId: "vercel",
      status: "insufficient_data",
      amountUsd: null,
      unusedPercent: null,
      label: "Waiting for this billing period",
      detail:
        "The latest usage-value reading belongs to a different billing period.",
      sampleCount: 0,
    };
  }

  const elapsedFraction = Math.max(
    0,
    Math.min(1, (Math.min(observedMs, endMs) - startMs) / durationMs)
  );
  const usageValue = Math.max(0, usage.value);
  const currentRemainder = Math.max(0, includedUsd - usageValue);
  if (elapsedFraction < 0.2) {
    return {
      platformId: "vercel",
      status: "insufficient_data",
      amountUsd: null,
      unusedPercent: (currentRemainder / includedUsd) * 100,
      label: `$${currentRemainder.toFixed(2)} credit remains`,
      detail:
        "The end-of-period forecast starts after 20% of the billing period so early-month idle credit is not mislabeled as waste.",
      sampleCount: 1,
    };
  }

  const projectedUsage =
    elapsedFraction >= 1 ? usageValue : usageValue / elapsedFraction;
  const projectedUnused = Math.max(0, includedUsd - projectedUsage);
  const unusedPercent = (projectedUnused / includedUsd) * 100;
  return {
    platformId: "vercel",
    status: "credit_forecast",
    amountUsd: projectedUnused,
    unusedPercent,
    label: `~$${projectedUnused.toFixed(2)} credit likely unused`,
    detail:
      `$${currentRemainder.toFixed(2)} of the $${includedUsd.toFixed(0)} credit remains now; ` +
      `forecast uses current billing-period pace and excludes metered overage from waste.`,
    sampleCount: 1,
  };
}

export function derivePlatformWaste(
  meta: PlatformMeta,
  historyRecords: UsageRecord[],
  cost: DerivedPlatformCost,
  planSelections: PlanSelections = {},
  now = new Date()
): PlatformWasteEstimate {
  if (meta.id === "claude" || meta.id === "codex") {
    return windowWasteEstimate(meta, historyRecords, cost, now);
  }
  if (meta.id === "vercel") {
    return vercelWasteEstimate(historyRecords, planSelections, now);
  }
  if (cost.status !== "known") {
    return {
      platformId: meta.id,
      status: "needs_plan",
      amountUsd: null,
      unusedPercent: null,
      label: "Choose a plan",
      detail: "Plan cost is unknown until it is selected in Settings.",
      sampleCount: 0,
    };
  }
  if (cost.amountUsd === 0) {
    return {
      platformId: meta.id,
      status: "not_applicable",
      amountUsd: 0,
      unusedPercent: null,
      label: "No paid value at risk",
      detail: "The selected plan is free.",
      sampleCount: 0,
    };
  }
  if (meta.id === "gemini") {
    return {
      platformId: meta.id,
      status: "not_measurable",
      amountUsd: null,
      unusedPercent: null,
      label: "Subscription usage not measurable",
      detail:
        "Google Cloud API quota is separate from the selected Google One consumer subscription.",
      sampleCount: 0,
    };
  }
  return {
    platformId: meta.id,
    status: "not_measurable",
    amountUsd: null,
    unusedPercent: null,
    label: "Allowance known; consumption unavailable",
    detail:
      "Cursor publishes included agent-usage value, but individual-plan usage is not connected to this app.",
    sampleCount: 0,
  };
}

export function deriveWasteSummary(
  platforms: PlatformMeta[],
  historyRecords: UsageRecord[],
  costs: DerivedPlatformCost[],
  planSelections: PlanSelections = {},
  now = new Date()
) {
  const estimates = platforms.map((platform) =>
    derivePlatformWaste(
      platform,
      historyRecords,
      costs.find((cost) => cost.platformId === platform.id)!,
      planSelections,
      now
    )
  );
  const measurable = estimates.filter(
    (estimate) =>
      estimate.status === "window_proxy" ||
      estimate.status === "credit_forecast"
  );
  return {
    estimates,
    estimatedUnusedTotal: measurable.reduce(
      (sum, estimate) => sum + (estimate.amountUsd ?? 0),
      0
    ),
    measurableCount: measurable.length,
    notMeasurableCount: estimates.filter(
      (estimate) =>
        estimate.status === "not_measurable" ||
        estimate.status === "insufficient_data"
    ).length,
    needsPlanCount: estimates.filter(
      (estimate) => estimate.status === "needs_plan"
    ).length,
  };
}

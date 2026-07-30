import type { PlatformMeta, UsageRecord } from "../types";

export type CostKind = "subscription" | "billed";
export type CostStatus = "known" | "unknown" | "not_connected";

export interface DerivedPlatformCost {
  platformId: string;
  status: CostStatus;
  kind: CostKind | null;
  amountUsd: number | null;
  label: string;
  detail: string;
  planType: string | null;
}

interface FixedPlanPrice {
  label: string;
  monthlyUsd: number;
}

/**
 * Fixed individual-plan prices from OpenAI's official ChatGPT/Codex pricing
 * page, checked 2026-07-30. Pro now has distinct 5x ($100) and 20x ($200)
 * variants, so only identifiers that explicitly name the variant are safe
 * to price. A bare `pro` value remains unknown.
 */
const FIXED_CODEX_PLAN_PRICES: Record<string, FixedPlanPrice> = {
  free: { label: "Free", monthlyUsd: 0 },
  go: { label: "Go", monthlyUsd: 8 },
  plus: { label: "Plus", monthlyUsd: 20 },
  "pro-5x": { label: "Pro 5x", monthlyUsd: 100 },
  pro_5x: { label: "Pro 5x", monthlyUsd: 100 },
  pro5x: { label: "Pro 5x", monthlyUsd: 100 },
  "pro-20x": { label: "Pro 20x", monthlyUsd: 200 },
  pro_20x: { label: "Pro 20x", monthlyUsd: 200 },
  pro20x: { label: "Pro 20x", monthlyUsd: 200 },
};

function latestRecord(
  records: UsageRecord[],
  predicate: (record: UsageRecord) => boolean
): UsageRecord | null {
  return (
    records
      .filter(predicate)
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] ?? null
  );
}

function latestCodexPlanType(records: UsageRecord[]): string | null {
  const latest = latestRecord(
    records,
    (record) => record.platform === "codex" && Boolean(record.plan_type)
  );
  return latest?.plan_type?.trim().toLowerCase() || null;
}

function deriveCodexCost(records: UsageRecord[]): DerivedPlatformCost {
  const planType = latestCodexPlanType(records);
  if (!planType) {
    return {
      platformId: "codex",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Cost unknown",
      detail: "No source-reported ChatGPT plan has been collected yet.",
      planType: null,
    };
  }

  const fixed = FIXED_CODEX_PLAN_PRICES[planType];
  if (fixed) {
    return {
      platformId: "codex",
      status: "known",
      kind: "subscription",
      amountUsd: fixed.monthlyUsd,
      label: fixed.label,
      detail: `Detected automatically from Codex plan_type: ${planType}.`,
      planType,
    };
  }

  if (planType === "pro") {
    return {
      platformId: "codex",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Pro (variant unknown)",
      detail:
        "OpenAI offers $100/month Pro 5x and $200/month Pro 20x; plan_type does not identify which variant.",
      planType,
    };
  }

  if (["business", "team"].includes(planType)) {
    return {
      platformId: "codex",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: planType === "team" ? "Team / Business" : "Business",
      detail:
        "Business is priced per user; the collector does not expose seat count or annual-vs-monthly billing cadence.",
      planType,
    };
  }

  return {
    platformId: "codex",
    status: "unknown",
    kind: null,
    amountUsd: null,
    label: planType,
    detail: `Plan "${planType}" was detected, but it has no unambiguous public fixed monthly price.`,
    planType,
  };
}

function deriveVercelCost(records: UsageRecord[]): DerivedPlatformCost {
  const billed = latestRecord(
    records,
    (record) =>
      record.platform === "vercel" && record.metric === "billing_period_cost"
  );
  if (!billed) {
    return {
      platformId: "vercel",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Cost unknown",
      detail: "No Vercel billing-period aggregate has been collected yet.",
      planType: null,
    };
  }

  if (billed.unit.toLowerCase() !== "usd") {
    return {
      platformId: "vercel",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: `${billed.value.toFixed(2)} ${billed.unit.toUpperCase()} billed`,
      detail:
        "Non-USD charges are not converted or silently included in the USD total.",
      planType: null,
    };
  }

  return {
    platformId: "vercel",
    status: "known",
    kind: "billed",
    amountUsd: billed.value,
    label: "Billed charges",
    detail: "Net Vercel FOCUS BilledCost summed for the current month.",
    planType: null,
  };
}

export function derivePlatformCost(
  meta: PlatformMeta,
  records: UsageRecord[]
): DerivedPlatformCost {
  if (meta.id === "codex") return deriveCodexCost(records);
  if (meta.id === "vercel") return deriveVercelCost(records);
  if (meta.id === "cursor") {
    return {
      platformId: meta.id,
      status: "not_connected",
      kind: null,
      amountUsd: null,
      label: "Not connected",
      detail:
        "No billing or plan API is available for an individual Cursor account.",
      planType: null,
    };
  }
  if (meta.id === "claude") {
    return {
      platformId: meta.id,
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Cost unknown",
      detail:
        "Claude Code's statusLine payload does not expose subscription plan or tier.",
      planType: null,
    };
  }
  if (meta.id === "gemini") {
    return {
      platformId: meta.id,
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Cost unknown",
      detail:
        "Cloud Monitoring quota metrics do not expose Gemini subscription or billing plan.",
      planType: null,
    };
  }
  return {
    platformId: meta.id,
    status: "unknown",
    kind: null,
    amountUsd: null,
    label: "Cost unknown",
    detail: "No automatic billing source is available.",
    planType: null,
  };
}

export function formatCostForTable(cost: DerivedPlatformCost): string {
  if (cost.amountUsd !== null && cost.kind === "subscription") {
    return `$${cost.amountUsd.toFixed(0)}/mo`;
  }
  if (cost.amountUsd !== null && cost.kind === "billed") {
    return `$${cost.amountUsd.toFixed(2)} billed`;
  }
  return cost.status === "not_connected" ? "Not connected" : "Unknown";
}

export function deriveCostSummary(
  platforms: PlatformMeta[],
  records: UsageRecord[]
) {
  const costs = platforms.map((platform) =>
    derivePlatformCost(platform, records)
  );
  const known = costs.filter(
    (
      cost
    ): cost is DerivedPlatformCost & {
      amountUsd: number;
      kind: CostKind;
    } =>
      cost.status === "known" &&
      cost.amountUsd !== null &&
      cost.kind !== null
  );
  const subscriptionTotal = known
    .filter((cost) => cost.kind === "subscription")
    .reduce((sum, cost) => sum + cost.amountUsd, 0);
  const billedTotal = known
    .filter((cost) => cost.kind === "billed")
    .reduce((sum, cost) => sum + cost.amountUsd, 0);
  return {
    costs,
    knownTotal: subscriptionTotal + billedTotal,
    subscriptionTotal,
    billedTotal,
    unknown: costs.filter((cost) => cost.status !== "known"),
  };
}

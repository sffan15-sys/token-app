import { findPlan } from "../data/planCatalog";
import type {
  PlanSelections,
  PlatformMeta,
  UsageRecord,
} from "../types";

export type CostKind = "subscription" | "billed";
export type CostStatus = "known" | "unknown" | "not_connected";
export type CostSource = "manual" | "detected" | "billing" | "unavailable";

export interface DerivedPlatformCost {
  platformId: string;
  status: CostStatus;
  kind: CostKind | null;
  amountUsd: number | null;
  label: string;
  detail: string;
  planType: string | null;
  source: CostSource;
}

const CODEX_PLAN_TYPE_TO_CATALOG_ID: Record<string, string> = {
  free: "free",
  go: "go",
  plus: "plus",
  "pro-5x": "pro_5x",
  pro_5x: "pro_5x",
  pro5x: "pro_5x",
  "pro-20x": "pro_20x",
  pro_20x: "pro_20x",
  pro20x: "pro_20x",
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

function deriveManualCost(
  meta: PlatformMeta,
  selectedPlanId: string
): DerivedPlatformCost | null {
  const plan = findPlan(meta.id, selectedPlanId);
  if (!plan) return null;
  return {
    platformId: meta.id,
    status: "known",
    kind: "subscription",
    amountUsd: plan.monthlyUsd,
    label: plan.label,
    detail:
      "Selected in Settings; this manual plan overrides automatic cost derivation.",
    planType: plan.id,
    source: "manual",
  };
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
      source: "unavailable",
    };
  }

  const catalogId = CODEX_PLAN_TYPE_TO_CATALOG_ID[planType];
  const plan = catalogId ? findPlan("codex", catalogId) : null;
  if (plan) {
    return {
      platformId: "codex",
      status: "known",
      kind: "subscription",
      amountUsd: plan.monthlyUsd,
      label: plan.label,
      detail: `Detected automatically from Codex plan_type: ${planType}.`,
      planType,
      source: "detected",
    };
  }

  if (planType === "pro") {
    return {
      platformId: "codex",
      status: "unknown",
      kind: null,
      amountUsd: null,
      label: "Pro (tier unknown)",
      detail:
        "OpenAI offers $100/month Pro 5x and $200/month Pro 20x; the reported plan_type does not identify which tier.",
      planType,
      source: "unavailable",
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
      source: "unavailable",
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
    source: "unavailable",
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
      source: "unavailable",
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
      source: "unavailable",
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
    source: "billing",
  };
}

export function derivePlatformCost(
  meta: PlatformMeta,
  records: UsageRecord[],
  planSelections: PlanSelections = {}
): DerivedPlatformCost {
  const selectedPlanId =
    meta.id in planSelections
      ? planSelections[meta.id as keyof PlanSelections]
      : undefined;
  if (selectedPlanId) {
    const manual = deriveManualCost(meta, selectedPlanId);
    if (manual) return manual;
  }

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
        "No billing or plan API is available for an individual Cursor account. Choose a plan in Settings to add its cost.",
      planType: null,
      source: "unavailable",
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
        "Claude Code's statusLine payload does not expose subscription plan or tier. Choose a plan in Settings.",
      planType: null,
      source: "unavailable",
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
        "Cloud Monitoring quota metrics do not expose a consumer Gemini plan. Choose a plan in Settings.",
      planType: null,
      source: "unavailable",
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
    source: "unavailable",
  };
}

export function formatCostForTable(cost: DerivedPlatformCost): string {
  if (cost.amountUsd !== null && cost.kind === "subscription") {
    return `$${cost.amountUsd.toFixed(cost.amountUsd % 1 === 0 ? 0 : 2)}/mo`;
  }
  if (cost.amountUsd !== null && cost.kind === "billed") {
    return `$${cost.amountUsd.toFixed(2)} billed`;
  }
  return cost.status === "not_connected" ? "Not connected" : "Unknown";
}

export function deriveCostSummary(
  platforms: PlatformMeta[],
  records: UsageRecord[],
  planSelections: PlanSelections = {}
) {
  const costs = platforms.map((platform) =>
    derivePlatformCost(platform, records, planSelections)
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

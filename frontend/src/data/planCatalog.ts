import type { PlanPlatformId } from "../types";

export type AllowanceKind =
  | "none"
  | "window_relative"
  | "relative_unmeasured"
  | "usd_agent_pool"
  | "usd_credit";

export interface PlanAllowance {
  kind: AllowanceKind;
  summary: string;
  relativeToBaseline?: number;
  includedUsd?: number;
}

export interface PlanDefinition {
  id: string;
  platformId: PlanPlatformId;
  label: string;
  monthlyUsd: number;
  priceLabel: string;
  allowance: PlanAllowance;
  sourceUrl: string;
}

/**
 * Public US list prices before tax, verified from official provider pages on
 * 2026-07-30. Promotional prices are deliberately excluded.
 */
export const PLAN_CATALOG: Record<PlanPlatformId, PlanDefinition[]> = {
  claude: [
    {
      id: "free",
      platformId: "claude",
      label: "Free",
      monthlyUsd: 0,
      priceLabel: "$0/mo",
      allowance: {
        kind: "none",
        summary: "Limited rolling usage; no paid value at risk.",
      },
      sourceUrl: "https://claude.com/pricing",
    },
    {
      id: "pro_monthly",
      platformId: "claude",
      label: "Pro (monthly)",
      monthlyUsd: 20,
      priceLabel: "$20/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 1,
        summary:
          "Provider-defined 5-hour and weekly limits; no fixed token ceiling is published.",
      },
      sourceUrl: "https://claude.com/pricing",
    },
    {
      id: "pro_annual",
      platformId: "claude",
      label: "Pro (annual)",
      monthlyUsd: 200 / 12,
      priceLabel: "$200/yr ($16.67/mo)",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 1,
        summary:
          "Same Pro limits; annual billing is normalized to a monthly equivalent.",
      },
      sourceUrl: "https://claude.com/pricing",
    },
    {
      id: "max_5x",
      platformId: "claude",
      label: "Max 5x",
      monthlyUsd: 100,
      priceLabel: "$100/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 5,
        summary:
          "5x Pro usage per 5-hour session, plus weekly limits; no fixed token ceiling.",
      },
      sourceUrl:
        "https://support.claude.com/en/articles/11049741-what-is-the-max-plan",
    },
    {
      id: "max_20x",
      platformId: "claude",
      label: "Max 20x",
      monthlyUsd: 200,
      priceLabel: "$200/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 20,
        summary:
          "20x Pro usage per 5-hour session, plus weekly limits; no fixed token ceiling.",
      },
      sourceUrl:
        "https://support.claude.com/en/articles/11049741-what-is-the-max-plan",
    },
  ],
  codex: [
    {
      id: "free",
      platformId: "codex",
      label: "Free",
      monthlyUsd: 0,
      priceLabel: "$0/mo",
      allowance: {
        kind: "none",
        summary: "Limited access; no paid value at risk.",
      },
      sourceUrl: "https://chatgpt.com/pricing/",
    },
    {
      id: "go",
      platformId: "codex",
      label: "Go",
      monthlyUsd: 8,
      priceLabel: "$8/mo",
      allowance: {
        kind: "window_relative",
        summary:
          "Higher limits than Free; OpenAI does not publish a fixed token ceiling.",
      },
      sourceUrl: "https://chatgpt.com/pricing/",
    },
    {
      id: "plus",
      platformId: "codex",
      label: "Plus",
      monthlyUsd: 20,
      priceLabel: "$20/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 1,
        summary:
          "Provider-defined Codex rolling limits; no fixed token ceiling is published.",
      },
      sourceUrl:
        "https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus",
    },
    {
      id: "pro_5x",
      platformId: "codex",
      label: "Pro 5x",
      monthlyUsd: 100,
      priceLabel: "$100/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 5,
        summary:
          "5x Plus usage across Pro allowances; individual ceilings can vary.",
      },
      sourceUrl:
        "https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro",
    },
    {
      id: "pro_20x",
      platformId: "codex",
      label: "Pro 20x",
      monthlyUsd: 200,
      priceLabel: "$200/mo",
      allowance: {
        kind: "window_relative",
        relativeToBaseline: 20,
        summary:
          "20x Plus usage across Pro allowances; individual ceilings can vary.",
      },
      sourceUrl:
        "https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro",
    },
  ],
  gemini: [
    {
      id: "free",
      platformId: "gemini",
      label: "Free",
      monthlyUsd: 0,
      priceLabel: "$0/mo",
      allowance: {
        kind: "none",
        summary: "No paid consumer subscription value at risk.",
      },
      sourceUrl: "https://one.google.com/about/google-ai-plans/",
    },
    {
      id: "ai_plus",
      platformId: "gemini",
      label: "Google AI Plus",
      monthlyUsd: 9.99,
      priceLabel: "$9.99/mo",
      allowance: {
        kind: "relative_unmeasured",
        relativeToBaseline: 2,
        summary:
          "About 2x no-plan Gemini limits; consumer usage is not exposed to this app.",
      },
      sourceUrl: "https://one.google.com/about/plans",
    },
    {
      id: "ai_pro",
      platformId: "gemini",
      label: "Google AI Pro",
      monthlyUsd: 19.99,
      priceLabel: "$19.99/mo",
      allowance: {
        kind: "relative_unmeasured",
        relativeToBaseline: 4,
        summary:
          "About 4x no-plan Gemini limits; consumer usage is not exposed to this app.",
      },
      sourceUrl: "https://one.google.com/about/plans",
    },
    {
      id: "ai_ultra",
      platformId: "gemini",
      label: "Google AI Ultra",
      monthlyUsd: 249.99,
      priceLabel: "$249.99/mo",
      allowance: {
        kind: "relative_unmeasured",
        summary:
          "Up to 20x Pro consumer limits; the connected API quota is a separate pool.",
      },
      sourceUrl: "https://one.google.com/about/google-ai-plans/",
    },
  ],
  cursor: [
    {
      id: "hobby",
      platformId: "cursor",
      label: "Hobby",
      monthlyUsd: 0,
      priceLabel: "$0/mo",
      allowance: {
        kind: "none",
        summary: "Limited requests; no paid value at risk.",
      },
      sourceUrl: "https://cursor.com/pricing",
    },
    {
      id: "pro",
      platformId: "cursor",
      label: "Pro",
      monthlyUsd: 20,
      priceLabel: "$20/mo",
      allowance: {
        kind: "usd_agent_pool",
        includedUsd: 20,
        summary:
          "$20 guaranteed API-agent usage plus variable bonus usage; consumption is not connected.",
      },
      sourceUrl: "https://docs.cursor.com/account/pricing",
    },
    {
      id: "pro_plus",
      platformId: "cursor",
      label: "Pro+",
      monthlyUsd: 60,
      priceLabel: "$60/mo",
      allowance: {
        kind: "usd_agent_pool",
        includedUsd: 70,
        summary:
          "$70 guaranteed API-agent usage plus variable bonus usage; consumption is not connected.",
      },
      sourceUrl: "https://docs.cursor.com/account/pricing",
    },
    {
      id: "ultra",
      platformId: "cursor",
      label: "Ultra",
      monthlyUsd: 200,
      priceLabel: "$200/mo",
      allowance: {
        kind: "usd_agent_pool",
        includedUsd: 400,
        summary:
          "$400 guaranteed API-agent usage plus variable bonus usage; consumption is not connected.",
      },
      sourceUrl: "https://docs.cursor.com/account/pricing",
    },
  ],
  vercel: [
    {
      id: "hobby",
      platformId: "vercel",
      label: "Hobby",
      monthlyUsd: 0,
      priceLabel: "$0/mo",
      allowance: {
        kind: "none",
        summary: "Free capped usage; no prepaid monthly credit.",
      },
      sourceUrl: "https://vercel.com/pricing",
    },
    {
      id: "pro",
      platformId: "vercel",
      label: "Pro",
      monthlyUsd: 20,
      priceLabel: "$20/mo",
      allowance: {
        kind: "usd_credit",
        includedUsd: 20,
        summary:
          "$20 monthly usage credit, then uncapped pay-as-you-go overage.",
      },
      sourceUrl: "https://vercel.com/pricing",
    },
  ],
};

export const PLAN_CONFIG_KEY_BY_PLATFORM: Record<
  PlanPlatformId,
  | "CLAUDE_PLAN"
  | "CODEX_PLAN"
  | "GEMINI_PLAN"
  | "VERCEL_PLAN"
  | "CURSOR_PLAN"
> = {
  claude: "CLAUDE_PLAN",
  codex: "CODEX_PLAN",
  gemini: "GEMINI_PLAN",
  vercel: "VERCEL_PLAN",
  cursor: "CURSOR_PLAN",
};

export function findPlan(
  platformId: string,
  planId: string | null | undefined
): PlanDefinition | null {
  if (!planId || !(platformId in PLAN_CATALOG)) return null;
  return (
    PLAN_CATALOG[platformId as PlanPlatformId].find(
      (plan) => plan.id === planId
    ) ?? null
  );
}

import { Link } from "react-router-dom";
import { PLATFORMS } from "../data/mockData";
import { derivePlatformCost } from "../lib/costs";
import { isPoolPlatform, poolSnapshot, snapshotForWindow } from "../lib/selectors";
import { formatDuration, formatPercent } from "../lib/format";
import type { PlanSelections, UsageRecord } from "../types";

/**
 * AI capacity destinations only — Vercel is infra/hosting, not an
 * interchangeable AI task pool, so routing a "next AI task" there makes no
 * sense. Bug flagged in research/codex-critique.md #4.
 */
// Gemini's collector reports metered API quota rather than consumer
// subscription headroom, and Cursor is unavailable on individual plans.
const AI_TASK_PLATFORM_IDS = new Set(["claude", "codex"]);

const HEADROOM_THRESHOLD = 40; // usedPercent below this = "healthy headroom" baseline
/** Below this much time left in the window, don't call it "safe" no matter how low used% is. */
const MIN_SAFE_TIME_REMAINING_MS = 20 * 60 * 1000;

/** Rough $/remaining-capacity-point: lower is cheaper to burn. Flat-subscription
 * platforms only — usage-based cost isn't meaningfully comparable the same way. */
function costPerRemainingPoint(monthlyCostUsd: number | null, usedPercent: number): number | null {
  if (monthlyCostUsd === null) return null;
  const remainingPercent = 100 - usedPercent;
  if (remainingPercent <= 0) return null;
  return monthlyCostUsd / remainingPercent;
}

/**
 * "Paid-for-and-idle right now" rollup — CLAUDE.md calls this out
 * explicitly as a goal (route the next task to what's already paid
 * for instead of a metered platform). A filtered chip list, not a
 * chart, per design/ux-brainstorm.md — it's a fast yes/no answer.
 *
 * Verdict factors in BOTH used% and time-remaining-in-window: 40% used with
 * 5 minutes left is very different from 40% used with 5 hours left (the
 * original flat-threshold version treated them identically — see
 * research/codex-critique.md #4 / design/critique-claude.md 2.3).
 */
export function IdleHeadroomPanel({
  records,
  planSelections = {},
}: {
  records: UsageRecord[];
  planSelections?: PlanSelections;
}) {
  const candidates = PLATFORMS.filter((meta) => AI_TASK_PLATFORM_IDS.has(meta.id))
    .map((meta) => {
      const cost = derivePlatformCost(meta, records, planSelections);
      const monthlyCostUsd = cost.kind === "subscription" ? cost.amountUsd : null;
      if (isPoolPlatform(meta)) {
        const snap = poolSnapshot(records, meta.id);
        return { meta, usedPercent: snap.usedPercent, msRemaining: null as number | null, monthlyCostUsd };
      }
      const snap = snapshotForWindow(records, meta.id, meta.windows[0]);
      const msRemaining = snap.resetAt ? new Date(snap.resetAt).getTime() - Date.now() : null;
      return { meta, usedPercent: snap.usedPercent, msRemaining, monthlyCostUsd };
    })
    .filter((c) => {
      if (c.usedPercent === null || c.usedPercent >= HEADROOM_THRESHOLD) return false;
      // For time-bound windows, don't call it "safe" if the window is about to reset/expire —
      // a big task started with minutes left will just get cut off by the reset anyway.
      if (c.msRemaining !== null && c.msRemaining >= 0 && c.msRemaining < MIN_SAFE_TIME_REMAINING_MS) return false;
      return true;
    });

  const cheapest = candidates
    .map((c) => ({
      ...c,
      costPerPoint:
        c.usedPercent !== null
          ? costPerRemainingPoint(c.monthlyCostUsd, c.usedPercent)
          : null,
    }))
    .filter((c) => c.costPerPoint !== null)
    .sort((a, b) => a.costPerPoint! - b.costPerPoint!)[0];

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Safe to start a big task right now
      </div>
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Paid-for, idle, AND enough time left in the window before it resets. Route your next task
        here before burning a metered platform. (Vercel isn't shown — it's hosting, not an AI
        capacity pool.)
      </div>
      {candidates.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing has meaningful, time-safe headroom right now.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {candidates.map((c) => (
              <Link
                key={c.meta.id}
                to={`/platform/${c.meta.id}`}
                className="text-xs font-medium tabular underline-offset-2 hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {c.meta.label} · {formatPercent(c.usedPercent!)} used
                {c.msRemaining !== null && c.msRemaining >= 0 ? ` · ${formatDuration(c.msRemaining)} left` : ""}
              </Link>
            ))}
          </div>
          {cheapest && (
            <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
              Cheapest headroom right now:{" "}
              <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                {cheapest.meta.label}
              </span>{" "}
              (~${cheapest.costPerPoint!.toFixed(2)} of subscription per remaining % of window)
            </div>
          )}
        </>
      )}
    </div>
  );
}

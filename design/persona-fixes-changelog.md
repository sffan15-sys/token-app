# Persona fixes changelog

Implements the prioritized fix lists from `design/critique-claude.md` and
`research/codex-critique.md`, both of which concluded the frontend answered
"am I about to hit a rate limit" well but failed the actual target persona:
someone running multiple businesses on AI tools who needs cost and
business-attribution, not just platform status.

## What changed

1. **Monthly cost rollup** (`frontend/src/types.ts`, `data/mockData.ts`,
   `components/CostSummary.tsx`). `PlatformMeta.monthlyCostUsd` added with
   illustrative 2026 mock prices for all 5 platforms (Claude Max $100,
   ChatGPT Pro $200, Gemini Advanced $20, Vercel Pro $20 base seat, Cursor
   Pro+ $60) — **the owner should correct these against their real billed
   tier**, since the app has no way to know which tier is actually active.
   `CostSummary` totals flat subscriptions + metered spend so far this
   period into one number, plus a per-platform breakdown.

2. **Home page restructured into 3 labeled zones** (`pages/Home.tsx`):
   status snapshot / cost summary / usage grid, each under an explicit
   section heading, matching the owner's own framing of "3 things at a
   glance" (previously 2 of 3 existed in code but weren't visually or
   semantically separated).

3. **Status/headroom logic now considers all active windows**
   (`lib/status.ts`, `components/PlatformCard.tsx`,
   `components/IdleHeadroomPanel.tsx`). Added `worstStatus()` so a card's
   badge reflects whichever window (5-hour or 7-day/weekly) is more
   constrained, instead of only ever looking at `windows[0]`. Replaced
   `IdleHeadroomPanel`'s flat 40%-used threshold with a verdict that also
   requires a minimum time-remaining-in-window, and removed Vercel from the
   panel's candidate list — it's hosting/infra, not an interchangeable AI
   capacity pool.

4. **Business/project tagging** (`types.ts`: `UsageRecord.businessTag`,
   `Alert.businessTag`; `pages/Settings.tsx` manual-log form). Free-text,
   optional, no rollup UI yet — deliberately scoped per both critiques'
   "cheap now, expensive to retrofit" framing. This is schema groundwork
   only.

5. **Business-aware alerts** (`components/AlertStrip.tsx`,
   `pages/Alerts.tsx`). When an alert carries a `businessTag`, it now
   renders "— affects [Business]'s active work" inline, so a tagged
   business-critical alert reads differently from an untagged/idle one.
   Two `MOCK_ALERTS` entries (Claude approaching-limit, Gemini stale) now
   carry example tags to demonstrate this.

6. **Cost-efficiency indicator** (`components/IdleHeadroomPanel.tsx`,
   lower priority, done anyway). Shows which time-safe, idle platform is
   cheapest to route the next task to, as `monthlyCostUsd / remaining-%`.
   Flat-subscription platforms only — usage-based cost isn't comparable
   the same way without more billing detail than the mock data has.

## Simplifications / tradeoffs made under time pressure

- No cost-per-business rollup UI — only the data model + one entry point
  exist (per critique scoping, this was explicitly "not yet," not an
  oversight).
- "Safe to start a big task" is still a used%-and-time-left heuristic, not
  a true burn-rate/task-size estimator (codex-critique.md's more ambitious
  "Can I start this task?" tool, which would need task-size input and
  velocity modeling, is out of scope for this pass).
- Cost-efficiency metric uses flat subscription price only; it doesn't
  account for metered platforms (Vercel/Cursor spend) or account for
  diminishing-value-of-headroom nonlinearities.
- `.gitignore` had an overly broad `data/` rule that had left
  `frontend/src/data/mockData.ts` untracked in git entirely; force-added it
  in the first commit here since it's real source code the app depends on
  to build. The `.gitignore` rule itself wasn't touched — worth a follow-up
  but out of scope for this task.

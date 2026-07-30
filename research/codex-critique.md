# Codex critique: does the frontend answer the multi-business persona question

(Recovered from stdout — the `codex exec` run was launched with `--sandbox
read-only` by mistake, so it could analyze but not write its own file. Full
critique preserved verbatim below.)

## Verdict

**No.** The frontend is a reasonable provider-level rate-limit monitor, but
it is not a multi-business AI operations dashboard.

## Top 5 findings

1. `UsageRecord` (`frontend/src/types.ts:9`) and the mock configuration
   identify only platforms, so multiple accounts, workspaces, and businesses
   cannot be represented.
2. `Home.tsx` (`frontend/src/pages/Home.tsx:8`) has no monthly-cost total;
   existing dollar gauges show allowance consumption, not actual recurring
   plus variable spend.
3. `statusForUsage` (`frontend/src/lib/status.ts:12`) uses fixed thresholds,
   while cards privilege the first window. A tight weekly cap can therefore
   be hidden behind a "Healthy" five-hour status.
4. `IdleHeadroomPanel` (`frontend/src/components/IdleHeadroomPanel.tsx:15`)
   is not safe routing logic: it ignores task size, secondary limits,
   velocity, concurrent work, capabilities, and even treats Vercel as an AI
   task destination.
5. Cost attribution, budgets, forecasts, workload reservations, and
   defensible cost-efficiency comparisons are entirely absent — the
   essential layer for someone operating several businesses simultaneously.

## Highest-impact changes, in order

1. Model accounts, organizations, businesses, projects, billing plans, and
   shared-cost allocations — not just providers.
2. Add a home portfolio summary covering account health, committed monthly
   cost, variable spend, projected month-end spend, and budget variance.
3. Replace fixed percentage statuses with constraint-aware runway across all
   limits, burn velocity, reset timing, active jobs, and data confidence.
4. Add a "Can I start this task?" tool that considers task size, platform
   capability, concurrent work, cost, and fallback options.
5. Add business/project cost attribution and like-for-like efficiency
   metrics.

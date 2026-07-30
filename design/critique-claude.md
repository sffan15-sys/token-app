# Critique: does the frontend answer "what does someone running multiple
businesses on AI tools need to know about their AI usage?"

Reviewed: `CLAUDE.md`, `SPECS.md`, `design/ux-brainstorm.md`, and every file in
`frontend/src/` (`pages/`, `components/`, `data/mockData.ts`, `lib/`,
`types.ts`).

## 1. Direct assessment

**No.** The current frontend answers a narrower question than the one posed:
"am I about to hit a rate-limit wall on any of my 5 AI accounts, right now."
That's a real and reasonably well-executed question (the gauge/verdict/
sparkline pattern in `PlatformCard.tsx` is genuinely good for it). But the
persona described — one person using AI tools as the labor force for
*multiple, simultaneous businesses* — needs a second axis the app doesn't
have at all: **which business/project is consuming what, and what is it
costing.** Today the data model, mock data, and every page are single-axis
(platform only). There is no way, anywhere in the app, to answer "is Business
A's AI spend sane this month" or "did I just burn my Claude window on
Business B when Business A needed it."

Specifically on the owner's own example — "snapshot of (1) all accounts'
status, (2) $/month across all platforms, (3) current usage" — the frontend
delivers (1) and (3) reasonably (the card grid + gauges), but **completely
fails (2)**. See 2.1 below. That's not a polish gap, it's a missing feature
on the single most explicit ask.

## 2. Specific gaps found in the actual code

### 2.1 No aggregate monthly-cost view anywhere (the owner's named gap, confirmed)
- `frontend/src/types.ts` has no field for flat subscription price. `UsageRecord`
  only carries `value`/`unit` for *metered usage* (percent or usd-against-included-usage).
- `frontend/src/data/mockData.ts` never encodes what Claude Pro/Max, ChatGPT
  Plus/Pro, or Cursor's subscription tier actually *costs* per month — only
  Vercel and Cursor have a dollar figure, and even that is "spend against
  included usage cap," not the subscription's real monthly price. Claude and
  Codex, the two richest-data platforms, have **no dollar figure attached to
  them at all** — they're pure percent-of-window.
- No component (`Home.tsx`, `PlatformCard.tsx`, `IdleHeadroomPanel.tsx`, or
  any other) computes or renders a "total $/month across all 5 platforms"
  number. `IdleHeadroomPanel` is the closest thing to a cross-platform rollup
  and it's about idle headroom, not cost.
- Result: someone paying for Claude Max ($100+/mo), ChatGPT Pro, Cursor,
  Gemini Advanced, and Vercel Pro has to go add those up in their head or in
  a separate spreadsheet — exactly the "N tabs" problem CLAUDE.md says the
  app exists to kill, just moved to cost instead of usage.

### 2.2 No cost-per-business / cost-per-project attribution
- Grepping the entire `frontend/src` tree for "business", "client", "project"
  (as attribution concepts, not window/collector jargon) returns zero hits
  outside `main.tsx`/`types.ts` boilerplate. There is no concept in the type
  system (`types.ts`), mock data, or UI of "this usage belongs to Business X."
- For a single hobbyist this is a non-issue. For someone running multiple
  businesses on the same Claude/Codex/Cursor accounts, "which business is my
  AI spend actually going to" is arguably a *more* natural question than
  "which platform" — platform is just which vendor invoices you; business is
  where the ROI math has to close. The app currently can't answer it even
  approximately (e.g. no session/task tagging, no manual "log this reading
  against project X" option in `Settings.tsx`'s manual-log form).

### 2.3 No "can I safely start a big task right now" decision surface
- `PlatformCard.tsx`'s `verdict()` function (lines 17-29) produces a
  descriptive sentence ("58% used, resets in 1h48m") but never a
  forward-looking capacity judgment. There's no logic anywhere (checked
  `lib/selectors.ts`, `lib/status.ts`) that estimates "at current burn rate,
  will this window survive a task of size ~N" or even a simple
  traffic-light "safe to start something big" flag.
- `IdleHeadroomPanel.tsx` gets partway there ("paid-for and idle") but it's
  framed as routing, not as a pre-flight check before committing to
  business-critical work. It also uses a single hardcoded threshold
  (`HEADROOM_THRESHOLD = 40`, line 7) with no accounting for *how much
  window time is left* — 40% used with 4h56m left on a 5h window reads
  identically to 40% used with 4 minutes left, which is precisely the
  mid-task-throttle risk CLAUDE.md calls out as a core problem (Step 3:
  "Approaching limit," "Burn rate substantially faster than personal
  baseline").
- There is no "reserve headroom for business-critical work" concept — e.g.
  no way to flag that Business A has a deploy/launch happening today and the
  dashboard should surface risk to *that* platform's capacity more
  urgently than routine.

### 2.4 No cost-efficiency comparison across platforms
- ux-brainstorm.md and CLAUDE.md both talk about routing to what's
  "paid-for-and-idle," but nothing compares *value* across platforms — e.g.
  cost per unit of usable capacity, or which platform is the cheapest place
  to run a given class of task. `IdleHeadroomPanel` only filters by
  used-percent, not by $ efficiency. For someone deciding "should this go to
  Claude, Codex, or Gemini" across businesses with different budgets, this
  is a real, missing decision input, not a nice-to-have.

### 2.5 Alerts are platform-severity-only, not business-severity-aware
- `Alert` (`types.ts` lines 31-39) has no business/project field and no
  concept of "criticality of what's currently running." `MOCK_ALERTS` in
  `mockData.ts` (lines 234-280) and `AlertStrip`/`Alerts.tsx` sort purely by
  severity + recency. A burn-rate anomaly during a paying-client's
  time-sensitive job and the same anomaly during idle tinkering render
  identically. For a multi-business operator, "is this alert going to hurt
  a business right now" is the real question, and the data model has no way
  to express it.

### 2.6 Settings/manual-log flow has no room for the above
- `Settings.tsx`'s manual-log widget (lines 12-25, 38-82) takes only
  platform + a bare percent. Even a minimal "which business is this session
  for" free-text tag would let a future rollup exist; right now the schema
  and the form both foreclose it.

### 2.7 Minor but real: subscription tier/plan identity isn't modeled either
- `PlatformMeta` (`types.ts` lines 51-57) has no `planName`/`monthlyCost`
  field, so even a static, non-computed "you're on Claude Max, ChatGPT
  Pro, Cursor Pro+..." listing — the cheapest possible version of gap 2.1 —
  isn't representable without a schema change first.

## 3. Prioritized changes, ranked by impact for this persona

1. **Add a monthly-cost rollup to the home page.** Extend `PlatformMeta`
   with a `monthlyCostUsd` (flat subscription) field, sum it in a new
   small stat (next to or inside `AlertStrip`/top of `Home.tsx`), and show
   metered platforms' current-period spend alongside it so the total is
   "flat subscriptions + metered spend so far this period," not just one or
   the other. This directly closes the owner's own named gap and is the
   highest-leverage, lowest-effort fix (schema + mock data + one small
   component).

2. **Turn the home page into a real 3-part snapshot**, matching the
   owner's framing explicitly: status strip (exists, `AlertStrip`) + cost
   summary (new, from #1) + usage grid (exists, `PlatformCard` grid) as
   three clearly labeled, visually distinct zones — right now cost is
   simply absent, so the "3 things at a glance" framing isn't legible even
   though 2 of the 3 pieces already exist in code.

3. **Replace the flat `HEADROOM_THRESHOLD` idle check with a
   time-aware "safe to start a big task" verdict** in
   `IdleHeadroomPanel.tsx`/`lib/selectors.ts` — factor in both used% and
   time-to-reset (and ideally task-size estimate) so the panel answers the
   actual pre-flight question ("can I kick off something heavy right now
   without getting throttled mid-task") instead of a static usage cutoff.
   This is the single highest-value feature gap for someone running
   business-critical work through these accounts, since a mid-task
   throttle is the exact failure mode CLAUDE.md was written to prevent.

4. **Add lightweight business/project tagging** to the manual-log form
   (`Settings.tsx`) and to `UsageRecord`/`Alert` types, even if initially
   just a free-text label with no rollup UI yet. This is the schema
   groundwork that everything else in the "multiple businesses" framing
   depends on — without it, a cost-per-business view can never be built
   without a breaking data-model change later. Cheap now, expensive to
   retrofit.

5. **Make alerts business-aware in severity, not just platform-aware.**
   Once #4 exists, let an alert optionally carry a business tag and surface
   "this affects [Business X]'s active work" language, so the alert feed
   differentiates "annoying" from "actively blocking paid client work."

6. *(Lower priority, real but not urgent)* Add a basic cost-efficiency
   comparison — e.g. $ per 1% of usable capacity, or a simple "cheapest
   platform with headroom right now" indicator — to `IdleHeadroomPanel`,
   once cost data (#1) exists to compute it from.

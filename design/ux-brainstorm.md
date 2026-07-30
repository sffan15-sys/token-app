# UX Brainstorm — Token App Frontend

Written before any UI code, per the standing process for this project.
Goal: a personal, glanceable status dashboard across 5 platforms
(Claude, ChatGPT/Codex, Gemini, Vercel, Cursor), checked frequently
(many times a day), that surfaces "am I about to hit a wall" and
"am I wasting what I already paid for" faster than opening 5 tabs.

## Who is this for, really

One person, checking this the way they'd check a phone's battery
indicator or a stock ticker — a few seconds, not a session. That
argues hard for:
- Information density over decoration.
- Status conveyed by position/color/shape before it's conveyed by
  numbers — the numbers are there for when you look closer.
- Nothing that requires interaction to learn "am I fine right now."
- Fast to build and iterate given collectors are landing in parallel
  and data richness varies wildly by platform (this shapes the
  component design more than the visual design — see "sparse data"
  below).

## Feature surface (brainstormed, then triaged into V1 / later)

### Home / at-a-glance (V1)
The single most important screen. One row or card per platform, always
visible without scrolling on a normal screen. Each shows:
- Platform name/icon.
- Primary limit gauge (whichever window is "closest to mattering"
  right now — e.g. Claude's 5-hour if it's the tighter constraint,
  else weekly) as a percentage-used ring/bar, not a line chart.
- Time-to-reset (relative, "resets in 2h 14m") — this is often more
  actionable than the % itself, so it needs equal visual weight, not
  a footnote.
- A one-line status verdict, plain language: "Fresh window, plenty of
  headroom" / "82% used, resets in 40m" / "Idle 35m, window active" /
  "No data in 6h — collector may be stale." This is the "don't make
  me do the math" layer — the whole point of the app.
- A tiny trend indicator (sparkline or simple up/down burn-rate arrow)
  only where time-series exists; platforms with only manual pokes get
  a "last logged Xh ago" chip instead, not a fake/empty chart.
- Secondary window (e.g. 7-day) collapsed by default, one tap/click to
  expand — don't show two gauges at full size per platform on the
  home screen, it doubles the scan cost for a number that matters less
  minute-to-minute.

Top of the page: an alert strip (0 or more banner-style items) above
the platform grid — highest severity first (money-risk > approaching
limit > burn-rate anomaly > idle/waste nudge > stale-collector meta
alert). Empty state is *no strip at all*, not a reassuring "all good"
banner — silence should read as fine, consistent with a status-board
mental model.

### Per-platform detail view (V1, minimal; richer later)
Drill-in from a home card. Contents:
- Both windows (5hr + 7day, or whatever the platform's shape is) at
  full size, gauge + countdown.
- Historical usage curve — this is where a real chart earns its
  place: a time-series line/area of % used over the last N windows,
  so "is today unusual" is visually obvious. Only rendered when
  there's enough time-series data; otherwise replaced with a plain
  log table (manual entries) and a note that trend charting unlocks
  once enough data exists.
- Efficiency history: per-window "used X% before reset" as a small
  bar/strip chart across recent windows — this is the "waste" view,
  distinct from the live gauge.
- Raw recent readings table (debug-adjacent, useful given best-effort
  collectors can silently change shape — SPECS.md flags this risk
  explicitly, so the UI should make "is this collector still sane"
  checkable by a human, not just logged to a DB no one looks at).

### Alert feed / history (V1 lightweight, full later)
- Home strip shows only active/unacknowledged alerts.
- A dedicated feed view for history (what fired, when, dismissed or
  not) — mainly useful for tuning thresholds later, not core V1
  traffic, but cheap to stub now since the alert data model already
  exists conceptually.
- V1: model alerts as data, render the strip + a simple list page.
  Not building ack/snooze persistence yet (no backend), just the
  visual and data shape.

### Cross-platform rollup (V1, small)
One compact panel: "paid-for-and-idle right now" — which platforms
have healthy unused headroom in an active window, so the owner can
route the next task there instead of a metered one. This is explicitly
called out in CLAUDE.md as a goal ("route to what's already paid
for") and deserves a dedicated small widget rather than being
implied by the grid alone, since the whole point is a *fast* answer to
"which one should I use right now."

### Settings / config (V1 minimal, functional later)
- API key / token entry per platform (stored client-side only for
  now, mock; real secret handling is a backend concern not this
  task).
- Manual-log shortcut: a big obvious "log a reading" quick-action for
  Gemini/Cursor (and Claude/Codex as backup) — since manual logging is
  the primary data source for 2 of 5 platforms per SPECS.md, this
  can't be an afterthought buried in a settings page. Given it, put a
  lightweight version of this action reachable from the home screen
  too (e.g. a "+" on cards without rich data), not just in Settings.
- Threshold tuning (80%/90% alert points, idle-minutes, burn-rate
  sensitivity) — V1 can hardcode sane defaults and expose them as
  read-only text; editable controls are later once alert logic
  actually exists server-side.

### Explicitly later / out of scope for V1
- Notification delivery (push/webhook/Slack) — CLAUDE.md defers exact
  channel choice; UI can show alerts exist without wiring delivery.
- Auth/multi-device sync — single user, single machine assumption
  holds for now.
- Editable alert thresholds, ack/snooze state persistence.
- Per-model/workspace cost breakdowns (Claude Admin API, OpenAI usage)
  beyond a single rolled-up number — real but not the primary "am I
  about to hit a wall" question.
- Onboarding/empty-account flows — this is a personal tool for
  accounts that already exist.

## Charts or not — the actual calls

Chart-phobia is as much a trap as chart-happiness, so each surface
got a deliberate call rather than a default:

| Surface | Chosen form | Why |
|---|---|---|
| "How much of my window is left, right now" | Radial gauge / progress ring + big % number | Single current value against a known ceiling — a gauge reads in under a second; a line chart makes you find the rightmost point and read an axis. |
| "Time until reset" | Big text countdown, not a chart | It's a duration, not a distribution. Numbers/text beat any graphic here. |
| "Am I burning faster than usual today" | Sparkline (7-somewhat-flat-days) *inside* the card, or a simple up/flat/down arrow badge when space is tight | Comparison-to-self over time is exactly what a sparkline is for; full axes/legends would be noise at card size. Arrow badge is the fallback for the most cramped view (mobile/dense grid). |
| "Usage curve within the current window" (detail view) | Line/area chart, real axes | This is genuine time-series exploration (shape of the session, not just current state) — a chart is the right tool once you're a click deep and want detail. |
| "Waste per window over time" (detail view) | Small multiples / bar strip, one bar per past window showing % used at reset | Categorical comparison across discrete windows, not a continuous quantity — bars beat a connected line here (there's no meaningful interpolation between window N and N+1). |
| Platforms with only manual/sparse data | No chart at all. Show last-logged value + timestamp as a stat, plus a plain table of past manual entries | A sparkline built from 3 manually-logged points over 2 weeks is misleading — it implies continuity and resolution that isn't there. Being honest about sparse data (a "last logged" chip) is better UX than a fake-looking chart. |
| Cross-platform "what's idle and paid for" rollup | Small stat list / chips, not a chart | It's a filtered list ("these 2 platforms qualify right now"), not a quantity to plot. |

General rule adopted: **a chart has to answer "is this trending
unusually" or "what's the shape over time" — anything answerable by a
single current number gets a number/gauge, not a chart.** This keeps
the home screen chart-light (fast scan) and pushes real charting to
the detail view where a click signals actual interest in the history.

## Visual language decisions

- **Light + dark**, system-preference default, manual toggle. Given
  frequent day-long glancing, dark mode isn't optional-nice-to-have.
- **Status color vocabulary**, used consistently across gauges,
  strip alerts, and card borders:
  - calm/healthy (plenty of headroom)
  - watch (approaching threshold, e.g. 70-89%)
  - hot (>=90% or fast burn) 
  - stale/unknown (collector silent / no recent data) — a distinct
    neutral/gray-purple, deliberately *not* red, so "we don't know"
    is never confused with "everything's fine" (green) or "you're in
    trouble" (red). This distinction is directly called out in
    CLAUDE.md's meta-alert requirement and is easy to accidentally
    collapse into green if not designed for explicitly.
  - Exact palette/contrast handled via the dataviz skill for any chart
    elements; card/status chrome colors follow the same hue family for
    visual consistency between chart and non-chart surfaces.
- **Typography**: numbers are the content. Tabular/monospace figures
  for percentages and countdowns so they don't jitter/reflow as they
  tick, a larger weight for the primary gauge number than any label
  text on the card.
- **Density**: grid of cards on desktop (5 platforms fit one row on a
  wide viewport, wraps on narrower), stacked list on mobile width.
  No sidebar nav chrome for a 4-5 route app — a slim top bar with
  Home / Alerts / Settings is enough.

## Stack decision

Vite + React + TypeScript + Tailwind. Reasoning:
- Matches the existing repo's TS/Node collector code (shared mental
  model, could later share the `UsageRecord` type from `storage/db.ts`
  directly).
- Vite gives instant local dev loop for a project that'll be iterated
  on frequently by the owner.
- Tailwind fits the density/utility-first nature of a status-board UI
  (lots of small conditional style tweaks per status state) better
  than hand-rolled CSS modules for this scope.
- Charting library: Recharts (SVG, composable, easy to theme for
  light/dark) for the two chart surfaces that earned a chart above.
- React Router for the ~4 routes (Home, Platform Detail, Alerts,
  Settings).
- No backend framework yet — a typed mock data layer
  (`src/data/mockData.ts`) shaped exactly like `UsageRecord` from
  `storage/db.ts` plus an invented `Alert` type, swappable later for
  a real fetch layer against the SQLite-backed API once it exists.

## Data model used by the UI (mocked for now)

Mirrors `storage/db.ts`'s `UsageRecord` exactly (`platform`,
`window_start`, `window_end`, `metric`, `value`, `unit`, `fetched_at`)
plus UI-only derived/invented types:

- `Alert { id, platform, severity, kind, message, created_at, active }`
- `PlatformMeta { id, label, tier: "official"|"manual", windows: [...] }`
  — static config describing what windows/limits each platform has,
  since that shape differs per platform per SPECS.md and isn't itself
  a time-series fact.

Real backend integration is a drop-in replacement of the mock data
module with a fetch client against the same shapes — no component
should need to change when that lands.

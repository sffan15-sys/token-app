# STATE.md

<!-- The orchestrator reads this first and rewrites it last. Hard cap: 150
     lines. Working memory, not a changelog.
     SEEDED 2026-08-11 from CLAUDE.md/README.md during the orchestrator-kit
     adoption — the "Last session" section starts empty; correct anything
     here that the docs had drifted from reality on. -->

- kit v3.2 applied 2026-08-22, see root PLAN.md

## Current focus

Get one collector verified end-to-end against live data (Vercel billing
collector is built but needs an eligible live `VERCEL_TOKEN`/team), then
build the baseline/anomaly + alert logic on real data.

## Last session

- 2026-08-11: Owner asked for a top-level assessment + live market check
  ("does this app already exist?") before continuing the build. No product
  code changed (working-tree extras are pre-existing untracked files:
  `CLAUDE.md.pre-v2.bak`, `_to_delete/`). Verified: `npm run typecheck`
  passes clean. Market survey completed: the niche IS substantially
  occupied (tokenkarma, Claude Tuner, SessionWatcher — active 2026
  products covering multi-provider session windows + basic intelligence).
  Unoccupied slivers: cross-platform routing recommendations, true
  personal-baseline anomaly detection, Vercel infra billing bundled in.
  Per owner's instruction ("if it already exists, stop and report"),
  stopped before planning/execution — awaiting owner's build-vs-adopt
  decision.

## Autonomous decisions — review surface

- (empty — log one line per self-made call: what, rejected, why)

## Decisions that are settled

- Two-tier integration split: official-API tier vs best-effort tier for
  consumer session limits. Don't build the scraper first.
- Gemini/Cursor (owner override 2026-07-30): API or nothing — no manual
  logging, no fake data. Cursor listed unavailable.
- Topology (2026-07-30): Vite dashboard + Express API on Vercel, Neon
  Postgres via Vercel Marketplace; collectors + scheduler stay local
  (they read local CLI credentials) and push to the protected hosted
  ingest endpoint.

## Known traps

- Platform API/limit claims rot — the Step-1 table in CLAUDE.md is a
  hypothesis to re-verify against live docs before building on it.
- Consumer session/rate-limit data has no official API on any major
  platform; authenticated scraping is ToS-sensitive (flag-first).

## Open threads

- [ ] Provision/connect Neon Marketplace DB, set `TOKEN_APP_WRITE_SECRET`,
      `npx vercel --prod`, complete the Codex local-to-hosted round trip
      (needs owner's Vercel CLI auth — see README.md).
- [ ] Wire `collectors/claude/statusline.ts` into `~/.claude/settings.json`
      and test against a real Claude Code session payload.
- [ ] Manual-log capture for Claude/ChatGPT consumer session % (if still
      useful once real collector data exists).
- [ ] Baseline/anomaly + alert logic — blocked on one verified collector.

## Next obvious step

Verify one collector against live data (Vercel first — official API,
proves the pipeline), then start the intelligence layer.

## Architect invocations

- (none yet)

- kit v3.3.1 applied 2026-08-23, see root PLAN.md

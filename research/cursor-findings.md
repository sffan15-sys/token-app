# Cursor usage/limit spike - findings (2026-07-30)

Researched per SPECS.md section 5: does Cursor have a CLI mode, a local
settings-sync file under `~/.cursor`, or any endpoint that exposes
usage/limit data the way Claude Code's statusline or Codex's internal
endpoint do. Cursor is not installed on this machine (no `~/.cursor` or
`%APPDATA%/Cursor` directory found), so nothing here was verified against
a live local install - this is a documentation/precedent-only pass, same
caveat as the rest of this research batch.

## Headline change since SPECS.md was written: Cursor now has an official Admin API

This is new information not reflected in SPECS.md's "no official API
found" conclusion. Cursor ships a documented **Admin API**
(`cursor.com/docs/account/teams/admin-api`) with real usage/spend
endpoints:

- `GET /teams/daily-usage-data` - per-user daily metrics (lines
  added/deleted, feature usage counts, model usage, per-user spend).
- `GET /teams/filtered-usage-events` - granular per-request data (model,
  token breakdown, `chargedCents`, `cursorTokenFee`).
- `GET /teams/spend` - current billing-cycle spend by team member
  (`spendCents`, `overallSpendCents`, `fastPremiumRequests`,
  `effectivePerUserLimitDollars`).
- `GET /teams/groups` - spend aggregated by billing group.
- Auth: HTTP Basic auth, API key as username (`-u YOUR_API_KEY:`), key
  created at cursor.com/dashboard -> Settings -> Cursor Admin API Keys
  (keys are prefixed `crsr_`, shown once).

**The catch: every endpoint is namespaced under `/teams/*` and framed
throughout the docs as a team-admin tool.** Several endpoints (user spend
limits, member removal) are explicitly gated "Enterprise only." Nothing in
the docs describes an individual-user-scoped usage endpoint, and there's no
indication a solo Pro subscriber (not on a Team/Business/Enterprise plan)
can mint an Admin API key or call these endpoints for just their own
account. This matches the same shape as Claude's Admin API and OpenAI's
organization/usage endpoints per SPECS.md 1b/2b - official, but gated
behind an org/team tier that a personal-use single-seat subscription
doesn't have.

**Actionable if the owner's Cursor plan is ever upgraded to Team/Business**
(or already is - worth a 2-minute check of cursor.com/dashboard for a
"Cursor Admin API Keys" section under Settings): if so, this is a real,
buildable official-tier collector, not a fallback. Worth re-checking plan
tier before writing this off entirely.

## CLI mode and local files

- Cursor does have a CLI (`npm install -g @cursor/cli`), stable on
  Windows as of 2026, and per multiple sources CLI session/chat history is
  stored locally at `~/.cursor/chats/` (per-workspace, not globally
  synced - a known limitation is that the same repo cloned to a different
  path loses continuity with prior chats, which several community sync
  tools exist to patch).
- What was found there is **chat/session transcript content**, not a
  statusline-equivalent usage/limit payload. No source found describing a
  local file, CLI flag, or IDE-written state file that exposes the
  dollar-denominated "included usage" pool, remaining balance, or
  billing-cycle reset time the way Claude Code's statusline JSON exposes
  `rate_limits.*` or Codex's local auth token unlocks `wham/usage`.
- No evidence of a CLI subcommand like `cursor usage` or `cursor-agent
  usage --json` analogous to what's being asked for in openai/codex's own
  open feature request for `codex usage --json`.

## Conclusion

- **Individual/Pro tier: still no confirmed local-file or CLI path to
  usage/limit data.** SPECS.md's manual-log fallback recommendation still
  stands for the owner's actual (assumed individual) plan.
- **Team/Business/Enterprise tier: upgrade from "no official API" to
  "official API exists, gated by plan tier."** This is worth a quick
  plan-tier check (does cursor.com/dashboard show an Admin API Keys
  section?) before continuing to treat Cursor as manual-log-only - if the
  owner is on Team/Business this collector is straightforward to build
  against documented endpoints.
- Not independently verified live (no Cursor install, no Cursor account
  credential on this machine) - what a human would need to do to verify:
  install the Cursor CLI or check the desktop app's Settings page, log in,
  and confirm (a) which plan tier the account is on, and (b) if
  Team/Business, generate an Admin API key and hit `/teams/spend` once to
  confirm the response shape documented above still matches.

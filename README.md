# token-app

Personal usage/rate-limit tracker across AI platforms and Vercel. See
`CLAUDE.md` for project context/authorization and `SPECS.md` for the
per-platform data source research.

## What's built (2026-07-30)

- **Project scaffold**: `package.json`, `tsconfig.json` (TypeScript, ESM,
  Node NodeNext resolution), `collectors/`, `storage/`.
- **Shared storage layer** (`storage/db.ts`): a local SQLite file at
  `data/token-app.db` (gitignored) with two tables:
  - `usage_records`: the common normalized schema
    `{platform, window_start, window_end, metric, value, unit, fetched_at, raw}`
    that every collector writes into.
  - `collector_errors`: defensive log of validation failures / hard errors
    (missing token, unexpected payload shape, HTTP errors) so problems are
    visible instead of silently dropped.
  - Uses Node's built-in `node:sqlite` (`DatabaseSync`), **not**
    `better-sqlite3` — see "Deviations" below.
- **Vercel collector** (`collectors/vercel/collect.ts`): calls
  `GET /v1/billing/charges` (FOCUS v1.3 JSONL), parses each charge line,
  and writes `cost.<service>.billed`, `cost.<service>.effective`, and
  (when present) `usage.<service>` records. Reads the token from
  `VERCEL_TOKEN` (never hardcoded). Handles:
  - missing token -> clear error, no crash
  - HTTP 403 (Hobby-plan / insufficient-role case flagged in SPECS.md) ->
    a distinct `VercelPlanMismatchError` with an explanatory message,
    logged to `collector_errors` with kind `plan_mismatch_403`
  - other non-2xx responses, network errors, and malformed JSONL lines ->
    all logged, none crash the process
  - low remaining rate-limit budget (`x-ratelimit-remaining` header) ->
    logged as a warning
  - Run via `npm run collect:vercel` (needs `VERCEL_TOKEN` env var, and
    optionally `VERCEL_TEAM_ID`).
- **Claude Code statusline collector** (`collectors/claude/statusline.ts`):
  reads the JSON payload Claude Code passes on stdin to the `statusLine`
  hook, defensively validates `rate_limits.five_hour` /
  `rate_limits.seven_day` (`used_percentage`, `resets_at`), writes
  normalized records, and prints a short status-line string to stdout so
  the actual Claude Code UI keeps working. If the payload is invalid JSON,
  missing `rate_limits`, or has out-of-range/wrong-typed fields, it writes
  a `collector_errors` row (kinds: `invalid_json`, `missing_field`,
  `invalid_shape`) instead of crashing or dropping the read, and still
  prints a visible placeholder on the status line rather than going blank.

Both collectors were exercised directly (piping sample JSON to the
statusline script; running the Vercel collector with no token) and confirm
error rows land in `collector_errors` and valid data lands in
`usage_records` as expected — see verification commands below.

## What's NOT yet verified (needs real credentials/sessions)

- **Vercel**: written entirely against the documented FOCUS v1.3 JSONL
  schema (verified live against Vercel's docs on 2026-07-30, endpoint
  `GET /v1/billing/charges`), but never run against a real
  `VERCEL_TOKEN` or a real Pro/Enterprise team. Field values, exact 403
  body shape, and whether a Hobby-plan team actually 403s (vs. some other
  status) are unconfirmed. Set `VERCEL_TOKEN` (and optionally
  `VERCEL_TEAM_ID`) and run `npm run collect:vercel` to verify.
- **Claude statusline**: the parsing/validation logic was tested with
  hand-written sample payloads only (see commands below), not a real
  payload from a live Claude Code session. The hook is not yet wired into
  Claude Code settings (`statusLine` config) — that's a one-line addition
  to `~/.claude/settings.json` once the real payload shape is confirmed:

  ```json
  {
    "statusLine": {
      "type": "command",
      "command": "npx tsx C:/Users/Fourtys/Documents/Claude/Projects/token-app/collectors/claude/statusline.ts"
    }
  }
  ```

  Recommend running it once with a temporary logging wrapper (or just
  inspecting `data/token-app.db` after a live session) to confirm the real
  field names/types match what SPECS.md documents before trusting it long
  term, since SPECS.md explicitly flags this as an undocumented shape that
  could change.

## Deviations from SPECS.md / plan

- **Storage engine**: the task suggested SQLite via `better-sqlite3` or
  JSONL. `better-sqlite3` requires a native build (node-gyp + Python), and
  this machine has no usable Python interpreter for node-gyp, so
  `npm install` failed. Switched to Node's built-in `node:sqlite`
  (`DatabaseSync`, stable since Node 22.5, no native compilation needed).
  Same on-disk SQLite database and same schema — this is purely a driver
  swap, not a design change. `node:sqlite` is still marked experimental
  upstream; if that ever becomes a problem, swapping back to
  `better-sqlite3` (once Python/build tools are available) is a small,
  contained change limited to `storage/db.ts`.
- Everything else follows SPECS.md as documented (endpoint, auth, field
  names, error-handling requirements).

## Verification commands used

```sh
npm install
npx tsc --noEmit -p tsconfig.json

# Claude collector, valid payload
echo '{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1785000000},"seven_day":{"used_percentage":10,"resets_at":1785500000}}}' | npx tsx collectors/claude/statusline.ts

# Claude collector, malformed payload (defensive path)
echo '{"foo":"bar"}' | npx tsx collectors/claude/statusline.ts

# Vercel collector, no token set (defensive path)
npx tsx collectors/vercel/collect.ts
```

## Backend API server + scheduler + frontend wiring (2026-07-30)

Added the piece that was missing before: a real backend and a frontend that
actually reads from it, instead of `frontend/src/data/mockData.ts`.

- **`server/app.ts`** — a small Express API, no auth (single-user local
  tool). Endpoints:
  - `GET /api/usage` — latest reading per `(platform, metric)`.
  - `GET /api/usage/:platform` — full history for one platform
    (`?limit=` caps rows, default 2000).
  - `GET /api/errors` — recent `collector_errors` rows.
  - `POST /api/manual-log` — `{ platform, value, businessTag? }` (matches
    Settings.tsx's manual-log form); also accepts optional
    `metric`/`unit`/`window_start`/`window_end` overrides.
  - `GET /api/config` / `POST /api/config` — read/write which API
    keys are set (GET returns booleans only, never values).
- **`server/config.ts`** — local plaintext key storage at
  `data/local-config.json` (under the already-gitignored `/data/`
  directory — double-checked it never gets committed). `applyConfigToEnv()`
  copies saved keys into `process.env` so `npm run collect:*`,
  `npm run server`, and the scheduler all pick them up without the owner
  exporting env vars by hand. Values are never logged or printed anywhere
  (checked all three collectors for accidental token logging — none found;
  they only log a masked/absent-token message).
- **`server/scheduler.ts`** — `setInterval`-based runner: Vercel + OpenAI
  every 30 min, Codex every 15 min. Claude is deliberately **not** in this
  loop — it's a `statusLine` hook Claude Code itself invokes on every turn
  (push, not poll), so polling it makes no sense; see the statusline
  section above for its own wiring. Every job is wrapped in try/catch so a
  collector failure (missing token, HTTP error, etc — all of which the
  collectors already log to `collector_errors` themselves) can never crash
  the server process; the scheduler also writes its own backstop
  `collector_errors` row (kind `scheduler_uncaught`) for anything that
  slips past a collector's own handling.
- **`server/index.ts`** — combined process: starts the Express app and the
  scheduler together (kept as one process deliberately — a second process
  buys nothing for a single-user local tool). `NO_SCHEDULER=1` runs the API
  only.
- **Frontend** (`frontend/src/lib/api.ts`, `frontend/src/lib/alerts.ts`):
  plain fetch + a small `useFetch` hook (no React Query — kept deps
  minimal). `Home.tsx`, `PlatformDetail.tsx`, `Alerts.tsx`, `Settings.tsx`
  now fetch real data and render a loading state, an explicit "couldn't
  reach the API server" error state, and a "no data yet — run a collector"
  empty state instead of crashing on an empty/fresh DB. `Alerts.tsx` no
  longer uses hand-authored `MOCK_ALERTS`; `lib/alerts.ts` derives real
  alerts (approaching-limit, stale-collector, and a passthrough per
  `collector_errors` row) from live snapshots — there's still no
  baseline/burn-rate anomaly engine (CLAUDE.md Step 3/4 says "not
  started"), so burn-rate/idle-allowance/window-refreshed alert kinds
  aren't produced yet.
  `frontend/src/data/mockData.ts` is unchanged in shape but re-scoped: its
  `PLATFORMS` export is real static UI metadata and is still used; only
  `MOCK_USAGE_RECORDS`/`MOCK_ALERTS` are dev-only fakes, no longer
  rendered by the running app (see the comment at the top of that file).

### Running this end-to-end

```sh
# 1. one-time
npm install
cd frontend && npm install && cd ..

# 2. backend: API server + scheduler (same process), default port 8787
npm run server
# API only, no scheduler:
npm run server:no-scheduler

# 3. frontend dev server (separate terminal)
cd frontend && npm run dev
# open the printed localhost URL — Settings > API keys/tokens is where
# VERCEL_TOKEN / OPENAI_API_KEY actually get saved now (POST /api/config),
# instead of hand-editing files. Codex reads its own CLI login
# (~/.codex/auth.json) automatically, nothing to paste for it.
```

If the frontend can't reach `http://localhost:8787` (different port, CORS,
server not started), every page shows an explicit "couldn't reach the API
server — start it with `npm run server`" message rather than a blank
crash. Override the API base with `VITE_API_BASE` if the server isn't on
the default port.

**Manual fallback for API keys** if the Settings UI path has issues: set
`VERCEL_TOKEN` / `OPENAI_API_KEY` (and optionally `VERCEL_TEAM_ID`,
`CODEX_HOME`) as real env vars before running `npm run collect:*` /
`npm run server`, or hand-edit `data/local-config.json` directly (same
shape `POST /api/config` writes — plain JSON, gitignored, never logged).

### What's verified vs not (this pass)

Verified locally (no external credentials required):
- `npm run typecheck` and `npm run build` pass for the root project
  (collectors + storage + **server**).
- `cd frontend && npm run build` passes.
- API server starts against an empty DB; `GET /api/usage`,
  `GET /api/errors` return sensible empty arrays; `POST /api/manual-log`
  and `POST /api/config` round-trip correctly (curl-tested); saved config
  values confirmed present in `data/local-config.json` and confirmed
  *absent* from anything printed to the console.
- Scheduler starts, runs all three interval jobs immediately, and — with
  no `VERCEL_TOKEN`/`OPENAI_API_KEY` configured on this machine — correctly
  logs `missing_token` errors to `collector_errors` instead of crashing the
  process. The Codex job, notably, **succeeded for real** against this
  machine's already-logged-in Codex CLI session and wrote a live record —
  the first real end-to-end proof this pipeline works end to end, not just
  against synthetic data.

Not verified (no `VERCEL_TOKEN`/Admin `OPENAI_API_KEY` available in this
environment): Vercel collector against a real Pro/Enterprise team, OpenAI
organization-usage endpoint against a real Admin key, and the frontend
rendering real (not empty) usage data end-to-end in a browser — the API
shapes were confirmed by curl and the `useFetch`/selector code is unchanged
from what already worked against `MOCK_USAGE_RECORDS` (same `UsageRecord[]`
shape in, same components), but an actual browser render was not screenshot
-verified in this pass.

## Next steps

1. Get a real `VERCEL_TOKEN` and confirm plan tier, run
   `npm run collect:vercel` against it.
2. Wire the statusline script into `~/.claude/settings.json` and confirm
   the real payload shape against `SPECS.md` section 1a during a live
   session; adjust field validation if the shape differs.
3. Build the manual-log fallback for Gemini/Cursor/ChatGPT consumer tiers
   (per CLAUDE.md next actions), reusing the same `usage_records`/
   `collector_errors` schema.
4. Layer a scheduler (cron/Task Scheduler/Vercel cron) on top of
   `collect:vercel` once verified live.

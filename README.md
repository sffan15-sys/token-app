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

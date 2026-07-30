# token-app

Personal dashboard for AI-platform and Vercel usage. The dashboard and its
database are designed to run on Vercel; collectors that depend on local CLI
state keep running on the owner's computer and push normalized readings to the
hosted API.

See `CLAUDE.md` for project context and standing authorization, and `SPECS.md`
for the source/stability notes for each platform.

## Architecture

```text
Claude Code statusLine ─┐
Codex CLI collector ────┤
Vercel/OpenAI/Gemini ───┼─ local HTTPS ingest + shared secret
collectors              │
local setInterval runner┘
                              │
                              ▼
Vercel Express Function ── Neon Postgres
          ▲                    (usage_records,
          │                     collector_errors)
          │
Vercel CDN-hosted React dashboard
```

Production target on Vercel:

- The Vite/React frontend, built into `public/` for Vercel's CDN.
- The Express app exported by root `app.ts`, which Vercel runs as one Fluid
  compute function. It never calls `listen()` and never starts a scheduler.
- The two-table Postgres store: `usage_records` and `collector_errors`.
- Read APIs and secret-protected write/ingest APIs.

Still local-only:

- `server/index.ts`, which starts the local companion API and interval
  scheduler.
- `server/scheduler.ts`, which polls Vercel, Codex, OpenAI, and Gemini.
- Claude's `collectors/claude/statusline.ts` hook, invoked by Claude Code after
  turns rather than polled.
- Local CLI credentials and `data/local-config.json`.

There is no production SQLite file and no hosted background loop. Postgres is
the single source of truth read by the deployed dashboard.

### Why the database is called Neon

Vercel Postgres was retired for new projects and replaced by Postgres providers
in the Vercel Marketplace. This project uses the Neon native integration, the
direct replacement recommended by Vercel. Neon has a free plan, connects to
Hobby projects, and injects `DATABASE_URL`. `storage/db.ts` also accepts
`POSTGRES_URL` for compatibility.

The app uses `@neondatabase/serverless` over HTTP, which is appropriate for
short-lived Vercel invocations and avoids maintaining a TCP pool in each
function instance.

Current references checked for this migration:

- [Postgres on Vercel](https://vercel.com/docs/postgres)
- [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage)
- [Vercel CLI integration commands](https://vercel.com/docs/cli/integration)
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Neon on Vercel Marketplace](https://vercel.com/marketplace/neon)
- [Neon serverless driver](https://www.npmjs.com/package/@neondatabase/serverless)

## API

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/usage` | Public | Latest row per `(platform, metric)` |
| `GET` | `/api/usage/:platform` | Public | Time-ascending platform history |
| `GET` | `/api/errors` | Public | Recent collector errors |
| `GET` | `/api/health` | Public | Runtime health/mode |
| `GET` | `/api/config` | Public | Local status locally; no hosted credentials are exposed |
| `POST` | `/api/ingest` | Shared secret on Vercel | Collector batch ingest |
| `POST` | `/api/manual-log` | Shared secret on Vercel | Generic manual reading |
| `POST` | `/api/config` | Local-only; protected/rejected when hosted | Save local collector configuration |

Hosted writes require:

```http
X-Token-App-Secret: <TOKEN_APP_WRITE_SECRET>
```

The local collector helper sends the value in `TOKEN_APP_API_SECRET`. These
are two names for the same shared secret on opposite sides of the connection.
Use a random value of at least 32 bytes. It is deliberately simple shared-key
protection for a single-owner tool, not a multi-user authentication system.

## First-time hosted setup

Requirements:

- Node.js 22.5 or newer
- npm
- Vercel CLI 47.0.5 or newer
- An authenticated Vercel CLI session

Install and verify both packages:

```sh
npm install
npm --prefix frontend install
npm run typecheck
npm run build
npm --prefix frontend run build
```

Link or create the Vercel project:

```sh
npx vercel link
```

Provision the current Vercel Marketplace replacement for Vercel Postgres:

```sh
npx vercel integration add neon --name token-app-db
```

The command prompts for Neon's free plan and region, connects the resource to
the linked project, injects `DATABASE_URL`, and pulls development environment
variables unless told not to. Confirm with:

```sh
npx vercel integration list
npx vercel env ls
```

Generate one random secret without committing it, then add the same value as
`TOKEN_APP_WRITE_SECRET` to Vercel's Production environment (and Preview too
if collectors will ever target preview deployments):

```sh
npx vercel env add TOKEN_APP_WRITE_SECRET production
npx vercel env add TOKEN_APP_WRITE_SECRET preview
```

Deploy production:

```sh
npx vercel --prod
```

Vercel runs `npm run vercel-build`, which typechecks/builds the root project,
installs the nested frontend package from its lockfile, and emits the frontend
into root `public/`. Vercel detects root `app.ts` as the Express Function.

The schema is created idempotently on the first database-backed request. No
separate migration command is required for the initial two-table schema.

## Configure and run local collectors

The hosted dashboard is intentionally read-only for collector credentials: a
webpage running on Vercel cannot write a file on the owner's computer.

Run the local companion and local Vite UI:

```sh
npm run server
npm --prefix frontend run dev
```

Open the local Vite URL, then use Settings to save:

- `TOKEN_APP_API_URL`: the production deployment base URL, for example
  `https://token-app.example.vercel.app`
- `TOKEN_APP_API_SECRET`: the exact value saved on Vercel as
  `TOKEN_APP_WRITE_SECRET`
- any platform credentials used by the pollable collectors

Settings writes these values to gitignored `data/local-config.json`. Existing
secret values are represented as set/unset booleans and are never returned to
the browser.

Environment variables are an equivalent fallback:

```sh
TOKEN_APP_API_URL=https://token-app.example.vercel.app
TOKEN_APP_API_SECRET=<same-shared-secret>
```

`server/scheduler.ts` runs:

- Codex every 15 minutes
- Vercel, OpenAI, and Gemini every 30 minutes

Every run calls `applyConfigToEnv()`, fetches locally accessible/platform data,
normalizes it, and posts it through `collectors/ingest.ts`. Collector failures
are posted to the same hosted store so the public `/api/errors` feed still
shows broken or stale integrations.

Run one collector directly:

```sh
npm run collect:codex
npm run collect:vercel
npm run collect:openai
npm run collect:gemini
```

### Claude Code statusline

Claude is push-driven rather than scheduled. Configure Claude Code to invoke:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx tsx C:/Users/Fourtys/Documents/Claude/Projects/token-app/collectors/claude/statusline.ts"
  }
}
```

The hook loads the same local config, posts valid normalized windows or a
defensive collector error to Vercel, and still prints the short status string
Claude Code expects.

## Verification

Repository-side verification completed on 2026-07-30:

- Root TypeScript typecheck and emitted build pass.
- Frontend TypeScript/Vite production build passes.
- Source-scoped frontend lint passes.
- The local collector transport was contract-tested against a mock HTTP
  server, including the secret header and normalized usage/error bodies.
- The hosted Express surface was contract-tested with an in-memory database
  stub: public health/usage reads, `401` without the write secret, `201` with
  the secret, and hidden hosted config status all behaved as intended.

Those tests do not substitute for the required account-side checks. The
deployment is complete only after a real Neon resource is connected, a
production URL loads, `/api/usage` reaches the real database, and a local Codex
collector record appears through that URL.

Build verification:

```sh
npm run typecheck
npm run build
npm --prefix frontend run build
```

Hosted smoke checks:

```sh
curl https://<deployment>/api/health
curl https://<deployment>/api/usage
curl https://<deployment>/api/errors
```

A direct protected ingest probe can use a synthetic platform name:

```sh
curl -X POST https://<deployment>/api/ingest \
  -H "Content-Type: application/json" \
  -H "X-Token-App-Secret: <shared-secret>" \
  -d '{"records":[{"platform":"deployment-check","window_start":"2026-07-30T00:00:00.000Z","window_end":"2026-07-30T00:01:00.000Z","metric":"round_trip","value":1,"unit":"count","fetched_at":"2026-07-30T00:01:00.000Z"}]}'
```

Then query:

```sh
curl https://<deployment>/api/usage/deployment-check
```

The preferred real round trip is `npm run collect:codex`, because it reads the
owner's already-authenticated local Codex state and proves the complete path:
local-only source, normalized POST, protected Vercel API, Postgres write, and
public API read.

## Redeploying

From the repository root:

```sh
npm run typecheck
npm run build
npm --prefix frontend run build
npx vercel --prod
```

If the GitHub repository is connected in Vercel, pushes to `main` may also
deploy automatically. The explicit CLI command remains the reproducible manual
path and prints the production URL.

## Local configuration

`server/config.ts` recognizes:

- Hosted target: `TOKEN_APP_API_URL`, `TOKEN_APP_API_SECRET`
- Vercel collector: `VERCEL_TOKEN`, `VERCEL_TEAM_ID`
- OpenAI collector: `OPENAI_API_KEY`
- Codex collector: `CODEX_HOME` (optional; defaults to `~/.codex`)
- Gemini collector: `GOOGLE_APPLICATION_CREDENTIALS`,
  `GEMINI_GCP_PROJECT_ID`
- Plan overrides: `CLAUDE_PLAN`, `CODEX_PLAN`, `GEMINI_PLAN`,
  `VERCEL_PLAN`, `CURSOR_PLAN`

The hosted function needs only its database integration variables,
`TOKEN_APP_WRITE_SECRET`, and optional non-secret plan override variables.
Platform account credentials stay local.

## Running a second, isolated instance

The old local-only design used `DATA_DIR` to isolate a second SQLite database.
The hosted database is now intentionally single-owner and has no tenancy
column, so two people must not point collectors at the same deployment.

For a genuinely isolated second owner:

1. Create a second Vercel project.
2. Provision/connect a separate Neon database.
3. Set a different `TOKEN_APP_WRITE_SECRET`.
4. Use a separate local `DATA_DIR` for that person's
   `local-config.json`, plus the second deployment URL/secret.

Example for the second local companion:

```sh
DATA_DIR=/path/to/second-owner-config PORT=8788 npm run server
```

`DATA_DIR` now isolates only local credentials/preferences. Hosted usage data
is isolated by using a different Vercel project and database.

## Collector source notes

- Vercel: documented FOCUS `/v1/billing/charges` collector; a real billing
  token/eligible team is still required for live charge data.
- Codex: verified local CLI OAuth state plus the internal `wham/usage`
  endpoint; source-reported `plan_type` is retained.
- OpenAI: documented rate-limit headers and Admin organization usage API.
- Gemini: documented Cloud Monitoring `consumer_quota` time series.
- Claude: best-effort, defensively validated Claude Code statusline payload.
- Cursor: intentionally unavailable for individual plans; there is no
  manual/fake fallback.

See `SPECS.md` for complete auth, field, refresh, and stability details.

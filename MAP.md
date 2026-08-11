# MAP.md

<!-- Purpose: make codebase exploration unnecessary — for the orchestrator
     AND every agent it briefs. One line per file/area. If anyone ever has
     to grep around asking "where does X live," that's a MAP.md bug — fix
     it here. Cap: 150 lines.
     SEEDED 2026-08-11 from CLAUDE.md/README.md/package.json during the
     orchestrator-kit adoption — row-level detail should be filled in the
     first time each area is actually worked on; correct anything the docs
     had drifted from. -->

## Conventions

- Node >=22.5, ESM (`"type": "module"`), TypeScript via `tsx` for dev
  execution, `tsc -p tsconfig.json` for build. Typecheck:
  `npm run typecheck`.
- New platform integration = a new `collectors/<platform>/` folder with a
  `collect.ts`, run via a `collect:<platform>` npm script; it normalizes
  readings and pushes through the shared ingest path — never its own
  storage layer.
- Collectors that read local CLI credentials/state run ONLY on the
  owner's machine, never hosted. The hosted side receives normalized
  records via the protected ingest endpoint (write secret).
- Before building on any platform-limit claim, re-verify it against live
  docs (CLAUDE.md Step-1 table is a hypothesis, not fact).

## Areas

| Path | Responsibility | Don't |
|------|----------------|-------|
| `collectors/vercel/collect.ts` | Vercel billing/usage collector (official API) | Needs eligible live VERCEL_TOKEN/team — not yet verified live |
| `collectors/claude/statusline.ts` | Claude Code statusline collector | Not yet wired into ~/.claude/settings.json or tested on a real payload |
| `collectors/codex/collect.ts` | Codex local-state collector | Local-only — reads owner's CLI state |
| `collectors/openai/collect.ts` | OpenAI API usage collector | — |
| `collectors/gemini/collect.ts` | Gemini usage via Cloud Monitoring | API-only per owner override — no manual/fake data path |
| `collectors/ingest.ts` | Shared normalize-and-push to hosted ingest | The only path collectors use to persist |
| `storage/db.ts` | Neon Postgres storage layer | Don't add a second persistence path |
| `server/index.ts` | Express API + local `setInterval` scheduler | Scheduler stays local (`NO_SCHEDULER=1` to disable) |
| `api/` | Vercel serverless entry (rewrites `/api/:path*` → `/api`) | — |
| `frontend/` | Vite dashboard (built into `public/` by vercel-build) | — |
| `public/` | Built dashboard output | Generated — never hand-edit |
| `types/` | Shared TypeScript types | — |
| `data/`, `research/`, `design/` | Working data / platform research / design notes | — |
| `dist/` | tsc build output | Generated — never hand-edit |
| `SPECS.md` | Verified platform API reality (Step-1 conclusions) | — |
| `skills-lock.json`, `.claude/skills/`, `.agents/skills/` | Pinned neon/neon-postgres agent skills | Don't edit by hand — managed by skills tooling |

## Dead / do-not-touch

- `node_modules/`, `dist/`, `public/` — generated or vendored.

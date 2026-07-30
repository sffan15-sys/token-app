# Platform data specs

Exact fields, sources, and access method for each platform, ranked by how
solid the data source is. "Official tier" = documented and stable.
"Best-effort tier" = real and working today but undocumented/could break.

Each entry: **Source** (what we read) · **Auth** (what credential it needs)
· **Fields** (what we get) · **Refresh cadence** (when the number updates)
· **Stability risk**.

---

## 1. Claude (Anthropic) — best-effort tier for consumer, official for API

### 1a. Consumer session/weekly limits (Pro/Max) — the one you asked about first

- **Source:** Claude Code's `statusLine` hook JSON payload (stdin), shipped
  since CLI v2.1.6. Read by writing a tiny statusline script that, instead
  of (or in addition to) rendering a status line, appends the payload to a
  local file.
- **Auth:** none needed beyond being logged into Claude Code normally — it's
  local state Claude Code already has.
- **Fields:**
  - `rate_limits.five_hour.used_percentage` (0–100)
  - `rate_limits.five_hour.resets_at` (unix epoch seconds)
  - `rate_limits.seven_day.used_percentage` (0–100)
  - `rate_limits.seven_day.resets_at` (unix epoch seconds)
- **Refresh cadence:** updates after each API turn within an active Claude
  Code session. This pool is shared with claude.ai chat usage, so it
  reflects total usage, but the number only *refreshes* when Claude Code
  itself sends a request — chat-only usage won't update the file until the
  next Claude Code turn.
- **Stability risk:** MEDIUM. Not a committed public API — Anthropic has
  closed multiple feature requests asking for a stable `claude usage --json`
  (e.g. anthropics/claude-code#38380). The statusline JSON shape could
  change without notice between CLI versions. Collector must validate shape
  on every read and alert (not silently degrade) if fields go missing.

### 1b. API-key usage (if/when used) — official

- **Source:** Admin API `/v1/organizations/usage_report/messages` and
  `/v1/organizations/cost_report`.
- **Auth:** Admin API key (org owner/admin role — not the same as a normal
  API key, and not present on a plain consumer Pro/Max account with no org).
- **Fields:** token counts and cost-in-dollars, bucketed by time
  (`bucket_width`), broken down by model/workspace/service tier.
- **Refresh cadence:** query on demand, any historical range.
- **Stability risk:** LOW — documented, versioned API.

### 1c. Per-request rate-limit headers (only relevant if calling the API directly)

- **Source:** HTTP response headers on every Anthropic API call.
- **Fields:** `anthropic-ratelimit-requests-limit/-remaining/-reset`,
  `anthropic-ratelimit-input-tokens-remaining`,
  `anthropic-ratelimit-output-tokens-remaining`, and for Max/unified plans
  `anthropic-ratelimit-unified-tokens-*`.
- **Stability risk:** LOW, documented. Only useful if the app itself makes
  API calls (e.g. via an agent) — not applicable to passive monitoring.

---

## 2. ChatGPT / OpenAI / Codex

### 2a. Consumer session/weekly limits (Plus/Pro, Codex 5hr + weekly) — best-effort

- **Source:** Codex CLI's own stored OAuth token, used to call the same
  internal endpoint the CLI itself calls: `GET /api/codex/usage`. Proven
  approach — community tool `xiangz19/codex-ratelimit` already does this.
- **Auth:** Codex CLI's local credential file (same trust boundary as
  Claude's `.credentials.json` approach — reading your own CLI's own stored
  session, not a scraped browser cookie).
- **Fields (expected, to verify against the endpoint's actual live shape
  when we build this):** 5-hour window used %, 5-hour reset time, weekly
  window used %, weekly reset time, pay-as-you-go credit balance if
  applicable.
- **Refresh cadence:** on demand, poll whenever we want a fresh read (unlike
  Claude's push-only-on-turn model, this looks like a pollable GET).
- **Stability risk:** MEDIUM-HIGH. This is an internal, undocumented
  endpoint — no public commitment it stays available or shaped the same
  way. There's an open feature request (openai/codex-plugin-cc#102) for an
  official `codex usage --json` which would immediately supersede this if
  shipped — check for that before building, and swap to it if available.

### 2b. API-key usage (pay-per-token dev usage) — official

- **Source:** `https://api.openai.com/v1/usage` plus response headers
  `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`,
  `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`,
  `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`.
- **Auth:** standard OpenAI API key.
- **Refresh cadence:** headers on every call; `/v1/usage` queryable with
  `start_date`/`end_date` on demand.
- **Stability risk:** LOW, documented.

---

## 3. Gemini (Google)

### 3a. Gemini Advanced (consumer, via Google One AI Premium) — unresolved, likely dashboard-only

- No local CLI-equivalent to Claude Code/Codex CLI was found exposing a
  consumer quota field. Google's own usage surface for this tier appears to
  be the account billing/subscription page only.
- **Fallback:** manual one-tap logging, same as the generic fallback in
  CLAUDE.md, until/unless a local source is found. Worth a follow-up check
  if the Gemini CLI (if the owner starts using it) exposes anything similar
  to Claude Code's statusline JSON — didn't confirm either way yet.

### 3b. Gemini API (AI Studio key or Vertex, pay-per-token / quota-based) — official, two paths

- **Path 1 — AI Studio dashboard quota view:** RPM/TPM/RPD per model are
  visible in the AI Studio project dashboard. No confirmed public REST
  endpoint for this specific view yet — needs a direct check against
  `ai.google.dev` docs before assuming dashboard-only.
- **Path 2 — Google Cloud quota/monitoring APIs:** since AI Studio/Vertex
  keys are tied to a GCP project, actual consumption should be queryable
  through Cloud Monitoring metrics (`serviceruntime.googleapis.com/quota/...`)
  or the Service Usage API, using a service account with Monitoring Viewer
  role on that project. This is the official, non-scraping path and should
  be tried first — **not yet verified working for this specific quota type,
  flag as needs-spike** before relying on it.
- **Auth:** GCP service account (Monitoring Viewer) for path 2, or plain
  API key for basic call-level rate limit headers if Gemini API returns
  them (needs confirming — not yet verified in this research pass).

---

## 4. Vercel — official, cleanest integration of the five

- **Source:** REST API — usage/billing endpoint (`/billing/charges`,
  FOCUS v1.3 standard format) plus general `/v2/*` usage endpoints.
- **Auth:** personal access token with appropriate scope. **Billing/charges
  data requires a Pro or Enterprise team** — confirm the owner's plan tier
  before assuming this endpoint is reachable on a Hobby plan.
- **Fields:** usage/cost data at 1-day granularity, up to 1-year range,
  streamed as JSONL. Standard `X-RateLimit-Limit/-Remaining/-Reset` headers
  on all API calls for API-call-rate awareness (distinct from
  billing/usage).
- **Refresh cadence:** on-demand query, any date range within a year.
- **Stability risk:** LOW, documented, versioned.

---

## 5. Cursor

- No official API or local-file source for usage/limit data was found in
  this research pass. Usage is metered as a dollar pool
  ($-denominated "included usage," resets on billing date, not calendar
  month), visible only in the Cursor dashboard (cursor.com).
- **Fallback for now:** manual one-tap logging, same pattern as Gemini
  consumer tier. Flag as needs-follow-up-research — worth checking whether
  Cursor's CLI mode (if the owner uses it) or a settings-sync file under
  `~/.cursor` exposes anything analogous to Claude Code's statusline JSON,
  since Cursor is itself a Claude Code-adjacent tool and may have converged
  on similar patterns. Not confirmed either way yet.

---

## Summary table

| Platform | Best available source | Tier | Confidence |
|---|---|---|---|
| Claude (consumer) | Claude Code statusline JSON | best-effort | High — confirmed shipping |
| Claude (API) | Admin API usage_report | official | High |
| OpenAI/Codex (consumer) | Codex CLI's internal `/api/codex/usage` via stored token | best-effort | Medium — confirmed used by a community tool, not us yet |
| OpenAI (API) | `/v1/usage` + rate-limit headers | official | High |
| Gemini (consumer) | none found | manual fallback | Low — needs more research |
| Gemini (API) | Cloud Monitoring quota metrics (hypothesis) | official (unverified) | Needs spike |
| Vercel | `/billing/charges` + `/v2` usage | official | High (pending plan-tier check) |
| Cursor | none found | manual fallback | Low — needs more research |

## Build order implied by confidence

1. Vercel (official, fully specified, just needs the plan-tier check).
2. Claude consumer via statusline (highest-value target, confirmed working
   mechanism).
3. Codex consumer via internal endpoint (confirmed by precedent, needs our
   own verification pass against the live endpoint before trusting field
   names above).
4. OpenAI API usage (official, trivial, low priority since it's the least
   asked-about pool).
5. Gemini and Cursor: ship manual logging now, spike the Cloud Monitoring
   path for Gemini and the Cursor CLI/local-file question in parallel with
   early usage of 1–3.

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
  - The current official statusLine schema also exposes model, session,
    context-window, client-side estimated session cost, and related runtime
    fields, but **does not expose the account's subscription plan or tier**.
    Therefore no Claude monthly subscription price can be derived from this
    source.
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
  internal endpoint the CLI itself calls:
  `GET https://chatgpt.com/backend-api/wham/usage` (verified live).
- **Auth:** Codex CLI's local credential file (same trust boundary as
  Claude's `.credentials.json` approach — reading your own CLI's own stored
  session, not a scraped browser cookie).
- **Fields (verified live 2026-07-30):** top-level `plan_type`; duration-
  labelled rate-limit windows with used %, duration, and reset time; optional
  credit balance; additional/code-review limit objects.
- **Cost derivation:** the collector promotes the real `plan_type` into the
  normalized record schema. Fixed individual plans are mapped to current
  public list prices. As of 2026-07-30, Plus is $20/month; Pro has separate
  $100 (5x) and $200 (20x) variants, so a bare `pro` identifier is not enough
  to choose a price. Business/Team is per-seat and also needs seat count and
  billing cadence. Ambiguous plans remain explicitly unknown.
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

### 3a. Gemini Advanced (consumer, via Google One AI Premium) — intentionally not integrated

- No official API or confirmed local source exposes the consumer
  subscription's remaining allowance.
- Per the owner's explicit "API or nothing" direction, Gemini has **no
  manual-log fallback**. Consumer-session usage remains absent unless Google
  publishes a viable API/local data source.

### 3b. Gemini API (AI Studio key or Vertex, quota-based) — official collector built

- **Source:** Cloud Monitoring API v3 `projects.timeSeries.list`, reading the
  documented `serviceruntime.googleapis.com/quota/*` metric family for the
  `consumer_quota` resource.
- **Service filters:** `generativelanguage.googleapis.com` for direct
  Gemini/AI Studio traffic and `aiplatform.googleapis.com` for Vertex-routed
  Gemini traffic.
- **Auth:** `GOOGLE_APPLICATION_CREDENTIALS` points to a service-account JSON
  key with `roles/monitoring.viewer`; `GEMINI_GCP_PROJECT_ID` identifies the
  GCP project tied to the Gemini API key.
- **Fields:** quota usage, limits, and exceeded values, retaining quota
  dimension labels in normalized `UsageRecord.metric` names. Cloud Monitoring
  `INT64`, `DOUBLE`, and `BOOL` values normalize to the shared numeric schema.
  These quota TimeSeries contain no consumer subscription or billing-plan
  field, so they cannot supply a Gemini monthly subscription cost.
- **Implementation:** `collectors/gemini/collect.ts`; runnable with
  `npm run collect:gemini` and included in the local scheduler.
- **Verification state:** endpoint/filter/auth/response shapes are verified
  against Google's current official documentation. No live GCP credential is
  available in this environment, so the OAuth exchange, Gemini-specific label
  values, and real response bytes still require one live run.
- **Failure behavior:** missing credentials/project ID and malformed
  responses write `collector_errors` and return no/partial data instead of
  crashing. The UI shows real quota rows, "No data yet", or collector errors;
  it never substitutes a manual reading.

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
- **Cost derivation:** sum the returned FOCUS `BilledCost` values for the
  current month into `billing_period_cost`. This is the real net billing data;
  do not add a static Vercel seat-price guess on top.
- **Refresh cadence:** on-demand query, any date range within a year.
- **Stability risk:** LOW, documented, versioned.

---

## 5. Cursor — intentionally not integrated for an individual plan

- Cursor now documents an Admin API with team-scoped endpoints such as
  `/teams/daily-usage-data`, `/teams/filtered-usage-events`, and
  `/teams/spend`.
- That API is gated to Team/Business/Enterprise plans. An individual
  Cursor Pro/Pro+ subscriber cannot mint the required Admin API key, and no
  confirmed CLI/local-file source exposes the included-usage pool.
- Per the owner's explicit "API or nothing" direction, Cursor has **no
  manual-log fallback and no fake telemetry**. It remains listed as a known
  platform, but the UI reads: **"Not connected — no API available on
  individual plans."**
- If the account later gains team-tier Admin API access, build a real
  collector against the documented endpoints and change the availability
  state; until then there is deliberately no data path.

---

## Summary table

| Platform | Best available source | Tier | Confidence |
|---|---|---|---|
| Claude (consumer) | Claude Code statusline JSON | best-effort | High — confirmed shipping |
| Claude (API) | Admin API usage_report | official | High |
| OpenAI/Codex (consumer) | Codex CLI's internal `/api/codex/usage` via stored token | best-effort | Medium — confirmed used by a community tool, not us yet |
| OpenAI (API) | `/v1/usage` + rate-limit headers | official | High |
| Gemini (consumer) | none available | intentionally not integrated; no manual fallback | Confirmed unavailable via current research |
| Gemini (API) | Cloud Monitoring `serviceruntime.googleapis.com/quota/*` via `timeSeries.list` | official collector built | Docs-verified; live credential run pending |
| Vercel | `/billing/charges` + `/v2` usage | official | High (pending plan-tier check) |
| Cursor (individual Pro/Pro+) | none viable; Admin API is team-plan gated | intentionally unavailable; no manual/fake data | High |

## Build order implied by confidence

1. Vercel (official, fully specified, just needs the plan-tier check).
2. Claude consumer via statusline (highest-value target, confirmed working
   mechanism).
3. Codex consumer via internal endpoint (confirmed by precedent, needs our
   own verification pass against the live endpoint before trusting field
   names above).
4. OpenAI API usage (official, trivial, low priority since it's the least
   asked-about pool).
5. Gemini API: Cloud Monitoring collector built; run once with a real
   Monitoring Viewer service account to confirm live labels/response bytes.
6. Cursor: no build on an individual plan. Revisit only if team-tier Admin
   API access becomes available.

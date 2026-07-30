# Gemini API quota/usage spike - findings (2026-07-30)

Researched per SPECS.md 3b: is Google Cloud Monitoring's quota-metrics path
real and reachable for Gemini API (AI Studio key or Vertex-backed) usage,
and do Gemini API responses carry rate-limit headers like OpenAI's.

## Short answer

**Yes, real and reachable.** The Cloud Monitoring quota-metrics path is not
a hypothesis that needs more spiking - it's standard, documented Google
Cloud behavior that applies to any API consumed through a GCP project,
including `generativelanguage.googleapis.com` (the Gemini API). Not yet
built/tested against a live key on this machine (no GCP service account or
Gemini API key configured here), but the mechanism itself is confirmed via
Google's own docs, not just precedent.

**No**, there is no discovered Anthropic/OpenAI-style `x-ratelimit-remaining`
response header on Gemini API calls. See "Rate-limit headers" below - this
needs the caveat spelled out, not a flat no.

## How the AI-Studio-key -> GCP-project -> quota-metrics chain works

1. Every Gemini API key (created via Google AI Studio) is a credential
   *attached to a specific Google Cloud project* - AI Studio either creates
   one for you or lets you pick an existing one at key-creation time. This
   isn't optional; there is no keyless/projectless Gemini API key.
2. All calls made with that key consume quota against
   `generativelanguage.googleapis.com` as a "consumed API" inside that
   project - the same mechanism used for every other Google Cloud API
   (Compute, Storage, etc).
3. Google Cloud Monitoring automatically records per-project quota
   consumption for every consumed API as `serviceruntime.googleapis.com`
   metrics - no opt-in/instrumentation needed, it's on by default for any
   GCP project.
4. Therefore: give a service account **Monitoring Viewer** (or broader) role
   on that same project, and it can read the Gemini API's live quota
   consumption via the standard Cloud Monitoring API, no different from
   monitoring quota for any other Google API.

This is confirmed as a general Cloud Monitoring capability directly in
Google's docs (`docs.cloud.google.com/monitoring/alerts/using-quota-metrics`,
`docs.cloud.google.com/apis/docs/monitoring`) - the "Consumed API" resource
type in Metrics Explorer and the `serviceruntime.googleapis.com/quota/*`
metric family apply per-service, and `generativelanguage.googleapis.com` is
just another service name in that family like any other Google Cloud API.

One caveat worth flagging (found via a real bug report on Google's own AI
dev forum): quota errors have been observed where a call attributed to
`aiplatform.googleapis.com` fails even though the Gemini API's own quota
view shows headroom - i.e. depending on which surface issues the call
(direct Gemini API vs. Vertex AI's `aiplatform.googleapis.com` surface),
the relevant service name for the metric filter may differ. When building
this for real, check both service names
(`generativelanguage.googleapis.com` for AI-Studio-key calls,
`aiplatform.googleapis.com` for Vertex-routed calls) rather than assuming
only one.

## Exact API call (once we're ready to build it)

- **Auth:** GCP service account key/ADC with `roles/monitoring.viewer` on
  the project the Gemini API key belongs to.
- **Call:** Cloud Monitoring API v3 `timeSeries.list`:
  ```
  GET https://monitoring.googleapis.com/v3/projects/{PROJECT_ID}/timeSeries
    ?filter=metric.type="serviceruntime.googleapis.com/quota/allocation/usage"
            AND resource.label."service"="generativelanguage.googleapis.com"
    &interval.startTime=...&interval.endTime=...
  ```
  Other relevant metric types in the same family:
  `serviceruntime.googleapis.com/quota/limit`,
  `serviceruntime.googleapis.com/quota/exceeded`,
  `serviceruntime.googleapis.com/quota/concurrent/usage`.
- Normalizing into the shared schema is straightforward: each time series
  point becomes one `usage_records` row keyed by the metric's quota
  dimension (e.g. `requests_per_minute`, `tokens_per_minute`) as `metric`,
  the point value as `value`, and `unit: "count"`.

## Rate-limit headers on direct Gemini API calls

Not confirmed to exist in the same documented, stable form as OpenAI's
`x-ratelimit-*` or Anthropic's `anthropic-ratelimit-*` headers. What was
found:
- Google's own rate-limit docs (`ai.google.dev/gemini-api/docs/rate-limits`)
  describe limits (RPM/TPM/RPD/IPM per model/tier) but as far as this
  research pass found, do not document a standard always-present response
  header exposing remaining quota per call the way OpenAI/Anthropic do.
- Some secondary sources (blog posts, not Google docs) mention
  `x-ratelimit-remaining`-style headers appearing on *some* responses, but
  this wasn't corroborated against Google's own API reference and should be
  treated as unverified until someone checks real response headers from a
  live call.
- **Actionable next step, cheap to do:** make one real Gemini API call with
  a live AI Studio key and dump all response headers (`curl -i` or
  equivalent) to settle this definitively. Not done in this pass - no
  Gemini API key was available on this machine.

## Recommendation

- Don't build the collector yet (no GCP service account / Gemini API key on
  this machine to test against), but this is no longer "needs a spike" per
  SPECS.md - the mechanism is confirmed real. Downgrade from "hypothesis"
  to "known-good path, pending an actual key/service-account to wire up and
  verify field names against a live `timeSeries.list` response."
- When the owner is ready: (1) create/locate the GCP project backing their
  Gemini API key, (2) create a service account with Monitoring Viewer on
  that project, (3) do one live `timeSeries.list` call and check the exact
  response shape before writing the collector, (4) in the same pass, dump
  headers from one direct Gemini API call to resolve the rate-limit-header
  question above.
- Gemini Advanced (consumer, Google One AI Premium) remains unresolved -
  this research pass was scoped to the API-key/Vertex path per SPECS.md 3b,
  not the consumer subscription tier (3a), which still has no known API
  path and stays on manual-log fallback.

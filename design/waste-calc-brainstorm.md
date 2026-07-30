# Waste calculation brainstorm

Date: 2026-07-30

## Product question

The app needs to answer two related but different questions:

1. What does each platform cost each month?
2. How much prepaid value is probably going unused?

A plan picker can answer the first question when an API cannot. It cannot, by
itself, answer the second. Each provider sells and reports allowance in a
different unit, and most consumer AI plans intentionally do not publish a
literal token bucket.

The UI should therefore avoid a single fake-precision formula. It should use
the strongest provider-specific evidence available and label the confidence of
the result.

## Verified plan and allowance facts

All prices below are public US list prices before tax, checked against official
provider pages on 2026-07-30. Promotional prices are not used.

| Platform | Fixed-price plans useful to this personal app | Published allowance shape |
| --- | --- | --- |
| Claude | Free $0; Pro $20 monthly or $200/year; Max 5x $100; Max 20x $200 | Anthropic reports rolling 5-hour and weekly limit percentages, but no fixed token or message ceiling. Max is explicitly 5x or 20x Pro usage. |
| ChatGPT / Codex | Free $0; Go $8; Plus $20; Pro 5x $100; Pro 20x $200 | OpenAI reports Codex rolling-window percentages. The two Pro tiers are explicitly 5x and 20x Plus, but literal token ceilings are not published and limits can vary. |
| Gemini | Free $0; Google AI Plus $9.99; Google AI Pro $19.99; Google AI Ultra $249.99 | Google describes relative consumer limits (Plus 2x no-plan, Pro 4x no-plan, Ultra up to 20x Pro), not a stable token bucket. The app's connected Cloud Monitoring data is API-project quota and is unrelated to the consumer Google One subscription. |
| Cursor | Hobby $0; Pro $20; Pro+ $60; Ultra $200 | Cursor publishes guaranteed API-agent usage value rather than tokens: $20, $70, and $400 respectively, plus variable bonus usage. The individual account is not connected to this app, so the allowance is known but actual consumption is not. |
| Vercel | Hobby $0; Pro $20 | Pro includes a published $20 monthly usage credit, then pay-as-you-go overage. The FOCUS billing collector can report real charges and usage-category value. |

Custom-priced Enterprise plans are intentionally not offered as fixed-price
choices. A public knowledge base cannot turn a negotiated invoice into a known
monthly amount.

Sources:

- [Claude pricing](https://claude.com/pricing)
- [Claude Max pricing](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
- [ChatGPT Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)
- [ChatGPT Pro tiers](https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro)
- [ChatGPT pricing](https://chatgpt.com/pricing/)
- [Google One plans](https://one.google.com/about/plans)
- [Google AI plans](https://one.google.com/about/google-ai-plans/)
- [Cursor pricing](https://cursor.com/pricing)
- [Cursor models and pricing](https://docs.cursor.com/account/pricing)
- [Vercel pricing](https://vercel.com/pricing)

## Approaches considered

### 1. Invent a token allowance per plan

Reject. Token consumption depends on model, cached input, context, tool use,
output length, and provider policy. A reverse-engineered token ceiling would
look precise while being unstable and often wrong.

### 2. Monthly cost times the latest unused window percentage

Reject. A current window early in its lifecycle will naturally look mostly
unused. Using it would exaggerate waste and make the number swing after every
request.

### 3. Monthly cost times average unused percentage across observed windows

Use with safeguards for Claude and Codex. For each completed observed window,
take its final/highest collected used percentage. Average completed windows by
limit type. When both short and weekly limits exist, use the more-utilized
average as the plan utilization proxy; this is conservative and avoids
claiming high waste when either real constraint was heavily used.

This remains an estimate because:

- the percentage is provider-defined capacity, not tokens;
- a collector may miss the final reading before reset;
- completely idle windows produce no observation and are absent, so the proxy
  can understate unused value;
- capacity can vary with model and provider policy.

Show the sample count and the words "estimated" and "window-capacity proxy"
wherever dollars are displayed.

### 4. Extrapolate the current window by elapsed time

Defer. Pace projection can be useful for alerts, but it is a poor monthly waste
measure. Work is bursty, and extrapolating an early quiet period produces
misleading dollar estimates.

### 5. Compare actual consumption with a published dollar credit

Use where the provider publishes a dollar pool.

- Vercel Pro: show the factual current credit remainder, then forecast
  end-of-period unused value as
  `max($20 - (usage value / elapsed-period fraction), $0)`. Do not publish
  the forecast until at least 20% of the billing period has elapsed. This
  avoids calling all remaining credit "waste" at the beginning of a month.
  Label the forecast "at current pace"; it is a credit calculation, not a
  token estimate.
- Cursor: the same model would be appropriate for its $20/$70/$400 guaranteed
  agent usage if a real individual usage collector becomes available. Until
  then, show that the allowance is known but waste is not measurable.

### 6. Treat metered spend as waste

Reject. Pay-as-you-go usage is paid because it was consumed; an unused bucket
does not exist. Gemini API quota is a service limit, not prepaid subscription
value. Vercel overage is also consumed metered spend. Only Vercel Pro's
separate included credit can go unused.

### 7. Ask the owner to enter a guessed utilization percentage

Reject for now. It would make a manually entered guess look comparable to
collector-backed measurements, and it conflicts with the existing "API or
nothing" direction for Gemini and Cursor usage.

## Decision

Use a provider-specific "unused value" model with explicit result states:

| State | Platforms | Display |
| --- | --- | --- |
| Window proxy | Claude, ChatGPT / Codex | Estimated unused subscription value from completed observed rate-limit windows |
| Credit forecast | Vercel Pro | Current credit remainder plus estimated unused credit at period end based on current pace |
| Metered / no prepaid bucket | Gemini API, Vercel overage | Not treated as waste |
| Allowance known, consumption unavailable | Cursor individual plans | Not measurable until a real usage source exists |
| Subscription and API data do not correspond | Gemini consumer plan | Not measurable from the connected API-project quota |
| No paid plan | Free/Hobby | $0 prepaid value at risk |
| Missing plan | Any | Prompt to choose a plan in Settings |

The aggregate should sum only actual numeric estimates. It must say how many
paid platforms remain unmeasured so the total is never mistaken for complete
coverage.

## UX

### Settings: "Plans & included value"

Add one compact row per platform:

- an `Auto-detect` option first;
- current fixed-price plan choices with price in the option label;
- a one-line allowance description below the selected plan;
- save immediately when the dropdown changes;
- explain that a selection overrides automatic cost derivation and can be
  returned to `Auto-detect` at any time.

This belongs in Settings because plan choice is low-frequency account
configuration, not a dashboard action.

### Home: fold waste into Cost Summary

Do not add a separate page yet. Cost and unused value are two sides of the same
monthly-value question and should be read together.

The Cost Summary should show:

- known monthly spend;
- estimated unused value from measurable platforms;
- coverage text such as "2 estimated, 2 not measurable";
- a per-platform row with selected/detected plan, cost source, and one of the
  result states above;
- a Settings link when a plan is missing.

Existing platform detail charts remain the place to inspect individual window
history. The Home summary answers "where is money probably going unused?"
without bolting another navigation destination onto the app.

## Implementation notes

- Persist selected plan IDs in the existing gitignored local config as
  `CLAUDE_PLAN`, `CODEX_PLAN`, `GEMINI_PLAN`, `VERCEL_PLAN`, and
  `CURSOR_PLAN`.
- Return only these non-secret values to the frontend. Continue returning
  credential fields as booleans.
- `Auto-detect` clears the corresponding plan key.
- Group window readings by reset timestamp (`window_end`), not only
  `window_start`. Claude's statusline collector does not know the true start
  and currently records the fetch time there.
- Exclude active windows from monthly waste estimates.
- For Vercel, collect a billing-period usage-value aggregate separately from
  net billed cost so included-credit consumption is not confused with seats,
  tax, adjustments, or the credit line itself.
- Do not count Vercel's current credit remainder as waste. Count only the
  end-of-period projection after 20% of the billing period has elapsed, and
  identify it as a pace forecast.

# MALV Load Validation Harness

These scenarios are for staged launch validation, not product behavior.

## Prerequisites

- API running (`apps/api`) with a real auth token.
- Set:
  - `MALV_VALIDATION_MODE=true`
  - `MALV_LOAD_TEST_MODE=true`
  - `MALV_LOAD_TEST_BEARER=<jwt>`

## Run HTTP burst + sustained mix

```bash
cd apps/api/load-tests
npx artillery run artillery.http.yml
```

## Run WebSocket chat burst mix

```bash
cd apps/api/load-tests
npx artillery run artillery.ws.yml
```

## Prompt profiles covered

- `reflex_simple`
- `normal_chat`
- `deep_reasoning`
- `ambiguous_clarification`
- `phased_engineering`

Prompt pools are in `prompts.json`.

## What to inspect

- Artillery success/failure rates.
- p95/p99 request durations.
- MALV validation summary endpoint:
  - `GET /v1/admin/malv-validation/summary`
- Prometheus metrics endpoint:
  - `GET /v1/metrics` (admin JWT)

## Pass/fail guidance (baseline)

- Success rate >= 99% over sustained phase.
- No prolonged fallback storms (`fallbackOccurred` stable, not trending upward).
- No uncontrolled policy blocks (`policyBlocked` only in deliberate policy test cases).
- Time to first visible output and total duration should remain stable between HTTP and WS for equivalent prompt classes.

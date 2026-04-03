# Launch Smoke Runner (Staging)

Use this runner to validate launch-critical MALV flows against staging and collect auditable evidence.

## What it validates

- auth: signup/login, `/v1/auth/me`, refresh, logout
- password reset -> stale session rejection (when reset token is provided)
- room isolation: non-member blocked, then member access allowed
- workspace productivity surfaces: task + approval + summary surface
- file flow: upload -> understand enqueue -> retrieve
- ask MALV path: chat bootstrap + file-context follow-up
- call recap path: create call -> transcript -> end -> recap poll
- metrics endpoint reachability and post-run selected metric snapshot
- legacy usage counters visibility from `/v1/metrics`

## Setup

1. copy env template and fill staging values:
   - `cp scripts/launch-smoke.env.example .env.launch-smoke`
2. set:
   - `MALV_SMOKE_BASE_URL`
   - test credentials
   - optional `MALV_SMOKE_PASSWORD_RESET_TOKEN` for full reset/revoke coverage

## Run

```bash
set -a; source .env.launch-smoke; set +a
node scripts/launch-smoke-runner.mjs
```

Or with inline env:

```bash
MALV_SMOKE_BASE_URL=https://staging-api.example.com node scripts/launch-smoke-runner.mjs
```

## Output

Artifacts are written to `artifacts/launch-smoke` by default:

- machine-readable JSON report
- human-readable text report

Both include:

- overall pass/fail/partial status
- per-step timing
- failed-step details
- key metrics before/after snapshot from `/v1/metrics`
- created resource IDs (room/workspace/conversation/file/call)

## Sample output shape

```json
{
  "overallStatus": "passed",
  "totals": { "passed": 14, "failed": 0, "skipped": 0 },
  "flowSummary": {
    "auth": "passed",
    "rooms": "passed",
    "files": "passed",
    "calls": "passed",
    "metrics": "passed"
  },
  "steps": [
    {
      "name": "auth.refresh.cookie_and_logout",
      "status": "passed",
      "durationMs": 183
    }
  ],
  "evidence": {
    "metricsBefore": {},
    "metricsAfter": {}
  }
}
```

## Safety notes

- staging-focused only (expects non-production test credentials).
- does not disable auth/rate limits or mutate security settings.
- avoids destructive actions; it creates scoped smoke resources and reads metrics.

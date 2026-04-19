# MALV Production Validation Runbook

This runbook is for operator-led validation and staged launch of existing MALV intelligence behavior.
It does not change MALV architecture, reasoning depth, or safety policy.

## 1) Start Validation

1. Deploy current API + beast-worker build to staging.
2. Enable validation flags only for staging/internal cohort.
3. Confirm:
   - `/v1/chat/brain-health` returns healthy worker status.
   - `/v1/admin/malv-validation/summary` returns JSON (admin only, validation mode enabled).
   - `/v1/metrics` is reachable with admin JWT.

## 2) Required Flags

Core validation flags:

- `MALV_VALIDATION_MODE=true`  
  Enables validation telemetry surfaces and guarded simulation toggles.
- `MALV_TRACE_VERBOSE=false` (default)  
  Optional: set true for richer validation logs during deep debugging.
- `MALV_WS_PHASE_PROGRESS_ENABLED=true` (default)  
  Allows WS phase progress projection from truthful server orchestration events.
- `MALV_LOAD_TEST_MODE=false` (default)  
  Set true while running load scripts; appears in validation telemetry logs.
- `MALV_LEARNING_ENABLED=true` (default)  
  Keep enabled unless running explicit isolated tests.
- `MALV_FORCE_GLOBAL_LEARNING_ONLY=false` (default)  
  Optional: isolates validation from personalized learning overlays.
- `MALV_DISABLE_REFINEMENT_FOR_TESTING=false` (default)  
  Optional: disables confidence refinement append pass for A/B validation.

Rollout controls:

- `MALV_INTERNAL_USERS_ONLY_MODE=false` (default)
- `MALV_INTERNAL_USER_IDS=<csv_user_ids>`
- `MALV_VALIDATION_ROLLOUT_PERCENT=100`

## 3) Validation Scenarios To Run

### Scenario A: Baseline parity

- Run same prompt classes over HTTP and WS:
  - reflex/simple
  - normal chat
  - deep reasoning
  - ambiguous clarification
  - phased/deep engineering
- Verify transport parity snapshot fields stay consistent for core decisions.

### Scenario B: Load

- Use `apps/api/load-tests/artillery.http.yml` for sustained + spike HTTP.
- Use `apps/api/load-tests/artillery.ws.yml` for WS burst behavior.
- Compare success/failure rate and tail latency across transports.

### Scenario C: Controlled failure simulations (validation mode only)

Enable one simulation flag at a time:

- `MALV_SIMULATE_LEARNING_HYDRATION_TIMEOUT=true`
- `MALV_SIMULATE_LOCAL_INFERENCE_UNAVAILABLE=true`
- `MALV_SIMULATE_WORKER_FALLBACK=true`
- `MALV_SIMULATE_DEFERRED_LEARNING_CAPTURE_FAILURE=true`
- `MALV_SIMULATE_WS_CALLBACK_ABSENT=true`
- `MALV_SIMULATE_POLICY_BLOCK=true`
- `MALV_SIMULATE_SLOW_PHASE_COMPLETION=true`

Then run target prompts and confirm expected fallback/telemetry behavior.

## 4) What To Watch

Primary operator surfaces:

- Validation summary endpoint: `GET /v1/admin/malv-validation/summary`
- Prometheus metrics: `GET /v1/metrics`
- Structured logs with tag: `malv.validation.turn`

Key fields in validation turn records:

- timing:
  - `requestReceivedAtMs`
  - `firstVisibleOutputAtMs`
  - `timeToFirstVisibleOutputMs`
  - `totalCompletionAtMs`
  - `totalDurationMs`
- decision signals:
  - `reflexHit`
  - `selectedCognitiveTier`
  - `tierCorrectionTriggered`
  - `clarificationTriggered`
  - `refinementTriggered`
  - `phasedPlanned`
- learning + routing:
  - `learningHydrationWaitDurationMs`
  - `learningSnapshotScope`
  - `localInferenceUsed`
  - `workerInferenceUsed`
  - `deferredLearningCapture`
- reliability/safety:
  - `fallbackOccurred`
  - `policyBlocked`
  - `interruptedOrCancelled`

## 5) What Good Looks Like

- Success rate >= 99% under sustained moderate load.
- p95 and p99 latency stable across 30+ minute runs.
- Fallback usage remains low and event-driven (not sustained storm).
- Clarification and refinement triggers occur selectively, not constantly.
- Policy blocks occur only for expected denied classes.
- WS and HTTP parity snapshots agree on core decision semantics.

## 6) What Bad Looks Like

- Rapid increase in `fallbackOccurred`.
- Rising `timeToFirstVisibleOutputMs` with flat traffic.
- Large increase in `policyBlocked` without policy change rollout.
- High `deferredLearningCapture=failed` rate.
- Transport divergence (WS vs HTTP differences in tier/strategy/clarification behavior for equivalent prompts).

## 7) Stop-Rollout Criteria

Stop expanding rollout immediately if any of these occur:

- Success rate < 97% for 10 minutes.
- Sustained fallback storm (>15% turns fallback for >5 minutes).
- Persistent unexplained policy blocks on valid prompts.
- Repeated interrupted/cancelled anomalies without operator action.
- Any safety boundary regression or sandbox/kill-switch enforcement regression.

## 8) Rollback Steps

1. Set `MALV_VALIDATION_ROLLOUT_PERCENT=0`.
2. If needed set `MALV_INTERNAL_USERS_ONLY_MODE=true` and restrict to operator IDs.
3. Disable optional overlays:
   - `MALV_DISABLE_REFINEMENT_FOR_TESTING=false`
   - `MALV_FORCE_GLOBAL_LEARNING_ONLY=true` (optional stability fallback)
4. Turn off any active simulation flags.
5. If operational instability persists, use existing kill-switch and revert deployment artifact.

## 9) Residual Limitations

- Validation summary is in-memory and scoped per API process.
- WS load profile depends on client behavior and socket auth setup.
- Learning capture is deferred by design; failures are non-blocking but must still be monitored.

## 10) Pre-Launch Checklist

- [ ] Observability ready (`/v1/metrics`, `malv.validation.turn`, summary endpoint).
- [ ] Validation flags documented and default-safe.
- [ ] Load scripts executed and baselines captured.
- [ ] Failure simulations exercised one-by-one with expected outcomes.
- [ ] Rollout controls tested (internal-only and percentage gates).
- [ ] Rollback path rehearsed and operator-owned.

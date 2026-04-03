# MALV Final Launch Readiness Phase

## Readiness Status

- Overall status: **conditionally ready** for production launch with safe rollout gates.
- Blocking prerequisites:
  - production env secrets present
  - DB migrations applied
  - Prometheus scraping `GET /v1/metrics`
  - staged canary rollout and rollback drills completed

## Implementation Completed

- Metrics integration (Prometheus):
  - Added `GET /v1/metrics` endpoint.
  - Added counters for:
    - rate limit hits/blocks/fallback
    - auth failures (login/refresh/jwt/ws channels)
    - websocket disconnect reasons
    - upload register mode usage (handle vs legacy)
    - vault plaintext migration count
    - recap pipeline/model failures
    - video processing failures (vision inference/deep extraction)
    - legacy compatibility path usage
- Monitoring hooks:
  - structured tags remain intact for alerting (`rate_limit.blocked`, `auth.refresh.failed`, `ws.disconnect`, `call.recap.failed`, `multimodal.extraction.failed`)
  - explicit monitoring-hints log emitted at bootstrap with critical signal keys
- Legacy tracking:
  - refresh body fallback usage counted
  - legacy `storageUri` register usage counted

## Monitoring Plan

- Scrape interval: every 15s in staging/prod.
- Alert candidates:
  - `auth failures spike`: sudden increase in `malv_auth_failures_total`
  - `rate limit spikes`: increase in `malv_rate_limit_events_total{outcome="blocked"}`
  - `websocket disconnect anomaly`: increase in `malv_websocket_disconnects_total` for non-client reasons
  - `video processing failures`: increase in `malv_video_processing_failures_total`
- Keep JSON log alerts enabled on existing tags for fast correlation.

## End-to-End Verification Suite (Launch Gate)

Run these flows in staging against production-like config:

1. auth lifecycle
   - signup -> login -> refresh -> logout
2. password reset revocation
   - forgot/reset password -> old refresh/session rejected
3. room isolation
   - verify non-members cannot read/join room data or socket room
4. file path
   - upload -> register via upload handle -> process -> ask MALV with file context
5. call workflow
   - call join/signaling -> call end -> recap generation -> task creation
6. workspace collaboration
   - workspace access, room membership, collaborative updates, and role-based restrictions

Pass criteria:
- all flows succeed without 5xx
- no sustained increases in failure counters after warmup
- no unauthorized cross-room/workspace data exposure

Automation:
- run `node scripts/launch-smoke-runner.mjs` (or `npm run smoke:launch`) against staging
- collect artifacts under `artifacts/launch-smoke`

## Legacy Removal Safety Thresholds

- `storageUri` legacy register path:
  - requirement: `malv_legacy_path_usage_total{path="file_register_storage_uri"} == 0`
  - hold period: 14 consecutive days before disabling fallback
- refresh body fallback:
  - requirement: `malv_legacy_path_usage_total{path="refresh_body_fallback"} == 0`
  - hold period: 14 consecutive days before removing body-token compatibility

Rollout sequence:
1. observe zero-usage threshold in production
2. disable via env flag first (`MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER=false`)
3. monitor for regressions for one release cycle
4. remove dead code in a follow-up release

## Rollout Plan

1. pre-deploy
   - set env vars
   - run migrations
   - confirm metrics scrape + alert routes
2. canary
   - 5% traffic, observe 30 minutes
   - 25% traffic, observe 60 minutes
   - 100% traffic with active monitoring
3. rollback
   - rollback app version only (schema remains forward)
   - keep legacy compatibility flags enabled during rollback window
   - validate auth + websocket + upload critical paths

## Known Risks

- existing e2e test harness is still service/integration weighted; full black-box automation remains limited.
- metrics are counter-based and require baseline tuning to reduce noisy alerts.
- legacy fallback behavior remains available until usage reaches zero threshold window.

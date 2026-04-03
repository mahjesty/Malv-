# MALV Production Rollout Readiness

## 1) Production Readiness Checklist

### Required env vars (production)

- Core
  - `NODE_ENV=production`
  - `JWT_ACCESS_SECRET`
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Auth cookies
  - `AUTH_REFRESH_COOKIE_SECURE=true`
  - `AUTH_REFRESH_COOKIE_SAMESITE=lax` (or `none` only with TLS + cross-site need)
  - `AUTH_REFRESH_COOKIE_NAME` (optional, defaults safe)
- Rate limiting
  - `REDIS_RATE_LIMIT_URL` (or `REDIS_URL` fallback, but dedicated URL preferred)
- Vault crypto
  - `MALV_VAULT_MASTER_KEY` (strong 32-byte secret; hex/base64/plain supported)
- Upload hardening
  - `MALV_UPLOAD_HANDLE_TTL_SECONDS` (recommended 900)
  - `MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER=true` during transition, then `false`

### Startup readiness validation

- API bootstrap emits structured readiness event `MALV_PRODUCTION_READINESS`.
- If required production env vars are missing, boot fails by default.
- Override only for emergency bootstrap:
  - `MALV_FAIL_ON_READINESS_ERRORS=false`

### Migrations

- Run before traffic cutover:
  - `npm run -w @malv/api migration:run`
- Includes:
  - `031-vault-encryption-upload-handles` (vault encryption fields + upload handles table)

### Cookie/auth validation by environment

- Production:
  - `Secure=true`, `HttpOnly=true`
  - `SameSite=lax` unless cross-site flow demands `none`
- Staging/dev:
  - may relax secure by env if HTTPS unavailable
- Refresh compatibility:
  - cookie-first refresh is primary
  - request-body token still accepted as temporary legacy fallback

### Redis/rate limiting behavior

- Redis ready => distributed limiting.
- Redis unavailable => memory fallback with explicit warning log.
- Rate limit metrics:
  - `rateLimitHits`, `rateLimitBlocks`, `fallbackChecks`.

### Vault key requirements

- `MALV_VAULT_MASTER_KEY` must be present in production.
- Vault entries now use envelope encryption:
  - per-entry DEK
  - AES-256-GCM content encryption
  - DEK wrapped by master key
- Legacy plaintext entries migrate lazily on read.

### Upload handle flow readiness

- Preferred path:
  1. upload via `POST /v1/files/upload` (server mints handle)
  2. register via server-resolved `uploadHandle`
- Legacy `storageUri` registration remains for compatibility window only.

## 2) Observability and Ops Signals

Structured logs/metrics available for:

- Prometheus endpoint
  - `GET /v1/metrics`
  - includes `malv_*` counters for launch-critical signals

- Auth
  - `auth.refresh.failed` with reasons (`invalid_token`, `expired_token`)
  - `auth.refresh.legacy_body_fallback`
  - `malv_auth_failures_total{channel,reason}`
- WebSocket
  - `ws.auth.failed`
  - `ws.disconnect` with `reason`
  - `malv_websocket_disconnects_total{reason}`
- Rate limit
  - `rate_limit.blocked` (redis/memory)
  - in-memory fallback warning
  - counters in `RateLimitService.getMetricsSnapshot()`
  - `malv_rate_limit_events_total{route,backend,outcome}`
- Vault crypto
  - `vault.entry.encrypted_write`
  - `vault.entry.migrated_plaintext`
  - `malv_vault_plaintext_migrations_total`
- Upload hardening
  - `upload_handle.resolved`
  - `file.register` (handle mode)
  - `file.register.legacy_storage_uri` (deprecation path)
  - `malv_upload_register_path_total{mode}`
  - `malv_legacy_path_usage_total{path}`
- Recap/video extraction
  - `call.recap.model_infer_failed`
  - `call.recap.failed`
  - `video.vision.infer_failed`
  - `multimodal.extraction.failed`
  - `malv_recap_failures_total{phase}`
  - `malv_video_processing_failures_total{stage}`

Sensitive data policy:

- Do not log refresh tokens, raw vault content, or uploaded file bytes.
- Logs include IDs, statuses, and error classes/messages only.

## 3) Compatibility Cleanup and Deprecation Plan

### Remaining legacy paths

- `storageUri` register fallback (files)
- refresh token in request body (auth refresh endpoint)
- older assumptions around non-cookie refresh clients

### Staged removal plan

- Stage A (now): keep compatibility, emit deprecation warnings.
- Stage B (after client migration): set `MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER=false`.
- Stage C (final): remove body refresh fallback and legacy storage registration codepaths.

Target removal window:

- legacy paths marked for removal after `2026-09-30` unless business constraints extend.

## 4) Launch Safety Testing Matrix

Run before production cutover:

- Auth/session
  - signup/login/refresh/logout
  - password reset revokes active refresh tokens and sessions
- Access control
  - room isolation and membership checks
  - websocket auth freshness and unauthorized disconnect behavior
- Files
  - upload -> handle -> register -> understand
  - legacy `storageUri` path still works (until disabled)
- Vault
  - create/read entry
  - lazy migration from plaintext row
- Calls/collaboration
  - recap generation path and failure logging
  - workspace task/approval related flows stay stable

## 5) Deployment Order, Rollback, and Post-Deploy Checks

### Deployment order

1. Apply DB migrations.
2. Deploy API with readiness validation and observability changes.
3. Smoke-test auth, websocket, files, vault.
4. Enable production traffic.
5. Monitor deprecation and failure tags.

### Rollback notes

- App rollback is safe with non-destructive migration policy.
- Keep migration-forward schema; roll app code back if needed.
- If rollback restores older app, keep legacy compatibility env flags enabled.

### Post-deploy checks (first 60 minutes)

- No startup readiness failures.
- No sustained `rate_limit` fallback unless Redis incident.
- `auth.refresh.failed` within expected baseline.
- `vault.entry.migrated_plaintext` present initially, then tapering.
- `file.register.legacy_storage_uri` trend decreasing.
- No spike in `multimodal.extraction.failed` or `call.recap.failed`.

## Known Limitations

- Full black-box e2e suite is not yet comprehensive for all cross-module flows.
- Legacy compatibility paths are still present until staged removal.
- Some observability is log/counter based and not yet exported to a dedicated metrics backend.

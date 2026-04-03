# SECURITY_HARDENING_ENV

This document tracks security hardening environment variables introduced in recent phases.

## Distributed rate limiting

- `REDIS_RATE_LIMIT_URL`
  - Purpose: Dedicated Redis endpoint for distributed rate-limit counters.
  - Recommended production: `redis://<user>:<pass>@<host>:6379/0` (or TLS `rediss://...`).
  - Notes: If unset, service falls back to `REDIS_URL`.

- `REDIS_URL`
  - Purpose: General Redis URL fallback for rate limiter.
  - Recommended production: point to managed Redis with auth + TLS.

### Degraded fallback behavior (important)

If Redis is unavailable or not configured, MALV rate limiting degrades to in-memory per-instance buckets:

- limits reset on API process restart;
- limits are not shared across horizontally scaled instances;
- effective protection is weaker under distributed traffic.

This fallback is intentional for availability, but should be treated as degraded security posture.

## WebSocket/event hardening

- `RATE_LIMIT_WS_SUPPORT_JOIN_PER_MINUTE` (default: `30`)
  - Limits `support:join_ticket` attempts per user.
  - Recommended production: `20-30`.

- `RATE_LIMIT_WS_CALL_JOIN_PER_MINUTE` (default: `60`)
  - Limits `call:join_room` attempts per user.
  - Recommended production: `30-60`.

- `RATE_LIMIT_WS_CALL_SIGNAL_PER_MINUTE` (default: `600`)
  - Limits `call:signal` events per user.
  - Recommended production: start `400-600`, tune from real call quality metrics.

- `WS_VOICE_CHUNK_MAX_BYTES` (default: `1048576`)
  - Gateway-level approximate max payload bytes per voice chunk.
  - Recommended production: `262144` to `524288` (256-512 KiB) if client behavior is stable.

- `RATE_LIMIT_VOICE_CHUNKS_PER_MINUTE` (existing, default currently `420`)
  - Voice chunk event count limit.
  - Recommended production: keep as-is initially, then tune with STT latency + error telemetry.

## STT in-memory session safeguards

- `VOICE_STT_MAX_CHUNK_BYTES` (default: `1048576`)
  - Hard max decoded bytes per chunk inside STT session service.
  - Recommended production: `262144` to `524288`.

- `VOICE_STT_MAX_CHUNKS` (default: `600`)
  - Hard max chunks accepted per STT session.
  - Recommended production: `240-400`.

- `VOICE_STT_MAX_SESSION_BYTES` (default: `26214400`)
  - Hard max cumulative bytes accepted for one STT session.
  - Recommended production: `8388608` to `16777216` (8-16 MiB), based on expected utterance duration.

## Auth/session hardening

- `AUTH_REFRESH_COOKIE_NAME` (default: `malv_refresh`)
  - Refresh cookie name used for HttpOnly refresh session flow.

- `AUTH_REFRESH_COOKIE_SECURE` (default: `true`)
  - Forces `Secure` cookie attribute in production.
  - Recommended production: `true` always.

- `AUTH_REFRESH_COOKIE_SAMESITE` (default: `lax`)
  - Cookie `SameSite` value: `strict` | `lax` | `none`.
  - Recommended production: `lax` for same-site app/API; use `none` only if cross-site is required and TLS is guaranteed.

- `AUTH_REFRESH_COOKIE_DOMAIN` (optional)
  - Cookie domain override.
  - Recommended production: set only when needed for subdomain sharing; leave unset for host-only cookie otherwise.

- `AUTH_REFRESH_COOKIE_PATH` (default: `/`)
  - Cookie path scope.
  - Recommended production: `/`.

- `AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS` (optional)
  - Overrides cookie max-age. If unset, backend aligns with refresh token TTL.
  - Recommended production: keep aligned with server refresh TTL.

- `MALV_FAIL_ON_READINESS_ERRORS` (default: `true`)
  - If true, API startup fails in production when required readiness env vars are missing.
  - Recommended production: `true`.

## Vault encryption hardening

- `MALV_VAULT_MASTER_KEY` (required in production)
  - Purpose: wraps per-entry DEKs for envelope encryption.
  - Format: 32-byte secret (hex/base64/plain supported; normalized internally to 256-bit key material).
  - Recommended production: managed secret, rotated by ops policy.

## Upload hardening

- `MALV_UPLOAD_HANDLE_TTL_SECONDS` (default: `900`)
  - Upload handle validity window.
  - Recommended production: `600-1800`.

- `MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER` (default: `true`)
  - Compatibility toggle for direct `storageUri` registration.
  - Recommended production: `true` during migration, then `false` after all clients adopt upload handles.

## Safe rollout notes

1. Deploy Redis-backed limiter first, keep fallback enabled.
2. Watch logs for fallback warnings from `RateLimitService`.
3. Roll in stricter WS/STT limits gradually to avoid client regressions.
4. Enable auth refresh cookie settings in staging first; validate login, refresh, OAuth, logout, and multi-tab behavior.
5. Keep legacy refresh-token request-body compatibility during migration window.
6. Keep legacy storageUri registration enabled only for migration window; disable when client adoption reaches 100%.

## Monitoring checklist

- Rate limiting
  - Count of 429 responses by route/user/IP.
  - Redis availability and reconnect/error rate.
  - Alert when limiter fallback mode is active.

- WebSocket abuse
  - Rejected events by type (`call:signal`, `support:join_ticket`, `voice:chunk`).
  - Voice chunk oversize rejection counts.

- Auth/session
  - Refresh success vs failure ratio.
  - Password reset events followed by token/session revocations.
  - `auth/me` unauthorized spikes post-deploy.

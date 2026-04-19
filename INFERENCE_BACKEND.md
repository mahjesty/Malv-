# Inference Backend Configuration (MALV)

MALV runs private inference through a dedicated `beast-worker` service.
This repo now centralizes inference routing configuration in the **API**, with:

1. **DB override** (admin-controlled, runtime-safe)
2. **Env-backed defaults** (canonical env vars + legacy compatibility)

The `beast-worker` fetches the effective config from the API at runtime, so the API and worker agree on the active backend and fallback policy.

## MALV-owned env vars (preferred)

Use these to set the default inference backend when no DB override is enabled. Values such as `openai_compatible` name the **wire format** (HTTP routes compatible with common chat-completions APIs), not a third-party product.

- `MALV_INFERENCE_PROVIDER`: `openai_compatible | ollama | llamacpp | transformers | fallback | disabled` (legacy value `vllm` maps to `openai_compatible`)
- `MALV_INFERENCE_BASE_URL`:
  - `openai_compatible`: API root; normalized to end in `/v1` when missing
  - `ollama` / `llamacpp`: respective server base URL
- `MALV_INFERENCE_API_KEY`: optional Bearer token for `openai_compatible`
- `MALV_INFERENCE_MODEL`: model id / tag (remote id for `openai_compatible` and `ollama`, HF/local path for `transformers`)
- `MALV_INFERENCE_TIMEOUT_MS`: provider request timeout (ms)

Fallback policy (still `INFERENCE_*` namespace today):

- `INFERENCE_FALLBACK_ENABLED`: allow the synthetic template fallback provider
- `INFERENCE_FALLBACK_POLICY`:
  - `always_allow`: fallback is eligible whenever the primary run fails at runtime
  - `allow_on_error`: fallback is only eligible when the primary **health/test** fails
  - `disabled`: fallback is not eligible (unless you explicitly choose `MALV_INFERENCE_PROVIDER=fallback`)

## Legacy env mapping (compatibility)

The API still reads these when MALV-owned vars are unset:

- `INFERENCE_BACKEND` → same role as `MALV_INFERENCE_PROVIDER`
- `MALV_INFERENCE_BACKEND` → same role as `MALV_INFERENCE_PROVIDER` (after `INFERENCE_BACKEND`)
- `INFERENCE_BASE_URL` → after `MALV_INFERENCE_BASE_URL`
- `INFERENCE_MODEL` → after `MALV_INFERENCE_MODEL`
- `INFERENCE_API_KEY` → after `MALV_INFERENCE_API_KEY`
- `MALV_OPENAI_COMPAT_BASE_URL` → only if `openai_compatible` and `MALV_INFERENCE_BASE_URL` / `INFERENCE_BASE_URL` are unset
- `MALV_LLAMACPP_BASE_URL` → only if `llamacpp` and MALV/INFERENCE base URLs are unset
- `MALV_OPENAI_COMPAT_API_KEY` → after `MALV_INFERENCE_API_KEY` / `INFERENCE_API_KEY`
- `MALV_FALLBACK_ENABLED` → `INFERENCE_FALLBACK_ENABLED`
- `INFERENCE_TIMEOUT_MS` → used only if `MALV_INFERENCE_TIMEOUT_MS` is unset

## Precedence & effective backend

Effective config precedence:

1. **DB override**: used when the admin sets `enabled=true` for inference settings and the DB values validate
2. **Env defaults**: used otherwise

The `beast-worker` exposes health fields including:

- which backend is currently effective
- whether fallback is actually active (and why)
- fallback policy mode

## Admin runtime update (no worker restart required)

Admin endpoints:

- `GET  /v1/admin/inference/settings`
- `PATCH /v1/admin/inference/settings`
- `POST /v1/admin/inference/settings/test`
- `POST /v1/admin/inference/settings/reset`

When DB settings change, the worker picks them up at runtime by polling the API’s internal effective-config endpoint.

### Beast-worker control-plane base URL

The worker needs a reachable API URL to fetch the effective inference config:

- `MALV_API_BASE_URL` (defaults to `http://127.0.0.1:8080`)

### API-side local CPU llama-server (optional)

Example merge list for laptop + local llama.cpp: `apps/api/env.inference.local-dev.example` (copy vars into repo root `.env` or `apps/api/.env`).

When `MALV_LOCAL_CPU_INFERENCE_ENABLED=true` (legacy: `MALV_LOCAL_INFERENCE_ENABLED`), the Nest API can call the model directly (`/v1/chat/completions` on the wire):

- `MALV_LOCAL_CPU_INFERENCE_BASE_URL` (legacy: `MALV_LOCAL_INFERENCE_BASE_URL`; defaults to `http://127.0.0.1:8081` — **not** the API port `8080`)
- `MALV_LOCAL_CPU_INFERENCE_MODEL` (legacy: `MALV_LOCAL_INFERENCE_MODEL`; optional; e.g. `qwen2.5-1.5b-instruct.gguf` for local llama-server)
- `MALV_LOCAL_CPU_INFERENCE_SKIP_HEALTH_PROBE` (legacy: `MALV_LOCAL_INFERENCE_SKIP_HEALTH_PROBE`)
- `MALV_LOCAL_CPU_INFERENCE_FAILURE_COOLDOWN_MS` (legacy: `MALV_LOCAL_INFERENCE_FAILURE_COOLDOWN_MS`; default `8000`)
- `MALV_LOCAL_CPU_INFERENCE_RESPECT_ROUTING_TIER` (legacy: `MALV_LOCAL_INFERENCE_RESPECT_ROUTING_TIER`, default on): when GPU is **policy-preferred**, API local CPU inference is skipped **only if** `MALV_GPU_TIER_PROBE_WORKER_HEALTH=true` and the worker health check proves the GPU tier is up.
- `MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH` (legacy: `MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH`): when true, normal chat never uses this path even if enabled.
- `MALV_GPU_TIER_PROBE_WORKER_HEALTH`: set `true` when you want routing to treat GPU reachability as evidence-based.
- `MALV_GPU_TIER_ENABLED`: set `false` for CPU-only local dev so chat availability gating does not treat the remote worker GPU chain as required.

### Beast-worker `llamacpp` default

If the worker uses `MALV_INFERENCE_BACKEND=llamacpp` and `MALV_LLAMACPP_BASE_URL` is unset, it defaults to `http://127.0.0.1:8081`.

## Status endpoints

Public/redacted status:

- `GET /v1/health/inference`

Admin/operator visibility:

- `GET /v1/chat/brain-health` (admin UI uses this indirectly)
- `GET /v1/admin/inference/settings` (includes redacted effective config + worker health)

## Secrets handling

- Admin `GET` responses **never** return the full upstream API key.
- API stores `INFERENCE_API_KEY` in DB for `openai_compatible`.
- `beast-worker` receives the secret only via an internal, key-protected endpoint.

## Restart strategy

- **DB override changes**: no restart required.
- **Env default changes**:
  - restart the API (so it reads new env defaults)
  - the worker updates automatically on the next request cycle

## MALV production hardening contracts (Phase 6)

These are the behavior guarantees the API now treats as contract, not best-effort.

### Transport parity (HTTP vs WebSocket)

- Core intelligence decisions must stay equivalent across transports for the same turn:
  - selected tier (routing)
  - execution strategy mode (single-step / phased / clarification)
  - confidence clarification activation
  - phased orchestration activation
  - turn outcome class (`complete | partial_done | failed_before_output`)
- Delivery mechanics can differ (HTTP JSON vs WS chunks + done), but decision semantics cannot silently drift.
- `malvTransportDecisionSnapshot` is emitted on HTTP meta and WS `assistant_done` orchestration events for parity verification and regression tests.

### WebSocket phased delivery (truthful progress)

- Phased orchestration remains real multi-step execution; no fake token streaming.
- Clients may receive phase progress via `malv:orchestration` thinking events:
  - phase start (`step n/total`)
  - phase completion (`completed n/total`) with `status`, `producer`, and `replyChars`
- Final assistant text still arrives through existing `chat:reply_chunk` and terminal `assistant_done`.

### Trace contract and sanitization

- Internal traces stay rich in worker/job metadata.
- User-facing assistant meta is sanitized:
  - strip internal probe URLs and exception internals
  - retain safe observability for transport/routing class
- Branches (reflex, normal, deep/phased, clarification, refinement, policy/reject, interrupted) keep a stable shape suitable for UI logic and tests.

### Learning hydration + degraded behavior

- Learning hydration wait is bounded by per-turn budget; no unbounded hot-path blocking.
- Reflex path remains independent of hydration waits.
- Deferred learning capture/flush failures are non-fatal and logged; they must not crash chat turns.

## Validation and staged launch controls

For operator-led launch validation (without changing MALV intelligence architecture), use:

- `MALV_VALIDATION_MODE=true` to enable validation telemetry collection and admin summary endpoint.
- `GET /v1/admin/malv-validation/summary` (admin JWT required) for per-turn validation summaries and counters.
- `MALV_INTERNAL_USERS_ONLY_MODE`, `MALV_INTERNAL_USER_IDS`, `MALV_VALIDATION_ROLLOUT_PERCENT` for staged rollout control.
- Optional validation toggles:
  - `MALV_FORCE_GLOBAL_LEARNING_ONLY`
  - `MALV_DISABLE_REFINEMENT_FOR_TESTING`
  - `MALV_LOAD_TEST_MODE`
- Failure simulation toggles (active only when `MALV_VALIDATION_MODE=true`):
  - `MALV_SIMULATE_LEARNING_HYDRATION_TIMEOUT`
  - `MALV_SIMULATE_LOCAL_INFERENCE_UNAVAILABLE`
  - `MALV_SIMULATE_WORKER_FALLBACK`
  - `MALV_SIMULATE_DEFERRED_LEARNING_CAPTURE_FAILURE`
  - `MALV_SIMULATE_WS_CALLBACK_ABSENT`
  - `MALV_SIMULATE_POLICY_BLOCK`
  - `MALV_SIMULATE_SLOW_PHASE_COMPLETION`


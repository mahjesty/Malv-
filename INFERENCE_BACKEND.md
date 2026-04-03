# Inference Backend Configuration (MALV)

MALV runs private inference through a dedicated `beast-worker` service.
This repo now centralizes inference routing configuration in the **API**, with:

1. **DB override** (admin-controlled, runtime-safe)
2. **Env-backed defaults** (canonical env vars + legacy compatibility)

The `beast-worker` fetches the effective config from the API at runtime, so the API and worker agree on the active backend and fallback policy.

## Canonical env vars (preferred)

Use these to set the default inference backend when no DB override is enabled:

- `INFERENCE_BACKEND`: `openai_compatible | ollama | llamacpp | transformers | fallback | disabled`
- `INFERENCE_BASE_URL`:
  - `openai_compatible`: API root that ends in `/v1` (the API will normalize if missing)
  - `ollama`: Ollama base URL
  - `llamacpp`: llama.cpp base URL
- `INFERENCE_API_KEY`: optional Bearer token for `openai_compatible`
- `INFERENCE_MODEL`: model id / tag (remote id for `openai_compatible` and `ollama`, HF/local path for `transformers`)
- `INFERENCE_TIMEOUT_MS`: provider request timeout (ms)
- `INFERENCE_FALLBACK_ENABLED`: allow the synthetic template fallback provider
- `INFERENCE_FALLBACK_POLICY`:
  - `always_allow`: fallback is eligible whenever the primary run fails at runtime
  - `allow_on_error`: fallback is only eligible when the primary **health/test** fails
  - `disabled`: fallback is not eligible (unless you explicitly choose `INFERENCE_BACKEND=fallback`)

## Legacy env mapping (temporary compatibility)

The API still supports the old env names:

- `MALV_INFERENCE_BACKEND` → `INFERENCE_BACKEND` (legacy value `vllm` maps to `openai_compatible`)
- `MALV_OPENAI_COMPAT_BASE_URL` → `INFERENCE_BASE_URL` for `openai_compatible`
- `MALV_INFERENCE_BASE_URL` → `INFERENCE_BASE_URL` for `ollama`
- `MALV_LLAMACPP_BASE_URL` → `INFERENCE_BASE_URL` for `llamacpp`
- `MALV_INFERENCE_MODEL` → `INFERENCE_MODEL`
- `MALV_OPENAI_COMPAT_API_KEY` → `INFERENCE_API_KEY` (for `openai_compatible`)
- `MALV_FALLBACK_ENABLED` → `INFERENCE_FALLBACK_ENABLED`
- `MALV_INFERENCE_TIMEOUT_MS` → `INFERENCE_TIMEOUT_MS`

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


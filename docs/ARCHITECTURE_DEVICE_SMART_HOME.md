# MALV: Device Trust & Smart-Home Bridge Architecture

This document describes **production** contracts. Optional desktop/dev harnesses are documented separately; they are **not** the product surface.

## Device trust (mobile / desktop / web)

**Production model**

- **Sessions** (`sessions` table): every authenticated client has a session row with IP, user agent, expiry, and optional link to a **trusted device**.
- **Trusted devices** (`trusted_devices` table): stable device identity (fingerprint + optional label + trust bit).
- **API**: `GET /v1/devices`, `GET /v1/devices/sessions` list real rows created by auth and enrollment flows.

**Enrollment path (real implementation)**

1. Client authenticates (OAuth/password + JWT).
2. Client presents a **device fingerprint** (web: derived stable id; mobile: keychain-backed id + optional attestation).
3. Server upserts `trusted_devices` and binds new sessions to that row.
4. Optional: step-up verification (OTP, WebAuthn) before `is_trusted` flips true.

**API**

- `GET /v1/devices/bridge/health` — production bridge contract (trust model, docs pointer, whether optional dev harness is enabled).

**Optional dev harness** (not production)

- `MALV_DEV_HARNESS_ENABLED=true` enables **seed** endpoints for QA only: `POST /v1/devices/dev-harness/seed` (legacy: `simulator/seed`).
- Seeded rows are labeled in docs as test data; they do not replace real enrollment.

## Smart-home / automation bridge

**Production model**

- Feature flag: `MALV_SMART_HOME_ENABLED`, provider: `MALV_SMART_HOME_PROVIDER` (`none` | `mqtt` | `homeassistant` | future: `matter`).
- **API**: `GET /v1/smart-home/bridge/health` returns structured `SmartHomeBridgeHealth` (configured, reachable placeholder, capabilities).
- **Next implementation steps** (real, not fake):
  - MQTT: connect with `MALV_SMART_HOME_MQTT_URL` + credentials; publish/subscribe with topic ACLs.
  - Home Assistant: REST/WebSocket to `MALV_SMART_HOME_HOMEASSISTANT_URL` + long-lived token; map entities to MALV actions.

## File storage & multimodal (production)

1. **Upload**: `POST /v1/files/upload` (multipart) writes bytes under `PRIVATE_STORAGE_ROOT` and registers `storageUri` as a **relative path** (same as multimodal extraction expects).
2. **Deep extraction**: `POST /v1/files/:fileId/multimodal/deep` queues real processing (`pdf-parse`, `ffprobe`, image dimensions, etc.).
3. **Health**: `GET /v1/files/storage/health` verifies local storage is writable.

**Optional dev harness** (fixture rows only)

- `POST /v1/files/:fileId/multimodal/deep/dev-harness` requires `MALV_DEV_HARNESS_ENABLED` and inserts **fixture** metadata — clearly tagged `source: dev_harness_fixture` in results.

## Environment reference

| Variable | Purpose |
|----------|---------|
| `MALV_DEV_HARNESS_ENABLED` | Optional QA-only harness (seed, fixtures) |
| `MALV_SMART_HOME_ENABLED` | Enable smart-home bridge |
| `MALV_SMART_HOME_PROVIDER` | `none`, `mqtt`, `homeassistant`, … |
| `MALV_SMART_HOME_MQTT_URL` | MQTT broker URL when provider is `mqtt` |
| `MALV_SMART_HOME_HOMEASSISTANT_URL` | HA base URL when provider is `homeassistant` |
| `PRIVATE_STORAGE_ROOT` | Local object root for uploads |
| `MALV_UPLOAD_MAX_BYTES` | Max upload size (default 50MB) |

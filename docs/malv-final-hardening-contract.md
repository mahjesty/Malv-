# MALV Final Hardening Contract

This document defines production expectations for transport parity, phased WebSocket delivery, trace semantics, and degraded-mode behavior.

## 1) HTTP vs WebSocket Parity

Core decision parity is required across transports for the same logical turn class.

### Required-equal decision snapshot fields

- `replySource`
- `turnOutcome`
- `terminal`
- `selectedTier`
- `preferredTier`
- `executionMode`
- `phasedEnabled`
- `phasedTraceEntries`
- `confidenceClarification`
- `requiresClarification`
- `responseRetryTriggered`
- `policyDenied`
- `tierCorrectionApplied`
- `intentKind`
- `learningSignalsCaptured`
- `transport`

### Allowed delivery differences

- HTTP returns a single JSON payload.
- WebSocket may emit zero or more `chat:reply_chunk` events before terminal completion.
- WebSocket may emit phase progress events (`malv:phase_progress`) during server-phased orchestration.

Delivery differences must not change core intelligence decisions.

## 2) WebSocket Phased Delivery Contract

Deep phased turns must remain truthful: no fake token streaming before work exists.

### Event contract

- `malv:orchestration` with `type: "thinking"` continues to represent orchestration milestones.
- `malv:phase_progress` is emitted when a server phase starts/completes.
- `malv:phase_progress` payload:
  - `type: "phase_progress"`
  - `conversationId`
  - `messageId`
  - `phaseId`
  - `phaseIndex` (nullable)
  - `phaseTotal` (nullable)
  - `status` (`in_progress` or completed/failed status from phased trace)
  - `producer` (nullable)
  - `replyChars` (nullable)

## 3) User-Safe Trace Contract

User-visible meta now normalizes `malvInferenceTrace` to avoid branch-dependent omission.

### Always present in sanitized responses

- `malvInferenceTrace` object exists on every sanitized payload.
- Standard nullable fields:
  - `malvChatInferenceTransport`
  - `malvLearningSignalsCaptured`
  - `malvIntentKind`
  - `malvDecisionRationale`
  - `malvChatWsLiveStreamCallback`
  - `malvServerPhasedOrchestrationEnabled`

### Internal-only fields removed from user-safe meta

- worker/internal errors and probe internals
- internal router summary/details not intended for user payloads
- phased step `detail` strings

## 4) Degraded-Mode Guarantees

- Learning hydration remains bounded and non-blocking beyond budget.
- Learning-disabled mode skips hydration path safely.
- Deferred learning capture failures are swallowed and logged; chat hot path remains healthy.
- Worker stream fallback paths remain truthful; no silent success on hard failures.
- Policy block and interrupted outcomes must preserve explicit terminal semantics.

## 5) Performance/Safety Guardrails

- Reflex lane remains cheap and does not wait on learning hydration.
- Learning capture/flush remains deferred from hot response path.
- Phased progress signaling is event-level only; no extra inference calls.
- Safety/policy checks are unchanged and still gate risky requests before inference.

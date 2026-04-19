# MALV chat reply path contract

This describes how assistant text reaches the UI after the streaming-honesty refactor.

## WebSocket path (primary)

1. Client sends `chat:send` with `assistantMessageId`. The server acks immediately (`replyWillStream: true`).
2. `ChatService.handleChat` persists the user turn and an assistant placeholder, then `BeastOrchestratorService.handleChat` runs inference.
3. When the worker or local provider supports streaming and the turn is not a short-circuit (template/local generator), token deltas invoke `onAssistantStreamChunk` → gateway emits `chat:reply_chunk` with **real** provider/worker text (no fixed-size slicing).
4. **Server phased orchestration** (`MALV_SERVER_PHASED_CHAT_ORCHESTRATION`): if enabled and the execution strategy is `phased`, multi-step blocking `infer` runs for **both** HTTP and WebSocket when eligible (Phase 5 transport parity). Live token streaming still applies when the worker streams on the non-phased path; phased steps use discrete `infer` calls, and the gateway may emit the **final combined reply** as a single `chat:reply_chunk` when no live stream deltas arrived (same honesty rules as before).
5. If the model path returns a full reply with **no** streamed tokens (fallback brain, short-circuit, or non-streaming worker completion), the gateway emits **one** `chat:reply_chunk` with the **entire** final string — not many small chunks. This is honest non-streaming delivery, not simulated typing.
6. `malv:orchestration` with `type: assistant_done` is emitted **after** all reply chunks and **before** awaiting `finalizeAssistantTurn` (DB persistence). Finalization still runs in the same handler; failures are logged without sending a second `assistant_done`.
7. Interrupted turns: `assistant_done` with `terminal: interrupted` is emitted without synthetic replay; persistence follows existing `ChatService` / gateway rules.

## HTTP `POST /v1/chat` (fallback)

- Returns a single JSON body with the full reply. There is **no** SSE stream on this route.
- The web client applies **one** `assistant_delta` with the full text (when non-empty), then `assistant_done` with `finalContent`. No client-side chunking or artificial cadence.

## Phased / internal orchestration

- Phased multi-step worker calls run whenever strategy + env allow, independent of transport (Phase 5).
- Telemetry: `malvInferenceTrace.malvServerPhasedEligible` / `malvServerPhasedPlanned` describe eligibility and whether phased steps are scheduled to run. `malvServerPhasedSkippedForLiveWsStream` is a legacy field (now always false): phased is no longer suppressed merely because `onAssistantStreamChunk` is present. Use `malvChatWsLiveStreamCallback` to record that the WS streaming hook was passed.

## Determinism and safety

- No second `assistant_done` for a successful turn.
- Tier failover still avoids calling a second full inference after stream bytes have been emitted (`executeMalvTieredWorkerInfer`).
- Auth, conversation ownership, kill switch, and placeholder persistence are unchanged.

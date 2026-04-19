/**
 * # MALV assistant text pipeline (unified)
 *
 * **Layers**
 * 1. **Intake** (`malv-assistant-text-intake`) — websocket deltas → canonical string (chunk join, URL/fence guards).
 * 2. **Finalize** (`malv-assistant-text-finalize`) — `assistant_done` stream vs server text (stream-first UX).
 * 3. **Structure** (`malv-assistant-text-structure`) — deterministic fences + per-line roles (lists, headings, rules).
 * 4. **Present** (`malv-assistant-text-present`) — strip rich duplicates (settled only) + same fence/sanitize path as live.
 *
 * Streaming and settled bubbles share **structure** + **sanitize**; only intake and optional strip differ by phase.
 * React rendering stays in `MalvMessageBody`; it consumes {@link buildAssistantPresentationFenceSegments} only.
 */

export type { AssistantStreamCanonical } from "./malv-assistant-text-intake";
export {
  appendAssistantStreamCanonical,
  applyLowerUpperWordBreaksOutsideFences,
  computeStreamJoinGap,
  isBaseInsideStreamingCodeFence,
  isBaseInsideStreamingUrlTail,
  shouldInsertStreamGapBetweenChunks
} from "./malv-assistant-text-intake";

export type { AssistantPresentationPhase, BuildAssistantPresentationOptions } from "./malv-assistant-text-present";
export { buildAssistantPresentationFenceSegments } from "./malv-assistant-text-present";

export type { StreamingAssistantLine, StreamingFenceSegment } from "./malv-assistant-text-structure";
export {
  classifyAssistantProseLine,
  classifyStreamingAssistantLine,
  sanitizeProseForIncompleteMarkup,
  sanitizeStreamingAssistantProseForIncompleteMarkup,
  softenLiveTrailingProseLine,
  splitAssistantFenceSegments,
  splitStreamingAssistantFenceSegments
} from "./malv-assistant-text-structure";

export type {
  AssistantFinalReconcileResult,
  AssistantFinalReconcileSource,
  MalvTurnOutcomeForReconcile
} from "./malv-assistant-text-finalize";
export { reconcileAssistantDoneText } from "./malv-assistant-text-finalize";

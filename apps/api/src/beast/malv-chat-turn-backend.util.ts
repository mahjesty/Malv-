/**
 * Maps reply metadata to a single log line enum for chat turns (see MALV_CHAT_TURN_BACKEND).
 * - direct_local_inference: API called llama-server (OpenAI-compatible) directly for this turn.
 * - beast_worker: Reply came from POST /v1/infer (including phased orchestration on the worker).
 * - fallback_api: API-side operator fallback brain (worker empty / error / phased step failure).
 * - non_inferencing: Deterministic template path (greeting, light social, etc.) or interrupted.
 */
export type MalvChatTurnBackendLog =
  | "direct_local_inference"
  | "beast_worker"
  | "fallback_api"
  | "non_inferencing";

export function malvChatTurnBackendSelection(
  usedApiFallback: boolean,
  replySource: unknown
): MalvChatTurnBackendLog {
  const src = typeof replySource === "string" ? replySource : "";
  const templateOnly = new Set([
    "malv_light_social_short_circuit",
    "malv_greeting_short_circuit",
    "malv_identity_short_circuit",
    "malv_casual_small_talk_short_circuit",
    "malv_autonomous_clarification"
  ]);
  if (usedApiFallback) return "fallback_api";
  if (src === "local_openai_compatible") return "direct_local_inference";
  if (templateOnly.has(src)) return "non_inferencing";
  return "beast_worker";
}

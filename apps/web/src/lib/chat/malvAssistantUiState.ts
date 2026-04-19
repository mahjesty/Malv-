import type { MalvChatMessage } from "./types";
import { malvActivityLabel } from "./malvActivityLabels";

/** Set on first `assistant_delta` while canonical bytes exist (even if visible paint lags one rAF). Cleared when the turn ends. */
export const MALV_STREAM_CANONICAL_ACTIVE_META_KEY = "malvStreamCanonicalActive" as const;

/**
 * True when the assistant row has any painted characters **or** the client has buffered canonical stream bytes
 * for this turn (see {@link MALV_STREAM_CANONICAL_ACTIVE_META_KEY}). Uses raw length — whitespace counts.
 */
export function malvAssistantHasVisibleOrStreamedContent(msg: MalvChatMessage): boolean {
  if (msg.role !== "assistant") return false;
  const canonicalBuffered =
    msg.metadata?.[MALV_STREAM_CANONICAL_ACTIVE_META_KEY] === true;
  return msg.content.length > 0 || canonicalBuffered;
}

/**
 * Assistant UI state contract (single derived model for transcript row, bubble chrome, shell presence)
 *
 * Persistence uses `MalvChatMessage.status` (`preparing` | `thinking` | `streaming` | terminal…).
 * Surfaces must not infer “responding with text” from `streaming` alone — only from **visible** content
 * or the explicit pre-stream bands below.
 *
 * Bands:
 * - **preparing** — optimistic row before the first visible stream commit (no bytes painted yet).
 * - **thinking** — server signaled cognitive work (memory, phased activity, etc.) without visible reply.
 * - **stream_pending** — stream is active (status `streaming`) but no bytes are painted or buffered yet.
 * - **streaming_visible** — `status === "streaming"` and raw `content` or canonical buffer flag is non-empty.
 * - Terminal states (`done`, `error`, …) are not part of the live band model.
 */
export type MalvAssistantTypingBand = "preparing" | "thinking" | "stream_pending";

export function lastAssistantMessage(messages: MalvChatMessage[]): MalvChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "assistant") return m;
  }
  return null;
}

/** Bubble / in-row typing chrome — null when the assistant body should show instead. */
export function deriveMalvAssistantTypingBand(msg: MalvChatMessage): MalvAssistantTypingBand | null {
  if (msg.role !== "assistant") return null;
  if (malvAssistantHasVisibleOrStreamedContent(msg)) return null;
  if (msg.status === "preparing") return "preparing";
  if (msg.status === "thinking") return "thinking";
  if (msg.status === "streaming") return "stream_pending";
  return null;
}

/**
 * PresenceLayer “streaming” ambient — only when the user can see reply text forming.
 * Matches bubble semantics: pre-token phases stay in the calmer “thinking” environment.
 */
export function deriveMalvPresenceUsesStreamingAmbient(args: {
  generationActive: boolean;
  messages: MalvChatMessage[];
}): boolean {
  if (!args.generationActive) return false;
  const la = lastAssistantMessage(args.messages);
  if (!la || la.role !== "assistant") return false;
  const live = la.status === "streaming" || la.status === "preparing" || la.status === "thinking";
  return live && malvAssistantHasVisibleOrStreamedContent(la);
}

/** `computeMalvPresence` — internal “active” pulse (same truth as streaming ambient). */
export function deriveMalvPresenceAssistantEnergy(args: {
  generationActive: boolean;
  messages: MalvChatMessage[];
}): "idle" | "thinking" | "active" {
  if (!args.generationActive) return "idle";
  return deriveMalvPresenceUsesStreamingAmbient(args) ? "active" : "thinking";
}

/** Dev / secondary readouts (composer execution pill, etc.). */
export function deriveMalvExecutionStatusLabel(args: {
  generationActive: boolean;
  messages: MalvChatMessage[];
}): string {
  if (!args.generationActive) return "Idle";
  const la = lastAssistantMessage(args.messages);
  if (!la) return "Thinking";
  if (
    (la.status === "streaming" || la.status === "preparing" || la.status === "thinking") &&
    malvAssistantHasVisibleOrStreamedContent(la)
  ) {
    return "Live";
  }
  if (la.status === "streaming") return "Writing";
  if (la.status === "preparing" || la.status === "thinking") {
    return malvActivityLabel(la.activityPhase) ?? "Thinking";
  }
  return "Thinking";
}

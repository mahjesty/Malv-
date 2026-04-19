import type { MalvChatMessage } from "./types";
import { malvAssistantHasVisibleOrStreamedContent, lastAssistantMessage } from "./malvAssistantUiState";

/**
 * Ephemeral visible thought phase — lives only in active generation state.
 * This is NEVER persisted as chat history or assistant message content.
 *
 * Lifecycle:
 *   idle → visible_thought (server sends real thought lines) → responding (first token) → done
 *   idle → responding (no thought emitted — simple/direct prompts) → done
 *
 * Rules:
 * - `visible_thought` is temporary only — disappears on first real chunk
 * - `responding` starts the moment visible text exists in the stream
 * - Transitions are irreversible within a turn
 * - No stuck states: every generation path ends at `done`
 */
export type VisibleThoughtPhase = "idle" | "visible_thought" | "responding" | "done";

/**
 * Derive the current visible thought phase from chat state.
 * Deterministic — same inputs always produce the same phase.
 *
 * This is a read-only derived value; do NOT set it directly in state.
 */
export function deriveVisibleThoughtPhase(args: {
  generationActive: boolean;
  isThinking: boolean;
  thinkingSteps: string[];
  messages: MalvChatMessage[];
}): VisibleThoughtPhase {
  const { generationActive, isThinking, thinkingSteps, messages } = args;

  if (!generationActive) {
    return "idle";
  }

  const la = lastAssistantMessage(messages);

  // Once visible content exists, transition to responding — thought must go away.
  if (la && malvAssistantHasVisibleOrStreamedContent(la)) {
    return "responding";
  }

  // Show visible thought only when server sent real lines (not fallback).
  if (isThinking && thinkingSteps.length > 0) {
    return "visible_thought";
  }

  // Generation is active but neither thought nor content yet — treat as idle gap.
  return "idle";
}

/**
 * Returns true when visible thought should be displayed.
 * The thought card must be hidden the instant the response starts streaming.
 */
export function shouldRenderVisibleThought(args: {
  generationActive: boolean;
  isThinking: boolean;
  thinkingSteps: string[];
  messages: MalvChatMessage[];
}): boolean {
  return deriveVisibleThoughtPhase(args) === "visible_thought";
}

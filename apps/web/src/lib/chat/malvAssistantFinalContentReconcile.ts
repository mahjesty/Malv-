import { shouldPreferAssistantFinalContent } from "./malvAssistantFinalVsStream.util";

/**
 * assistant_done — stream vs server finalContent reconciliation
 *
 * Contract:
 * - **Live UX** is driven by the client canonical buffer and its cadence-limited visible prefix.
 * - **Complete successful turns** (`malvTurnOutcome` complete or omitted, not interrupted, non-empty stream):
 *   default remains **stream-first** so visible cadence is stable, **except** when `assistant_done.finalContent`
 *   is a **strict, conservative improvement** over the streamed buffer (canonical server body after WS
 *   truncation) — see {@link shouldPreferAssistantFinalContent}.
 * - **`partial_done` / server-biased merge:** when the turn is explicitly partial, keep the prior merge rules
 *   (prefix extension picks longer; substantive mismatch prefers server `finalContent`) so recovery text
 *   can land.
 * - **`failed_before_output`:** prefer server `finalContent` when present; otherwise keep any streamed text.
 * - **Interrupted** turns keep the streamed partial verbatim (user stopped; no server rewrite).
 */
export type AssistantFinalReconcileSource =
  | "stream"
  | "final"
  | "final_strict_improvement"
  | "merged_longer"
  | "interrupted_stream";

export type AssistantFinalReconcileResult = {
  text: string;
  source: AssistantFinalReconcileSource;
  /** When true, run the client emoji-expression pass (server-dominated or empty-stream completion). */
  applyEmojiLayer: boolean;
};

export type MalvTurnOutcomeForReconcile = "complete" | "partial_done" | "failed_before_output";

function reconcileStreamAndFinalWithServerBias(
  streamed: string,
  streamedTrim: string,
  finalRaw: string,
  finalTrim: string
): AssistantFinalReconcileResult {
  if (!streamedTrim) {
    return { text: finalRaw, source: "final", applyEmojiLayer: Boolean(finalTrim) };
  }

  if (!finalTrim) {
    return { text: streamed, source: "stream", applyEmojiLayer: false };
  }

  if (streamedTrim === finalTrim) {
    return { text: streamed, source: "stream", applyEmojiLayer: false };
  }

  const finalExtendsStream = finalTrim.startsWith(streamedTrim);
  const streamExtendsFinal = streamedTrim.startsWith(finalTrim);
  if (finalExtendsStream || streamExtendsFinal) {
    const pickFinal = finalTrim.length >= streamedTrim.length;
    return {
      text: pickFinal ? finalRaw : streamed,
      source: "merged_longer",
      applyEmojiLayer: pickFinal && Boolean(finalTrim)
    };
  }

  return { text: finalRaw, source: "final", applyEmojiLayer: Boolean(finalTrim) };
}

export function reconcileAssistantDoneText(args: {
  interrupted: boolean;
  streamed: string;
  finalContent: string | undefined;
  /** When omitted, treated as `complete` (older servers). */
  malvTurnOutcome?: MalvTurnOutcomeForReconcile;
}): AssistantFinalReconcileResult {
  const streamed = args.streamed;
  const streamedTrim = streamed.trim();
  const finalRaw = typeof args.finalContent === "string" ? args.finalContent : "";
  const finalTrim = finalRaw.trim();
  const outcome: MalvTurnOutcomeForReconcile = args.malvTurnOutcome ?? "complete";

  if (args.interrupted) {
    return { text: streamed, source: "interrupted_stream", applyEmojiLayer: false };
  }

  if (outcome === "failed_before_output") {
    if (!streamedTrim) {
      return { text: finalRaw, source: "final", applyEmojiLayer: Boolean(finalTrim) };
    }
    if (finalTrim) {
      return { text: finalRaw, source: "final", applyEmojiLayer: Boolean(finalTrim) };
    }
    return { text: streamed, source: "stream", applyEmojiLayer: false };
  }

  if (outcome === "partial_done") {
    return reconcileStreamAndFinalWithServerBias(streamed, streamedTrim, finalRaw, finalTrim);
  }

  // complete — stream-first when the user actually saw tokens, unless final is a strict improvement
  if (!streamedTrim) {
    return { text: finalRaw, source: "final", applyEmojiLayer: Boolean(finalTrim) };
  }

  if (
    shouldPreferAssistantFinalContent({
      streamedTrim,
      finalTrim,
      streamedRaw: streamed,
      finalRaw
    })
  ) {
    return { text: finalRaw, source: "final_strict_improvement", applyEmojiLayer: Boolean(finalTrim) };
  }

  return { text: streamed, source: "stream", applyEmojiLayer: false };
}

/**
 * Visible streaming cadence (paint layer) for assistant deltas.
 *
 * Contract (see useMalvChat + ChatMessageBubble):
 * - **Canonical** text accumulates on every real `assistant_delta` (refs + appendAssistantStreamCanonical).
 * - **Painted visible** text is always a prefix of canonical — never invented or reordered.
 * - **Final** row content after `assistant_done`: on normal complete turns the visible bubble matches the
 *   streamed canonical buffer; interrupt / error / partial paths follow their own rules in the hook.
 *
 * Coalescing is **frame-bound only**: each `requestAnimationFrame` tick paints the full current canonical
 * prefix (no wall-clock holds, no word-boundary stepping, no fixed 9/18-style burst thresholds). Natural
 * batching happens because many tiny deltas often land in the same frame; otherwise the display advances
 * at display refresh rate without “counting” artifacts.
 */
export type VisibleCadenceInput = {
  canonical: string;
  /** Length of canonical prefix currently shown in React message state. */
  visibleLen: number;
};

/**
 * Returns the next visible prefix length in `[visibleLen, canonical.length]`.
 * When canonical has grown, this is always `canonical.length` so the first post-delta frame shows
 * everything buffered so far (including whitespace-only tails).
 */
export function computeAssistantStreamVisibleEnd(input: VisibleCadenceInput): number {
  return input.canonical.length;
}

import type { RichSurfaceStripTargets } from "../malvRichResponsePresentation";
import { stripAssistantBodyForStructuredSurface } from "../malvRichResponsePresentation";
import {
  sanitizeProseForIncompleteMarkup,
  softenLiveTrailingProseLine,
  splitAssistantFenceSegments,
  type StreamingFenceSegment
} from "./malv-assistant-text-structure";

/**
 * `live` — in-flight assistant row (no structured-surface URL strip; same structural passes as settled).
 * `settled` — done / interrupted / partial / error row; optional rich-surface strip before structure.
 */
export type AssistantPresentationPhase = "live" | "settled";

export type BuildAssistantPresentationOptions = {
  phase: AssistantPresentationPhase;
  /** Applied only when `phase === "settled"` (matches prior ChatMessageBubble contract). */
  richSurfaceStrip?: RichSurfaceStripTargets | null;
};

/**
 * Normalization + fence segmentation for the assistant bubble: single entry used by {@link MalvMessageBody}.
 *
 * Order: (optional strip when settled) → ``` fence split → per-prose incomplete-markup sanitize.
 */
export function buildAssistantPresentationFenceSegments(
  rawAssistantText: string,
  options: BuildAssistantPresentationOptions
): StreamingFenceSegment[] {
  let text = rawAssistantText;
  if (options.phase === "settled" && options.richSurfaceStrip) {
    text = stripAssistantBodyForStructuredSurface(text, options.richSurfaceStrip);
  }
  return splitAssistantFenceSegments(text).map((seg) => {
    if (seg.kind !== "prose") return seg;
    const sanitized = sanitizeProseForIncompleteMarkup(seg.text);
    const polished = options.phase === "live" ? softenLiveTrailingProseLine(sanitized) : sanitized;
    return { ...seg, text: polished };
  });
}

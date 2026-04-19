import { stripMalvTutorialGuidancePhrasing } from "./malv-reply-behavior-postprocess.util";

/**
 * **Stream-only** light shaping for progressive `chat:reply_chunk` tokens.
 * Mirrors early passes of final delivery (spacing, obvious tutorial drift, mild punctuation noise)
 * without reliability clamps, identity policy, or full `shapeMalvReply`.
 */
export function shapeMalvAssistantStreamDeltaForDelivery(raw: string): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/[ \t\f\v]{2,}/g, " ");
  s = s.replace(/([!?])\1{2,}/g, "$1$1");
  s = s.replace(/\.{4,}/g, "...");
  s = s.replace(/(?:^|\n)[ \t]*([-*+])\1+\s*/g, "$1 ");
  s = stripMalvTutorialGuidancePhrasing(s);
  return s;
}

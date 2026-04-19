import { shapeMalvReply } from "./response-shaper";
import {
  enforceMalvFinalReplyIdentityPolicy,
  malvAssistantTextContainsLeakyFallbackIdentityNarrative,
  malvAssistantTextImpliesOrigin,
  type MalvIdentityEnforcementMode
} from "./malv-final-reply-identity-validator";
import type { MalvUniversalCapabilityRoute } from "./malv-universal-capability-router.util";

/**
 * Shaping plus identity enforcement: implicit-origin / leaky-disclaimer **replace** runs on raw text
 * before {@link shapeMalvReply} so leakage strips cannot erase trigger phrases; then shape + final enforce.
 */
export type FinalizeAssistantOutputBundle = {
  text: string;
  repetitionGuardTriggered: boolean;
  hadModelIdentityLeak: boolean;
  identityEnforcementMode: MalvIdentityEnforcementMode;
};

/**
 * Last-mile gate for **raw** model / worker / streamed-accumulated assistant text.
 */
export function finalizeAssistantOutputWithMeta(
  rawText: string,
  options?: {
    priorAssistantTexts?: string[];
    universalCapabilityRoute?: MalvUniversalCapabilityRoute | null;
    /**
     * When true the model's tokens were already forwarded during streaming; suppress
     * hollow-opener stripping so the final body doesn't silently drop text the user saw.
     */
    skipLeadingHollowOpenerStrip?: boolean;
  }
): FinalizeAssistantOutputBundle {
  const raw = typeof rawText === "string" ? rawText : "";
  /**
   * Implicit-origin + leaky-disclaimer gates must run on raw text: {@link shapeMalvReply} strips vendor
   * sentences first and can erase evidence that {@link malvAssistantTextImpliesOrigin} needs.
   * Other replace outcomes still flow through shaping so mixed technical + leakage turns can be rewritten.
   */
  const implicitOrLeakyOrigin =
    malvAssistantTextContainsLeakyFallbackIdentityNarrative(raw) || malvAssistantTextImpliesOrigin(raw);
  if (implicitOrLeakyOrigin) {
    const gate = enforceMalvFinalReplyIdentityPolicy(raw);
    if (gate.mode === "replace") {
      return {
        text: gate.text.trim(),
        repetitionGuardTriggered: false,
        hadModelIdentityLeak: true,
        identityEnforcementMode: "replace"
      };
    }
  }
  const shaped = shapeMalvReply(raw, {
    priorAssistantTexts: options?.priorAssistantTexts ?? [],
    universalCapabilityRoute: options?.universalCapabilityRoute ?? null,
    skipLeadingHollowOpenerStrip: options?.skipLeadingHollowOpenerStrip ?? false
  });
  const enforced = enforceMalvFinalReplyIdentityPolicy(shaped.text);
  const text = enforced.text.trim() || shaped.text.trim();
  return {
    text: text.trim(),
    repetitionGuardTriggered: shaped.repetitionGuardTriggered,
    hadModelIdentityLeak: shaped.hadModelIdentityLeak || enforced.hadViolation,
    identityEnforcementMode: enforced.hadViolation ? enforced.mode : shaped.identityEnforcementMode
  };
}

export function finalizeAssistantOutput(rawText: string, options?: { priorAssistantTexts?: string[] }): string {
  return finalizeAssistantOutputWithMeta(rawText, options).text;
}

/**
 * Safe-only finalization for text that was **already progressively revealed** to the user during
 * streaming.  Unlike {@link finalizeAssistantOutputWithMeta}, this function:
 *
 * - Never replaces the full body with an identity policy line (demotes REPLACE → strip).
 *   Identity sentences are still removed; only a whole-body swap is suppressed.
 * - Skips leading hollow-opener stripping (the user already saw the opener token).
 * - Still applies every safe strip pass: identity leakage, tutorial guidance, response style,
 *   offline-capability disclaimers, repetition guard, and trailing generic closers.
 *
 * This is the canonical finalization for `sawLiveStreamTokens = true` paths.
 * The completed streamed body passed through this function equals `assistant_done.finalContent`
 * and what is persisted + hydrated on refresh — one artifact, never two.
 */
export function finalizeAssistantOutputForStreamedReply(
  streamAccumText: string,
  options?: {
    priorAssistantTexts?: string[];
    universalCapabilityRoute?: MalvUniversalCapabilityRoute | null;
  }
): string {
  const raw = typeof streamAccumText === "string" ? streamAccumText : "";
  if (!raw.trim()) return "";

  // Skip the early REPLACE gate: never swap the full streamed body for a policy line.
  // Apply full shape with leading opener preserved + identity replace demoted to strip.
  const shaped = shapeMalvReply(raw, {
    priorAssistantTexts: options?.priorAssistantTexts ?? [],
    universalCapabilityRoute: options?.universalCapabilityRoute ?? null,
    skipLeadingHollowOpenerStrip: true,
    demoteIdentityReplace: true
  });

  // Final enforcement on already-shaped text (also strip-only — demote again in case the
  // first pass didn't catch everything via shapeMalvReply internals).
  const enforced = enforceMalvFinalReplyIdentityPolicy(shaped.text, undefined, { demoteReplaceToStrip: true });
  return enforced.text.trim() || shaped.text.trim();
}

/**
 * Identity gate for text that **already** passed orchestrator shaping (e.g. `beastRes.reply`).
 * Does not re-run {@link shapeMalvReply} — avoids double-stripping / repetition guard drift.
 */
export function assertMalvAssistantIdentityGate(visibleText: string): string {
  return enforceMalvFinalReplyIdentityPolicy(typeof visibleText === "string" ? visibleText : "").text.trim();
}

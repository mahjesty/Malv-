import type { ModeType } from "./mode-router";
import type { IdentityQuestionKind, LightSocialKind } from "./malv-conversation-signals";
import {
  detectLightSocialMessage,
  detectMalvIdentityQuestion,
  detectSimpleGreeting
} from "./malv-conversation-signals";
import { detectSocialSmalltalkCheckin } from "./malv-response-generator";

export type MalvReflexKind =
  | { kind: "light_social"; lightSocialKind: LightSocialKind }
  | { kind: "greeting" }
  | { kind: "identity"; identityKind: IdentityQuestionKind }
  | { kind: "social_smalltalk" };

const DEFAULT_REFLEX_MAX_MESSAGE_CHARS = 200;
const IDENTITY_REFLEX_MAX_MESSAGE_CHARS = 260;

/**
 * Earliest safe template/reflex classification — deterministic, no intent service.
 *
 * Phase 5 contract: any turn that matches here must take the Tier-0 reflex lane in
 * {@link BeastOrchestratorService.handleChat} (minimal thread slice + {@link buildDeterministicTemplateShortCircuit}).
 * Do not re-run the same detectors later after full context assembly — that duplicated economics, diverged gates
 * (e.g. superFix + social text), and could bypass vault/operator/explore protections that this classifier enforces.
 */
export function classifyMalvReflexTurn(
  message: string,
  gates: {
    superFix: boolean;
    vaultSessionId: string | null | undefined;
    operatorPhase: string | null | undefined;
    exploreHandoffJson: string | null | undefined;
    modeType: ModeType;
    inputMode?: "text" | "voice" | "video" | null;
    /** Reflex templates are tuned for short turns; longer text may carry hidden task intent. */
    maxMessageChars?: number;
  }
): MalvReflexKind | null {
  if (gates.superFix) return null;
  if (gates.vaultSessionId) return null;
  if (gates.operatorPhase && String(gates.operatorPhase).trim()) return null;
  if (typeof gates.exploreHandoffJson === "string" && gates.exploreHandoffJson.trim()) return null;
  if (gates.modeType === "execute" || gates.modeType === "operator_workflow") return null;
  if (gates.inputMode && gates.inputMode !== "text") return null;

  const t = message.trim();
  const maxLen = gates.maxMessageChars ?? DEFAULT_REFLEX_MAX_MESSAGE_CHARS;
  const identityKind = detectMalvIdentityQuestion(message);
  if (identityKind && t.length <= IDENTITY_REFLEX_MAX_MESSAGE_CHARS) {
    return { kind: "identity", identityKind };
  }
  if (t.length > maxLen) return null;

  const lightSocialKind = detectLightSocialMessage(message);
  if (lightSocialKind) {
    return { kind: "light_social", lightSocialKind };
  }
  if (detectSimpleGreeting(message)) {
    return { kind: "greeting" };
  }
  if (identityKind) return { kind: "identity", identityKind };
  if (detectSocialSmalltalkCheckin(message)) {
    return { kind: "social_smalltalk" };
  }
  return null;
}

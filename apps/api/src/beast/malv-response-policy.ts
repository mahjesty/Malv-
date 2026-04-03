import type { ModeType } from "./mode-router";
import type { UserToneAnalysis } from "./malv-conversation-signals";
import type { MetaIntelligenceDecision } from "../intelligence/meta-intelligence.types";

/**
 * High-level response stance presets (drives a compact prompt block, not a full rewrite).
 */
export type MalvResponsePolicy =
  | "calm_direct"
  | "technical_precise"
  | "supportive_clear"
  | "strategic_operator"
  | "concise_fix"
  | "careful_sensitive"
  | "high_agency_builder"
  | "identity_direct";

export type MappedResponsePolicy = {
  primary: MalvResponsePolicy;
  secondary?: MalvResponsePolicy;
};

export function mapResponsePolicy(
  modeType: ModeType,
  tone: UserToneAnalysis,
  metaDecision?: MetaIntelligenceDecision | null
): MappedResponsePolicy {
  if (tone.userTone === "identity_query") {
    return { primary: "identity_direct" };
  }

  if (metaDecision?.finalResponsePolicy?.toneStyle) {
    return { primary: metaDecision.finalResponsePolicy.toneStyle };
  }

  const frustratedFamily = tone.userTone === "frustrated" || tone.userTone === "dissatisfied";

  if (tone.userTone === "sensitive" || tone.emotionalSensitivity === "high") {
    if (modeType === "fix" || modeType === "execute") {
      return { primary: "careful_sensitive", secondary: "concise_fix" };
    }
    return { primary: "careful_sensitive", secondary: "supportive_clear" };
  }

  if (frustratedFamily && (modeType === "fix" || modeType === "execute")) {
    return { primary: "calm_direct", secondary: "concise_fix" };
  }
  if (frustratedFamily) {
    return { primary: "calm_direct", secondary: "supportive_clear" };
  }

  if (tone.userTone === "confused" || tone.userTone === "emotional") {
    return { primary: "supportive_clear", secondary: modeType === "fix" ? "concise_fix" : undefined };
  }

  if (tone.userTone === "technical" && (modeType === "fix" || modeType === "execute")) {
    return { primary: "technical_precise", secondary: "concise_fix" };
  }
  if (tone.userTone === "technical") {
    return { primary: "technical_precise" };
  }

  if (tone.userTone === "direct" || tone.urgency === "high") {
    return { primary: "concise_fix", secondary: modeType === "analyze" ? "technical_precise" : undefined };
  }

  if (tone.userTone === "builder" || tone.userTone === "exploratory" || modeType === "operator_workflow") {
    return { primary: "strategic_operator", secondary: "high_agency_builder" };
  }

  if (modeType === "fix") return { primary: "concise_fix", secondary: "technical_precise" };
  if (modeType === "execute") return { primary: "concise_fix" };
  if (modeType === "explain") return { primary: "supportive_clear" };
  if (modeType === "improve") {
    return { primary: "strategic_operator" };
  }

  return { primary: "calm_direct" };
}

const POLICY_LINES: Record<MalvResponsePolicy, string> = {
  calm_direct:
    "User reads tense or impatient — stay calm, economical, and grounded. One short acknowledgement if it helps, then the next concrete move. No mirrored frustration, no therapy cadence, no stacked apologies.",
  technical_precise:
    "User reads technical — precision, structure, checkable facts. Numbered steps for procedures; explicit assumptions; no condescension.",
  supportive_clear:
    "User reads confused — explain plainly, key answer first, brief definitions, optional depth. Sound like a sharp colleague, not a tutorial bot.",
  strategic_operator:
    "User reads exploratory or planning — operator framing: options, tradeoffs, sequencing, handoffs. No pep talk, no filler offers to help.",
  concise_fix:
    "User wants action — lead with the fix or decision; minimal preamble. No 'certainly/sure/of course' padding, no repeated helpdesk invitations.",
  careful_sensitive:
    "Sensitive topic — respectful, precise, non-performative. No flippant tone; no fake emotional mirroring.",
  high_agency_builder:
    "User is building — strategic, execution-oriented; scoped next moves with acceptance checks. Keep momentum without hype.",
  identity_direct:
    "Identity question — answer as MALV in one or two grounded sentences. Memorable, not corporate; never claim a vendor model identity."
};

/**
 * Compact block appended under Mode in the worker prompt.
 */
export function buildToneInstructionBlock(mapped: MappedResponsePolicy): string {
  const lines = [POLICY_LINES[mapped.primary]];
  if (mapped.secondary) lines.push(POLICY_LINES[mapped.secondary]);
  return `### [system] Response tone (this turn)\n${lines.join("\n")}`;
}

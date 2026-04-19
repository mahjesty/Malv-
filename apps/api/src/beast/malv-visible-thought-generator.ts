import type { ClassifiedIntent } from "./intent-understanding.types";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";
import type { MalvResponsePlan } from "./malv-response-planning.util";
import type { ExecutionStrategyResult } from "./execution-strategy.service";

export type VisibleThoughtGeneratorInput = {
  classified: ClassifiedIntent;
  interpretation: MalvSemanticInterpretation;
  plan: MalvResponsePlan;
  strategy: ExecutionStrategyResult;
  rawUserMessage: string;
};

/**
 * Banlist — internal system/technical terms that must never appear in
 * user-facing visible thought lines.
 *
 * This list is enforced in tests; any addition here must be deliberately chosen.
 */
export const VISIBLE_THOUGHT_INTERNAL_TERM_BANLIST: readonly string[] = [
  "ambiguity",
  "execution strategy",
  "execution_strategy",
  "pipeline",
  "confidence score",
  "confidence_score",
  "routing decision",
  "routing_decision",
  "policy triggered",
  "policy_triggered",
  "intent classifier",
  "intent_classifier",
  "classified intent",
  "classified_intent",
  "tier correction",
  "tier_correction",
  "beast worker",
  "beast_worker",
  "reflex lane",
  "reflex_lane",
  "orchestrat",
  "companion light",
  "companion_light",
  "semantic interpretation",
  "semantic_interpretation"
];

/**
 * Build a short set of human-readable thought lines from the turn's internal
 * signals. Returns 1–4 lines. Never returns generic filler — if no meaningful
 * signal maps to natural language, returns a minimal safe line based on the
 * strongest available signal.
 *
 * IMPORTANT: Output must be natural language only. No internal system terms.
 * This is user-facing content.
 */
export function generateVisibleThoughtLines(input: VisibleThoughtGeneratorInput): string[] {
  const { classified, interpretation, plan, strategy, rawUserMessage } = input;

  const lines: string[] = [];

  // ─── Primary line — one line that names the core situation ───────────────

  const isDelegated = interpretation.delegationLevel === "topic_choice";
  const isBroadOpen = interpretation.intentSurface === "open_broad_or_explore";
  const isSoftwareEngineering = interpretation.intentSurface === "software_engineering";
  const isHighComplexity = classified.complexity === "high";
  const isLargeScope = classified.scopeSize === "large";
  const isPhased = strategy.mode === "phased";
  const wantsStepByStep = interpretation.constraints.wantsStepByStep;
  const wantsDepth = interpretation.constraints.wantsDepth;
  const isDeepPlan = plan.depth === "deep";
  const isStepByStepPlan = plan.structure === "step_by_step";
  const hasExplainKeyword =
    /\b(explain|walk\s+(me\s+)?through|take\s+me\s+through|help\s+me\s+understand|break(?:\s+it)?\s+down|breakdown)\b/i.test(
      rawUserMessage
    );
  const hasDebugKeyword =
    /\b(debug|debugging|diagnos[ei]|not\s+working|doesn'?t\s+work|broken|error|crash|fail(?:ing)?)\b/i.test(
      rawUserMessage
    );
  const hasPlanKeyword =
    /\b(plan(?:ning)?|audit|review|design|outline\s+a\s+plan|help\s+me\s+design|how\s+should\s+i\s+approach|think\s+through|work\s+through)\b/i.test(
      rawUserMessage
    );
  const hasCompareKeyword =
    /\b(compar[ei]|contrast|evaluate|vs\.?|versus|pros\s+and\s+cons|trade[\s-]offs?)\b/i.test(
      rawUserMessage
    );

  if (isDelegated || isBroadOpen) {
    lines.push("You left this open, so I'll find a direction worth exploring.");
  } else if (wantsStepByStep || isStepByStepPlan) {
    lines.push("I'll break this down step by step so it's easy to follow.");
  } else if (hasDebugKeyword && isSoftwareEngineering) {
    lines.push("This looks like a debugging problem, so I'll work through likely causes first.");
  } else if (hasExplainKeyword) {
    lines.push("I'll walk through this clearly so nothing gets skipped.");
  } else if (hasPlanKeyword) {
    lines.push("I'll think through the approach before giving you an answer.");
  } else if (hasCompareKeyword) {
    lines.push("I'll lay out both sides so the comparison is clear.");
  } else if (isSoftwareEngineering && isHighComplexity) {
    lines.push("This is a real engineering problem, so I'm approaching it methodically.");
  } else if (isHighComplexity || isLargeScope) {
    lines.push("There's a fair amount here, so I'm organizing the answer before I dive in.");
  } else if (isPhased && strategy.internalPhases.length >= 3) {
    lines.push("There are a few moving parts here, so I'm mapping the approach first.");
  } else if (wantsDepth || isDeepPlan) {
    lines.push("This one deserves depth, so I'm building a thorough answer.");
  } else if (isPhased) {
    lines.push("I'm laying this out carefully — there are a few steps involved.");
  } else {
    // Safe fallback for any eligible turn without a more specific signal
    lines.push("I'm putting together a clear answer for this.");
  }

  // ─── Optional secondary line — adds useful context without repetition ─────

  // Only add a second line if there's a genuinely distinct signal not already named.
  if (lines.length === 1) {
    const alreadyNamedSteps = wantsStepByStep || isStepByStepPlan || lines[0]?.includes("step");
    const alreadyNamedDepth = wantsDepth || isDeepPlan || lines[0]?.includes("deep") || lines[0]?.includes("thorough");
    const alreadyNamedParts = isPhased || lines[0]?.includes("parts") || lines[0]?.includes("steps");
    const alreadyNamedApproach = lines[0]?.includes("approach") || lines[0]?.includes("organiz");

    if (isPhased && strategy.internalPhases.length >= 3 && !alreadyNamedParts && !alreadyNamedApproach) {
      lines.push("There are a few moving parts here, so I'm organizing before I jump in.");
    } else if (isDeepPlan && !alreadyNamedDepth && !alreadyNamedSteps) {
      lines.push("The answer here goes deep — I'm building it properly.");
    } else if (isLargeScope && !isHighComplexity && !alreadyNamedApproach) {
      lines.push("It's a bigger topic, so I'll structure this clearly.");
    } else if (wantsStepByStep && !alreadyNamedSteps) {
      lines.push("I'll break it into clear numbered steps.");
    }
  }

  return lines.slice(0, 4);
}

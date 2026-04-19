import type { ClassifiedIntent } from "./intent-understanding.types";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";
import type { MalvDecisionMode, MalvResponsePlan } from "./malv-response-planning.util";
import type { ExecutionStrategyResult } from "./execution-strategy.service";

export type VisibleThoughtEligibilityInput = {
  classified: ClassifiedIntent;
  interpretation: MalvSemanticInterpretation;
  plan: MalvResponsePlan;
  strategy: ExecutionStrategyResult;
  decisionMode: MalvDecisionMode;
  rawUserMessage: string;
};

export type VisibleThoughtEligibilityResult = {
  eligible: boolean;
  /** Internal audit code — never user-facing or logged to observable channels. */
  reason: string;
};

/**
 * Explicit keyword signals that indicate user expects reasoning/framing before the answer.
 * Matched case-insensitively.
 */
const APPROACH_FRAMING_KEYWORDS_RE =
  /\b(explain|walk\s+(me\s+)?through|step[\s-]by[\s-]step|plan(?:ning)?|audit|debug(?:ging)?|analyz[ei]|review|compare|evaluate|critique|deep\s+dive|break(?:\s+it)?\s+down|breakdown|diagnos[ei]|investigate|help\s+me\s+understand|take\s+me\s+through|show\s+me\s+how|how\s+should\s+i|what\s+should\s+i|where\s+do\s+i\s+start|how\s+do\s+i\s+approach|guide\s+me|outline\s+a\s+plan|help\s+me\s+design|think\s+through|reason\s+through|work\s+through)\b/i;

/**
 * Deterministic, no-LLM eligibility decision for whether MALV should show
 * humanized visible thought before streaming its response.
 *
 * Visible thought is a premium UX signal — it must only appear when it adds
 * real perceived continuity value for the user. Do NOT show it for every turn.
 *
 * Ordering rules:
 * 1. Absolute safety exclusions always win (guarded, clarify)
 * 2. High-signal semantic qualifiers are checked BEFORE structural exclusions
 *    (delegation, open intent, explicit depth constraints, approach keywords)
 * 3. Structural exclusions apply only when no semantic signal already qualified
 * 4. Remaining quantitative signals (complexity, scope, plan shape, strategy)
 *
 * No randomization. Same inputs always produce the same result.
 */
export function shouldShowVisibleThought(
  input: VisibleThoughtEligibilityInput
): VisibleThoughtEligibilityResult {
  const { classified, interpretation, plan, strategy, decisionMode, rawUserMessage } = input;
  const msg = rawUserMessage.trim();

  // ─── Absolute exclusions ─────────────────────────────────────────────────
  // These are non-negotiable and cannot be overridden by any qualifying signal.

  // Safety-constrained responses must not show visible thought.
  if (decisionMode === "guarded") {
    return { eligible: false, reason: "excluded:guarded_decision_mode" };
  }
  // Clarification requests are incomplete — nothing to frame yet.
  if (decisionMode === "clarify") {
    return { eligible: false, reason: "excluded:clarify_decision_mode" };
  }

  // ─── High-signal semantic qualifiers (checked before structural exclusions) ─
  // These represent strong user intent signals that warrant approach framing
  // regardless of what the response plan structure looks like.

  // User explicitly delegated direction — MALV is choosing on their behalf.
  if (interpretation.delegationLevel === "topic_choice") {
    return { eligible: true, reason: "qualified:delegation_topic_choice" };
  }

  // Broad, open-ended, or exploratory intent — approach framing adds value.
  if (interpretation.intentSurface === "open_broad_or_explore") {
    return { eligible: true, reason: "qualified:open_broad_explore" };
  }

  // User explicitly asked for step-by-step or depth — honor the stated preference.
  if (interpretation.constraints.wantsStepByStep || interpretation.constraints.wantsDepth) {
    return { eligible: true, reason: "qualified:explicit_depth_or_steps_constraint" };
  }

  // Approach-framing keywords in the message — user expects methodical handling.
  if (APPROACH_FRAMING_KEYWORDS_RE.test(msg)) {
    return { eligible: true, reason: "qualified:approach_keyword_match" };
  }

  // ─── Structural exclusions ───────────────────────────────────────────────
  // Only evaluated after confirming no high-signal semantic qualifier matched.

  // A direct + light plan means MALV is answering immediately — no approach needed.
  const isDirectLight =
    plan.structure === "direct" &&
    plan.depth === "light" &&
    !interpretation.constraints.wantsStepByStep &&
    !interpretation.constraints.wantsDepth;
  if (isDirectLight) {
    return { eligible: false, reason: "excluded:direct_light_plan" };
  }

  // Low-complexity casual QA with no depth or keyword signals — just answer.
  const isCasualLowComplexity =
    interpretation.intentSurface === "knowledge_or_casual_qa" &&
    classified.complexity === "low" &&
    classified.scopeSize === "small" &&
    !interpretation.constraints.wantsDepth &&
    !interpretation.constraints.wantsStepByStep &&
    plan.depth !== "deep" &&
    plan.steps.length < 4;
  if (isCasualLowComplexity) {
    return { eligible: false, reason: "excluded:casual_low_complexity_qa" };
  }

  // Very short messages with no complexity signals.
  const isVeryShortNoSignals =
    msg.length < 50 &&
    classified.scopeSize === "small" &&
    classified.complexity === "low" &&
    !interpretation.constraints.wantsStepByStep &&
    !interpretation.constraints.wantsDepth;
  if (isVeryShortNoSignals) {
    return { eligible: false, reason: "excluded:short_no_signals" };
  }

  // ─── Quantitative qualifying signals ─────────────────────────────────────

  if (classified.complexity === "high") {
    return { eligible: true, reason: "qualified:high_complexity" };
  }
  if (classified.scopeSize === "large") {
    return { eligible: true, reason: "qualified:large_scope" };
  }
  if (plan.depth === "deep") {
    return { eligible: true, reason: "qualified:plan_depth_deep" };
  }
  if (plan.structure === "step_by_step") {
    return { eligible: true, reason: "qualified:plan_structure_step_by_step" };
  }
  // Sectioned non-light response — enough structure to warrant brief framing.
  if (plan.structure === "sectioned" && plan.depth !== "light") {
    return { eligible: true, reason: "qualified:sectioned_non_light" };
  }
  if (plan.steps.length >= 4) {
    return { eligible: true, reason: "qualified:plan_steps_gte_4" };
  }
  if (strategy.mode === "phased") {
    return { eligible: true, reason: "qualified:strategy_phased" };
  }
  if (strategy.internalPhases.length >= 3) {
    return { eligible: true, reason: "qualified:strategy_phases_gte_3" };
  }
  if (strategy.preferBeastWorker && classified.scopeSize !== "small") {
    return { eligible: true, reason: "qualified:beast_worker_non_small_scope" };
  }

  return { eligible: false, reason: "not_eligible:no_qualifying_signals" };
}

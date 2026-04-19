import type { MetaIntelligenceDecision } from "../intelligence/meta-intelligence.types";
import type { ModeType } from "./mode-router";
import type { ClassifiedIntent } from "./intent-understanding.types";
import { messageLooksLikeKnowledgeOrCasualQuestion } from "./intent-understanding.service";
import { isBroadButAnswerableUserRequest, isUserDelegatingTopicChoice } from "./malv-broad-request-resolution.util";
import type { ExecutionStrategyResult } from "./execution-strategy.service";
import { STANDARD_ENGINEERING_LOOP } from "./execution-strategy.service";
import type { MalvCognitiveEffortTier } from "./malv-cognitive-effort-tier";
import { resolveMalvCognitiveEffortTier } from "./malv-cognitive-effort-tier";
import type { MalvAdaptiveTierThresholds } from "../malv-learning/malv-adaptive-thresholds.util";

const INTENT_KINDS = [
  "full_product_build",
  "feature_build",
  "bug_fix",
  "improvement_refactor",
  "frontend_design",
  "backend_logic",
  "system_upgrade"
] as const;

/** Ambiguity / fork language — cheap scan. */
const AMBIGUITY_PHRASE_RE =
  /\b(or|either|versus|vs\.?|could mean|not sure which|which one|ambiguous|unclear|two things|two ways)\b/i;

const CODING_CHANGE_RE =
  /\b(code|debug|stack\s*trace|stacktrace|typescript|javascript|python|react|nestjs|endpoint|prisma|sql|git\b|commit|patch|pull request|refactor|deploy|dockerfile|kubernetes|k8s|terraform|ci\s*\/\s*cd|npm\b|yarn|pnpm|build\b|jest|pytest|eslint)\b/i;

const EXECUTION_VERB_RE = /\b(run|execute|deploy|approve|sandbox|patch|apply|ship)\b/i;

export type MalvConfidenceSignals = {
  ambiguity: boolean;
  multi_intent: boolean;
  low_information: boolean;
  conflicting_context: boolean;
};

/** Phase-3 confidence object — cheap heuristics only until response phase fills responseConfidence. */
export type MalvTurnConfidence = {
  intentConfidence: number;
  tierConfidence: number;
  responseConfidence: number;
  executionConfidence?: number;
  signals: MalvConfidenceSignals;
  /** Short human-readable rationale for logs / trace. */
  decisionRationale: string;
};

export type MalvTierCorrectionTrace = {
  fromTier: MalvCognitiveEffortTier;
  toTier: MalvCognitiveEffortTier;
  reason: string;
};

export type MalvResponseRetryTrace = {
  triggered: boolean;
  kind: "refine_append" | "clarification_append" | "none";
  detail?: string;
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function maxIntentScore(classified: ClassifiedIntent): number {
  return Math.max(...INTENT_KINDS.map((k) => classified.scores[k]));
}

function topTwoIntentGap(classified: ClassifiedIntent): { first: string; second: string; gap: number; max: number } {
  const entries = (Object.entries(classified.scores) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  const gap = (entries[0]?.[1] ?? 0) - (entries[1]?.[1] ?? 0);
  return { first: entries[0]?.[0] ?? "feature_build", second: entries[1]?.[0] ?? "feature_build", gap, max };
}

function countStrongIntents(classified: ClassifiedIntent, threshold = 2): number {
  return INTENT_KINDS.filter((k) => classified.scores[k] >= threshold).length;
}

/**
 * Cheap intent confidence from score separation and peak strength.
 */
export function deriveIntentConfidence(classified: ClassifiedIntent): number {
  const { gap, max } = topTwoIntentGap(classified);
  if (classified.ambiguity.isAmbiguous) return clamp01(0.28 + gap * 0.06);

  let base = 0.42;
  if (gap >= 5) base = 0.92;
  else if (gap >= 3) base = 0.82;
  else if (gap >= 2) base = 0.72;
  else if (gap >= 1) base = 0.58;
  else base = 0.38;

  const peakBoost = clamp01(max / 12) * 0.12;
  return clamp01(base + peakBoost);
}

export function detectMultiIntent(classified: ClassifiedIntent): boolean {
  if (countStrongIntents(classified, 2) >= 2) return true;
  const { gap, max } = topTwoIntentGap(classified);
  return max >= 2 && gap <= 2;
}

export function detectSoftAmbiguitySignal(rawMessage: string, classified: ClassifiedIntent): boolean {
  const m = rawMessage.trim();
  if (classified.ambiguity.isAmbiguous) return true;
  if (messageLooksLikeKnowledgeOrCasualQuestion(m) || isBroadButAnswerableUserRequest(m) || isUserDelegatingTopicChoice(m)) {
    return false;
  }
  if (AMBIGUITY_PHRASE_RE.test(m)) return true;
  const { gap, max } = topTwoIntentGap(classified);
  return max >= 2 && gap <= 1 && m.length < 200;
}

export function detectLowInformationSignal(rawMessage: string, classified: ClassifiedIntent): boolean {
  const t = rawMessage.trim();
  return t.length < 36 && maxIntentScore(classified) <= 1;
}

export function deriveExecutionConfidence(strategy: ExecutionStrategyResult): number {
  const map: Record<ExecutionStrategyResult["riskTier"], number> = {
    low: 0.88,
    medium: 0.68,
    high: 0.52
  };
  return map[strategy.riskTier];
}

export function computeMalvConfidencePreResponse(args: {
  classified: ClassifiedIntent;
  strategy: ExecutionStrategyResult;
  rawMessage: string;
  tierCorrection: MalvTierCorrectionTrace | null;
  cognitiveTier: MalvCognitiveEffortTier;
}): MalvTurnConfidence {
  const intentConfidence = deriveIntentConfidence(args.classified);
  let tierConfidence = 0.86;
  if (args.tierCorrection) tierConfidence = 0.72;
  if (args.cognitiveTier >= 2 && intentConfidence < 0.55) tierConfidence -= 0.08;

  const signals: MalvConfidenceSignals = {
    ambiguity: detectSoftAmbiguitySignal(args.rawMessage, args.classified),
    multi_intent: detectMultiIntent(args.classified),
    low_information: detectLowInformationSignal(args.rawMessage, args.classified),
    conflicting_context: false
  };

  const rationaleParts = [
    `intent=${intentConfidence.toFixed(2)}`,
    args.tierCorrection ? `tier_fix=${args.tierCorrection.fromTier}->${args.tierCorrection.toTier}` : "tier_ok",
    signals.multi_intent ? "multi" : "",
    signals.ambiguity ? "amb" : "",
    signals.low_information ? "low_info" : ""
  ].filter(Boolean);

  return {
    intentConfidence,
    tierConfidence: clamp01(tierConfidence),
    responseConfidence: 0,
    executionConfidence: deriveExecutionConfidence(args.strategy),
    signals,
    decisionRationale: rationaleParts.join("; ")
  };
}

/** Optional routing-disagreement signal from agent task router (Tier 2+ only). */
export function applyAgentRouterConfidenceAdjust(
  c: MalvTurnConfidence,
  cognitiveTier: MalvCognitiveEffortTier,
  routerConfidence: number | null | undefined
): MalvTurnConfidence {
  if (cognitiveTier < 2 || routerConfidence == null || Number.isNaN(routerConfidence)) return c;
  if (routerConfidence >= 0.42) return c;
  return {
    ...c,
    tierConfidence: clamp01(c.tierConfidence - 0.06),
    decisionRationale: `${c.decisionRationale}; agent_router_low`
  };
}

export function enrichMalvConfidenceWithMeta(
  confidence: MalvTurnConfidence,
  metaDecision: MetaIntelligenceDecision | null,
  cognitiveTier: MalvCognitiveEffortTier
): MalvTurnConfidence {
  if (cognitiveTier < 2 || !metaDecision) {
    return { ...confidence, signals: { ...confidence.signals } };
  }
  const conflicting = Boolean(metaDecision.routerDecisionTrace?.conflictingSignalsDetected);
  const metaLow = typeof metaDecision.overallDecisionConfidence === "number" && metaDecision.overallDecisionConfidence < 0.45;
  const nextSignals = {
    ...confidence.signals,
    conflicting_context: conflicting
  };
  let tierConfidence = confidence.tierConfidence;
  if (conflicting) tierConfidence -= 0.1;
  if (metaLow) tierConfidence -= 0.06;
  const rationale = confidence.decisionRationale + (conflicting ? "; meta_conflict" : "") + (metaLow ? "; meta_low" : "");
  return {
    ...confidence,
    tierConfidence: clamp01(tierConfidence),
    signals: nextSignals,
    decisionRationale: rationale
  };
}

export function finalizeMalvConfidenceWithResponse(
  confidence: MalvTurnConfidence,
  responseConfidence: number
): MalvTurnConfidence {
  return {
    ...confidence,
    responseConfidence: clamp01(responseConfidence)
  };
}

/**
 * Single correction pass: Tier-1 companion-light → add engineering loop, or heavy single-step → companion-light when clearly safe.
 * Does not run on reflex (caller must not invoke for reflex lane). Skips execution / super-fix / full phased mode.
 */
export function applyMalvTierStrategyCorrectionOnce(args: {
  classified: ClassifiedIntent;
  strategy: ExecutionStrategyResult;
  rawMessage: string;
  modeType: ModeType;
  superFix: boolean;
  /** Phase 4 — bounded adaptive thresholds (optional). */
  adaptiveTierThresholds?: MalvAdaptiveTierThresholds | null;
}): { strategy: ExecutionStrategyResult; correction: MalvTierCorrectionTrace | null } {
  const { classified, strategy: initial, rawMessage, modeType, superFix } = args;
  const th = args.adaptiveTierThresholds;
  const upIntent = th?.upgradeIntentMax ?? 0.52;
  const upAmb = th?.upgradeAmbIntentMax ?? 0.62;
  const upComplex = th?.upgradeComplexIntentMax ?? 0.65;
  const downMin = th?.downgradeIntentMin ?? 0.82;
  if (superFix || modeType === "execute" || modeType === "operator_workflow") {
    return { strategy: initial, correction: null };
  }
  if (initial.mode === "require_clarification" || initial.mode === "phased") {
    return { strategy: initial, correction: null };
  }

  const tierBefore = resolveMalvCognitiveEffortTier({
    reflexLane: false,
    modeType,
    superFix,
    executionStrategyMode: initial.mode,
    internalPhaseCount: initial.internalPhases.length
  });

  const intentConf = deriveIntentConfidence(classified);
  const multi = detectMultiIntent(classified);
  const amb = detectSoftAmbiguitySignal(rawMessage, classified);

  const isCompanionLight = initial.mode === "single_step" && initial.internalPhases.length === 0;

  if (tierBefore === 1 && isCompanionLight) {
    const shouldUpgrade =
      intentConf < upIntent || multi || (amb && intentConf < upAmb) || (classified.complexity === "high" && intentConf < upComplex);
    if (shouldUpgrade && !messageLooksLikeKnowledgeOrCasualQuestion(rawMessage.trim())) {
      const next: ExecutionStrategyResult = {
        ...initial,
        mode: "single_step",
        internalPhases: [...STANDARD_ENGINEERING_LOOP],
        preferBeastWorker: classified.complexity !== "low" || classified.scopeSize !== "small",
        riskTier: initial.riskTier === "low" ? "medium" : initial.riskTier
      };
      return {
        strategy: next,
        correction: {
          fromTier: 1,
          toTier: 2,
          reason: multi
            ? "multi_intent_or_tight_scores"
            : amb
              ? "soft_ambiguity_signal"
              : intentConf < 0.52
                ? "low_intent_confidence"
                : "elevated_complexity_low_intent_confidence"
        }
      };
    }
  }

  if (tierBefore === 2 && initial.mode === "single_step" && initial.internalPhases.length > 0) {
    const m = rawMessage.trim();
    const simpleShape =
      intentConf > downMin &&
      classified.complexity === "low" &&
      classified.scopeSize === "small" &&
      maxIntentScore(classified) <= 1 &&
      m.length < 200 &&
      !CODING_CHANGE_RE.test(m) &&
      !EXECUTION_VERB_RE.test(m) &&
      !multi &&
      !amb;

    if (simpleShape && messageLooksLikeKnowledgeOrCasualQuestion(m)) {
      const next: ExecutionStrategyResult = {
        ...initial,
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low"
      };
      return {
        strategy: next,
        correction: {
          fromTier: 2,
          toTier: 1,
          reason: "simple_high_confidence_question_shape"
        }
      };
    }
  }

  return { strategy: initial, correction: null };
}

/**
 * Narrow clarification path — stricter than tier upgrade so we ask instead of guessing when interpretations diverge sharply.
 */
export function shouldTriggerSoftConfidenceClarification(
  classified: ClassifiedIntent,
  confidence: MalvTurnConfidence,
  rawMessage: string,
  softClarificationIntentMax?: number
): boolean {
  if (classified.ambiguity.isAmbiguous) return false;
  const m = rawMessage.trim();
  if (messageLooksLikeKnowledgeOrCasualQuestion(m)) return false;
  if (isBroadButAnswerableUserRequest(m) || isUserDelegatingTopicChoice(m)) return false;
  if (m.length > 360) return false;
  const multi = confidence.signals.multi_intent;
  if (!multi) return false;
  const gate = softClarificationIntentMax ?? 0.4;
  return confidence.intentConfidence < gate && (confidence.signals.ambiguity || AMBIGUITY_PHRASE_RE.test(m));
}

export function evaluateResponseConfidence(args: {
  reply: string;
  userMessage: string;
  cognitiveTier: MalvCognitiveEffortTier;
  internalPhaseCount: number;
}): number {
  const reply = args.reply.trim();
  const u = args.userMessage.trim();
  if (!reply) return 0.08;

  let score = 0.74;
  if (/\b(i think|might be|not sure|possibly|could be|unclear|i'?m not certain|probably|maybe)\b/i.test(reply)) {
    score -= 0.12;
  }
  if (reply.length < 22) score -= 0.35;
  else if (reply.length < 48) score -= 0.14;

  if (/^(ok\.?|sure\.?|yes\.?|no\.?|got it\.?|thanks\.?)$/i.test(reply)) score -= 0.28;

  if (u.length > 380 && reply.length < 130) score -= 0.18;
  if (args.cognitiveTier >= 2 && args.internalPhaseCount > 0 && u.length > 160 && reply.length < 90) score -= 0.16;

  if (/\b(todo\b|tbd\b|\.\.\.\s*$|more detail needed)\b/i.test(reply)) score -= 0.1;

  if (/^(i can help|i'?m here to help|as an ai|i don'?t have access)/i.test(reply) && reply.length < 140) score -= 0.12;

  return clamp01(score);
}

export type MalvIntentDriftHint = {
  kind: "possible_execution_intent" | "possible_shallow_answer_for_build" | "none";
  note: string;
};

export function detectIntentResponseShapeDrift(
  classified: ClassifiedIntent,
  reply: string,
  userMessage: string
): MalvIntentDriftHint {
  const u = userMessage.trim();
  const r = reply.trim();
  if (!r) return { kind: "none", note: "" };

  if (EXECUTION_VERB_RE.test(u) && !classified.ambiguity.isAmbiguous) {
    const hasSteps = /\b(step\s*\d|first,|then,|run this|execute|deploy)\b/i.test(r);
    if (!hasSteps && r.length < 200) {
      return {
        kind: "possible_execution_intent",
        note: "user_execution_verbs_shallow_reply"
      };
    }
  }

  if (
    (classified.primaryIntent === "full_product_build" || classified.primaryIntent === "feature_build") &&
    maxIntentScore(classified) >= 3 &&
    u.length > 120 &&
    r.length < 140 &&
    !r.includes("#")
  ) {
    return { kind: "possible_shallow_answer_for_build", note: "build_intent_short_reply" };
  }

  return { kind: "none", note: "" };
}

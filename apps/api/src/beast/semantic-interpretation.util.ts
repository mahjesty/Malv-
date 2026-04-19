import type { ClassifiedIntent, MalvIntentAmbiguity, MalvIntentKind } from "./intent-understanding.types";
import { messageLooksLikeKnowledgeOrCasualQuestion } from "./intent-understanding.service";
import {
  type BroadPromptExecutionPolicy,
  inferMalvUserPromptConstraintSignals,
  isUserDelegatingTopicChoice,
  resolveBroadPromptExecutionPolicy,
  shouldTreatClarificationReliefAsUnsafe
} from "./malv-broad-request-resolution.util";
import { deriveIntentConfidence } from "./malv-confidence-intelligence.util";
import type {
  MalvDelegationLevel,
  MalvSemanticIntentSurface,
  MalvSemanticInterpretation,
  MalvSemanticInterpretationInput,
  MalvSemanticRiskLevel
} from "./semantic-interpretation.types";

const INTENT_KINDS: MalvIntentKind[] = [
  "full_product_build",
  "feature_build",
  "bug_fix",
  "improvement_refactor",
  "frontend_design",
  "backend_logic",
  "system_upgrade"
];

function maxIntentScore(classified: ClassifiedIntent): number {
  return Math.max(...INTENT_KINDS.map((k) => classified.scores[k]));
}

function deriveSemanticRiskLevel(
  classified: ClassifiedIntent,
  normalizedMessage: string,
  broadAction: BroadPromptExecutionPolicy["action"]
): MalvSemanticRiskLevel {
  if (shouldTreatClarificationReliefAsUnsafe(normalizedMessage) || broadAction === "guarded") return "high";
  if (classified.complexity === "high") return "high";
  if (classified.complexity === "medium") return "medium";
  return "low";
}

function deriveIntentSurface(
  classified: ClassifiedIntent,
  normalizedMessage: string,
  broadPolicy: BroadPromptExecutionPolicy
): MalvSemanticIntentSurface {
  if (!normalizedMessage) return "low_signal_or_ambiguous";
  if (isUserDelegatingTopicChoice(normalizedMessage)) return "delegated_topic_choice";
  if (messageLooksLikeKnowledgeOrCasualQuestion(normalizedMessage)) {
    const peak = maxIntentScore(classified);
    if (peak <= 2 && normalizedMessage.length < 480) return "knowledge_or_casual_qa";
  }
  if (broadPolicy.action === "proceed") return "open_broad_or_explore";
  if (classified.ambiguity.isAmbiguous) return "low_signal_or_ambiguous";
  return "software_engineering";
}

function deriveDelegationLevel(normalizedMessage: string): MalvDelegationLevel {
  return isUserDelegatingTopicChoice(normalizedMessage) ? "topic_choice" : "none";
}

function deriveExecutionAmbiguity(classified: ClassifiedIntent, broadPolicy: BroadPromptExecutionPolicy): MalvIntentAmbiguity {
  if (classified.ambiguity.isAmbiguous && broadPolicy.action === "proceed") {
    return { isAmbiguous: false, reason: undefined };
  }
  return { ...classified.ambiguity };
}

/**
 * Deterministic aggregation of existing classifiers and broad/delegation policy — no LLM, no RNG.
 * Call after context assembly when prior turns matter for broad resolution.
 */
export function aggregateMalvSemanticInterpretation(args: MalvSemanticInterpretationInput): MalvSemanticInterpretation {
  const normalizedUserMessage = args.userMessage.replace(/\s+/g, " ").trim();
  const classified = args.classified;

  const broadPromptPolicy = resolveBroadPromptExecutionPolicy({
    userMessage: normalizedUserMessage,
    context: args.broadRequestContext,
    userReplyFollowsAssistantClarification: args.userReplyFollowsAssistantClarification
  });

  const forExecution = deriveExecutionAmbiguity(classified, broadPromptPolicy);
  const classifiedForConfidence: ClassifiedIntent = { ...classified, ambiguity: forExecution };

  const reason = classified.ambiguity.reason;
  const missingTopic =
    classified.ambiguity.isAmbiguous &&
    (reason === "message_too_vague" || reason === "short_low_signal" || reason === "intent_tie");

  const isBlocking =
    (classified.ambiguity.isAmbiguous && broadPromptPolicy.action !== "proceed") || broadPromptPolicy.action === "guarded";

  const constraints = inferMalvUserPromptConstraintSignals(normalizedUserMessage);

  return {
    normalizedUserMessage,
    intentSurface: deriveIntentSurface(classified, normalizedUserMessage, broadPromptPolicy),
    delegationLevel: deriveDelegationLevel(normalizedUserMessage),
    ambiguity: {
      fromClassifier: { ...classified.ambiguity },
      forExecution,
      isBlocking,
      missingTopic
    },
    constraints,
    riskLevel: deriveSemanticRiskLevel(classified, normalizedUserMessage, broadPromptPolicy.action),
    confidence: deriveIntentConfidence(classifiedForConfidence),
    broadPromptPolicy,
    signals: {
      clarificationReliefCandidate: classified.ambiguity.isAmbiguous && broadPromptPolicy.action === "proceed",
      highRiskOrDestructiveHeuristic: shouldTreatClarificationReliefAsUnsafe(normalizedUserMessage)
    }
  };
}

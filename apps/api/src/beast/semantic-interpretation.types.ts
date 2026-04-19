import type { ClassifiedIntent, MalvIntentAmbiguity } from "./intent-understanding.types";
import type { BroadPromptExecutionPolicy, MalvBroadRequestContext } from "./malv-broad-request-resolution.util";

/** High-level surface intent — derived only from existing classifiers and broad/delegation helpers. */
export type MalvSemanticIntentSurface =
  | "software_engineering"
  | "knowledge_or_casual_qa"
  | "open_broad_or_explore"
  | "delegated_topic_choice"
  | "low_signal_or_ambiguous";

export type MalvDelegationLevel = "none" | "topic_choice";

export type MalvSemanticRiskLevel = "low" | "medium" | "high";

export type MalvSemanticInterpretation = {
  /** Normalized user text (trimmed, collapsed whitespace). */
  normalizedUserMessage: string;
  intentSurface: MalvSemanticIntentSurface;
  delegationLevel: MalvDelegationLevel;
  ambiguity: {
    fromClassifier: MalvIntentAmbiguity;
    /** Ambiguity after broad / clarification-relief policy is applied (single execution-facing view). */
    forExecution: MalvIntentAmbiguity;
    isBlocking: boolean;
    missingTopic: boolean;
  };
  constraints: {
    wantsStepByStep: boolean;
    wantsDepth: boolean;
  };
  riskLevel: MalvSemanticRiskLevel;
  /** 0–1 — reuses {@link deriveIntentConfidence} with execution-facing ambiguity. */
  confidence: number;
  broadPromptPolicy: BroadPromptExecutionPolicy;
  signals: {
    clarificationReliefCandidate: boolean;
    highRiskOrDestructiveHeuristic: boolean;
  };
};

export type MalvSemanticInterpretationInput = {
  userMessage: string;
  classified: ClassifiedIntent;
  broadRequestContext?: MalvBroadRequestContext;
  userReplyFollowsAssistantClarification?: boolean;
};

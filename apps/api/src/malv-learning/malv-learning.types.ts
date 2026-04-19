export type MalvLearningSignalEventType =
  | "low_confidence"
  | "tier_upgrade"
  | "tier_downgrade"
  | "refinement"
  | "intent_drift"
  | "user_correction"
  | "user_reask"
  | "clarification_loop"
  | "execution_mismatch";

export type MalvLearningSignalContext = {
  tier: number;
  intentType: string;
  messageLength: number;
  ambiguity: boolean;
  memoryUsed: boolean;
  modelUsed: string | null;
  /** Optional short codes for pattern memory (no PII). */
  patternHints?: string[];
};

export type MalvLearningQueuedSignal = {
  eventType: MalvLearningSignalEventType;
  userId: string | null;
  /** Persisted as JSON — includes ISO timestamp. */
  context: MalvLearningSignalContext & { timestamp: string };
};

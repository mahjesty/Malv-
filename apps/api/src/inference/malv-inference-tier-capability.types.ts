/**
 * Deployment-described inference tier capabilities (CPU sidecar vs GPU/primary chain).
 * Numeric ordering is explicit so stronger hardware only needs env/config updates — not code changes.
 */

export type MalvInferenceCapabilityClass = "edge" | "standard" | "enhanced" | "frontier";

/** Upper bound of reasoning depth a tier is configured to handle reliably. */
export type MalvReasoningDepthClass = "interactive" | "standard" | "deep" | "frontier";

/**
 * How latency-sensitive a tier is optimized to be (lower index = more latency-sensitive deployment).
 */
export type MalvLatencyProfileClass = "strict_interactive" | "interactive" | "balanced" | "throughput";

export type MalvStructuredOutputReliabilityClass = "best_effort" | "medium" | "high";

export type MalvTierRuntimeCapabilitySnapshot = {
  tier: "cpu" | "gpu";
  capabilityClass: MalvInferenceCapabilityClass;
  maxPromptChars: number;
  maxContextChars: number;
  reasoningDepthMax: MalvReasoningDepthClass;
  latencyProfile: MalvLatencyProfileClass;
  structuredOutputReliability: MalvStructuredOutputReliabilityClass;
  multimodalSupported: boolean;
  /** 0 = unspecified / do not gate routing on concurrency. */
  maxConcurrentInfer: number;
};

/**
 * Declarative work demand for a turn or plan — compared against {@link MalvTierRuntimeCapabilitySnapshot}.
 */
export type MalvTaskCapabilityDemand = {
  minimumCapabilityClass: MalvInferenceCapabilityClass;
  reasoningDepthRequired: MalvReasoningDepthClass;
  requiresMultimodal: boolean;
  requiresStructuredOutput: boolean;
  promptChars: number;
  contextChars: number;
  /**
   * Most responsive latency profile this work can tolerate (tier must be at least this responsive).
   * Example: voice continuity sets `strict_interactive`.
   */
  minimumResponsiveness: MalvLatencyProfileClass;
  /**
   * Parallel inference slots this turn is expected to need (>=1). When the tier sets
   * {@link MalvTierRuntimeCapabilitySnapshot.maxConcurrentInfer} > 0, demand must fit that budget.
   */
  concurrentInferSlotsRequired: number;
};

export const MALV_INFERENCE_CAPABILITY_CLASS_ORDER: Record<MalvInferenceCapabilityClass, number> = {
  edge: 0,
  standard: 1,
  enhanced: 2,
  frontier: 3
};

export const MALV_REASONING_DEPTH_ORDER: Record<MalvReasoningDepthClass, number> = {
  interactive: 0,
  standard: 1,
  deep: 2,
  frontier: 3
};

export const MALV_LATENCY_PROFILE_ORDER: Record<MalvLatencyProfileClass, number> = {
  strict_interactive: 0,
  interactive: 1,
  balanced: 2,
  throughput: 3
};

export const MALV_STRUCTURED_OUTPUT_ORDER: Record<MalvStructuredOutputReliabilityClass, number> = {
  best_effort: 0,
  medium: 1,
  high: 2
};

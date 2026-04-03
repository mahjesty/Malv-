/**
 * Config gates for staged model integration. Heuristic pipelines remain authoritative until
 * {@link MalvModelAssistGateService.modelAssistLive} is enabled and providers return data.
 */
export type MalvModelAssistMode = "off" | "heuristic_only" | "assist_low_cost" | "assist_full";

/** Intelligence stages that may later receive model assistance (stable names for logs + persistence). */
export type MalvIntelligencePhase =
  | "codebase_audit"
  | "change_planning"
  | "bug_detection_reasoning"
  | "fix_planning"
  | "design_strategy"
  | "design_critique"
  | "rendered_ui_critique"
  | "patch_review_synthesis";

export const MALV_INTELLIGENCE_ARTIFACT_VERSION = 1 as const;

/**
 * Persisted alongside heuristic rows so future model runs can be diffed without replacing stored payloads.
 * Full heuristic bodies stay in existing columns (e.g. repo_intelligence_json); this is a compact envelope.
 */
export type MalvIntelligenceArtifactV1 = {
  v: typeof MALV_INTELLIGENCE_ARTIFACT_VERSION;
  phase: MalvIntelligencePhase;
  assistMode: MalvModelAssistMode;
  /** What produced the active outcome today. */
  selectedProducer: "heuristic" | "model" | "merged";
  /** Capabilities attempted (model path may be false when live flag off). */
  producersAttempted: { heuristic: boolean; model: boolean };
  capturedAt: string;
  /** Comparable metrics / fingerprints; optional inline payload only when small. */
  metrics: Record<string, unknown>;
};

/** Group attached to audit `repo_intelligence_json` and similar. */
export type MalvModelReadinessBundle = {
  assistMode: MalvModelAssistMode;
  modelAssistLive: boolean;
  artifacts: Partial<Record<MalvIntelligencePhase, MalvIntelligenceArtifactV1>>;
};

/**
 * Deterministic intent taxonomy for autonomous orchestration (no LLM classification).
 */

export type MalvIntentKind =
  | "full_product_build"
  | "feature_build"
  | "bug_fix"
  | "improvement_refactor"
  | "frontend_design"
  | "backend_logic"
  | "system_upgrade";

export type MalvScopeSize = "small" | "medium" | "large";

export type MalvComplexity = "low" | "medium" | "high";

export type MalvDomain = "frontend" | "backend" | "infra" | "ux";

export type MalvIntentAmbiguity = {
  isAmbiguous: boolean;
  reason?: string;
};

export type ClassifiedIntent = {
  primaryIntent: MalvIntentKind;
  /** Raw scores for auditability (deterministic). */
  scores: Record<MalvIntentKind, number>;
  scopeSize: MalvScopeSize;
  complexity: MalvComplexity;
  domains: MalvDomain[];
  ambiguity: MalvIntentAmbiguity;
};

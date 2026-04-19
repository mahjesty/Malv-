import type { ClassifiedIntent } from "./intent-understanding.types";
import type { ExecutionStrategyResult } from "./execution-strategy.service";

/**
 * Audit placeholders for Tier-0 reflex turns — deterministic templates skip full intent/strategy passes,
 * but persistence/meta still carry a neutral shape so downstream analytics stay schema-stable.
 */
export const MALV_REFLEX_CLASSIFIED_INTENT_PLACEHOLDER: ClassifiedIntent = {
  primaryIntent: "improvement_refactor",
  scores: {
    full_product_build: 0,
    feature_build: 0,
    bug_fix: 0,
    improvement_refactor: 0,
    frontend_design: 0,
    backend_logic: 0,
    system_upgrade: 0
  },
  scopeSize: "small",
  complexity: "low",
  domains: [],
  ambiguity: { isAmbiguous: false }
};

export const MALV_REFLEX_EXECUTION_STRATEGY_PLACEHOLDER: ExecutionStrategyResult = {
  mode: "single_step",
  internalPhases: [],
  preferBeastWorker: false,
  riskTier: "low"
};

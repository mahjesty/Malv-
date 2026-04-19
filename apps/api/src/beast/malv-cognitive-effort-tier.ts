import type { ModeType } from "./mode-router";

/**
 * Explicit cognitive budget for chat turns — drives conditional routing, memory, prompts, and meta layers.
 * Tier 0: deterministic reflex / template (no model, no heavy assembly).
 * Tier 1: normal chat — single-step inference, proportional context.
 * Tier 2: deliberate / phased reasoning — full orchestration scaffolding.
 * Tier 3: execution / operator / super-fix — safety-preserving heavy path.
 */
export type MalvCognitiveEffortTier = 0 | 1 | 2 | 3;

export function resolveMalvCognitiveEffortTier(args: {
  reflexLane: boolean;
  modeType: ModeType;
  superFix: boolean;
  executionStrategyMode: string;
  internalPhaseCount: number;
}): MalvCognitiveEffortTier {
  if (args.reflexLane) return 0;
  if (args.superFix || args.modeType === "execute" || args.modeType === "operator_workflow") return 3;
  if (args.executionStrategyMode === "phased" || args.internalPhaseCount > 0) return 2;
  if (args.executionStrategyMode === "require_clarification") return 2;
  return 1;
}

/** When true, meta-intelligence router hooks are optional and safe to omit (same policy mapping still applies). */
export function shouldSkipMetaIntelligenceRouter(args: {
  cognitiveTier: MalvCognitiveEffortTier;
  superFix: boolean;
  vaultSessionId: string | null | undefined;
  operatorPhase: string | null | undefined;
  modeType: ModeType;
  inputMode: "text" | "voice" | "video" | undefined;
}): boolean {
  if (args.cognitiveTier >= 2) return false;
  if (args.superFix) return false;
  if (args.vaultSessionId) return false;
  if (args.operatorPhase && String(args.operatorPhase).trim()) return false;
  if (args.modeType === "execute" || args.modeType === "operator_workflow") return false;
  if (args.inputMode && args.inputMode !== "text") return false;
  return true;
}

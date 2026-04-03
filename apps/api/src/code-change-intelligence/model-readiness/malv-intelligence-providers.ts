import type {
  CodebaseAuditContractInput,
  CodebaseAuditContractOutput,
  BugDetectionContractInput,
  BugDetectionContractOutput,
  FixPlanningContractInput,
  FixPlanningContractOutput,
  DesignCritiqueContractInput,
  DesignCritiqueContractOutput,
  PatchReviewSynthesisContractInput,
  PatchReviewSynthesisContractOutput,
  ChangePlanningContractInput,
  ChangePlanningContractOutput,
  DesignStrategyContractInput,
  DesignStrategyContractOutput,
  RenderedUiCritiqueContractInput,
  RenderedUiCritiqueContractOutput
} from "./malv-intelligence-contracts";

export const MALV_REASONING_PROVIDER = Symbol("MALV_REASONING_PROVIDER");
export const MALV_PLANNING_PROVIDER = Symbol("MALV_PLANNING_PROVIDER");
export const MALV_VISION_CRITIQUE_PROVIDER = Symbol("MALV_VISION_CRITIQUE_PROVIDER");

/**
 * Text/JSON reasoning hooks: audit, bugs, fixes, code-pattern critique, patch synthesis.
 * Implementations return `null` to keep heuristic output (default noop behavior).
 */
export interface MalvReasoningProvider {
  readonly providerId: string;
  augmentCodebaseAudit(
    input: CodebaseAuditContractInput,
    heuristic: CodebaseAuditContractOutput
  ): Promise<CodebaseAuditContractOutput | null>;
  augmentBugDetection(
    input: BugDetectionContractInput,
    heuristic: BugDetectionContractOutput
  ): Promise<BugDetectionContractOutput | null>;
  augmentFixPlanning(
    input: FixPlanningContractInput,
    heuristic: FixPlanningContractOutput
  ): Promise<FixPlanningContractOutput | null>;
  augmentDesignCritique(
    input: DesignCritiqueContractInput,
    heuristic: DesignCritiqueContractOutput
  ): Promise<DesignCritiqueContractOutput | null>;
  augmentPatchReviewSynthesis(
    input: PatchReviewSynthesisContractInput,
    heuristic: PatchReviewSynthesisContractOutput
  ): Promise<PatchReviewSynthesisContractOutput | null>;
}

/** Implementation plan + design strategy; separate from vision. */
export interface MalvPlanningProvider {
  readonly providerId: string;
  augmentChangePlan(
    input: ChangePlanningContractInput,
    heuristic: ChangePlanningContractOutput
  ): Promise<ChangePlanningContractOutput | null>;
  augmentDesignStrategy(
    input: DesignStrategyContractInput,
    heuristic: DesignStrategyContractOutput
  ): Promise<DesignStrategyContractOutput | null>;
}

/** Multimodal / screenshot critique augmentation. */
export interface MalvVisionCritiqueProvider {
  readonly providerId: string;
  augmentRenderedUiCritique(
    input: RenderedUiCritiqueContractInput,
    heuristic: RenderedUiCritiqueContractOutput
  ): Promise<RenderedUiCritiqueContractOutput | null>;
}

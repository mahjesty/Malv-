/**
 * Stable input/output contracts for future model-assisted flows.
 * These are type aliases over existing domain types — workflows should depend on these names
 * when adding model branches so call sites stay stable.
 */
import type {
  ChangeAuditResult,
  ChangePatchReviewResult,
  ChangePlanResult,
  DesignBrainPlan,
  VisualStrategyPlan
} from "../change-intelligence.types";
import type { BugDetectionResult, FixPlanningResult, PerformanceIntelResult } from "../malv-intelligence.types";
import type { FrontendDesignCritiqueResult } from "../frontend-design-critique.service";
import type { UiVisualCritiqueResult } from "../ui-visual-critique.service";
import type { RenderedCaptureArtifact } from "../rendered-ui-review.service";
import type { ReviewedStateRecord } from "../ui-state-capture-plan";

/** --- Codebase audit --- */
export type CodebaseAuditContractInput = {
  requestedGoal: string;
  hints?: string[];
};
export type CodebaseAuditContractOutput = ChangeAuditResult;

/** --- Change planning (implementation plan + verification preview) --- */
export type ChangePlanningContractInput = {
  requestedGoal: string;
  audit: ChangeAuditResult;
};
export type ChangePlanningContractOutput = ChangePlanResult;

/** --- Design strategy (visual direction embedded in plan) --- */
export type DesignStrategyContractInput = {
  requestedGoal: string;
  audit: ChangeAuditResult;
  planSummaryHint?: string;
};
export type DesignStrategyContractOutput = {
  visualStrategy: VisualStrategyPlan | null;
  designBrain: DesignBrainPlan | null;
};

/** --- Bug detection reasoning --- */
export type BugDetectionContractInput = {
  repoRoot: string;
  scopeFiles: string[];
};
export type BugDetectionContractOutput = BugDetectionResult;

/** --- Fix planning --- */
export type FixPlanningContractInput = {
  bugs: BugDetectionResult;
  perf: PerformanceIntelResult;
};
export type FixPlanningContractOutput = FixPlanningResult;

/** --- Design critique (code-pattern / TSX heuristics) --- */
export type DesignCritiqueContractInput = {
  repoRoot: string;
  touchedRelPaths: string[];
};
export type DesignCritiqueContractOutput = FrontendDesignCritiqueResult;

/** --- Rendered UI critique (multimodal) --- */
export type RenderedUiCritiqueContractInput = {
  artifactCount: number;
  stateCoverageSummary: string | null;
  touchedSourcePaths: string[];
  /** When set, live vision path runs via {@link UiVisualCritiqueService}. */
  captureArtifacts?: RenderedCaptureArtifact[];
  reviewedStates?: ReviewedStateRecord[];
  uxScenarioSimulationSummary?: string | null;
};
export type RenderedUiCritiqueContractOutput = UiVisualCritiqueResult;

/** --- Patch review synthesis (aggregate review) --- */
export type PatchReviewSynthesisContractInput = {
  filesChanged: string[];
  patchSummary: string;
  audit: ChangeAuditResult | null;
  plan: ChangePlanResult | null;
};
export type PatchReviewSynthesisContractOutput = ChangePatchReviewResult;

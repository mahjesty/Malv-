import type { ChangeTrustLevel } from "../db/entities/change-request.entity";
import type { DependencyGraphAuditPayload } from "./code-graph.types";
import type { FrontendDesignAuditResult } from "./frontend-design-audit.service";
import type { FrontendDesignCritiqueDimensions } from "./frontend-design-critique.service";
import type { DesignSystemProfile } from "./design-system-profile.types";
import type { DesignTasteEvaluation } from "./design-taste-engine";
import type { VisualCompositionBlueprint } from "./visual-composition.types";
import type { MotionDesignPlan } from "./motion-design.types";
import type { BugDetectionResult, FixPlanningResult, PerformanceIntelResult } from "./malv-intelligence.types";

export type ImpactedAreas = {
  frontend: boolean;
  backend: boolean;
  dtoSchema: boolean;
  authPermissions: boolean;
  realtimeEvents: boolean;
  tests: boolean;
  dbMigrations: boolean;
  configEnv: boolean;
};

/** Structured impact analysis derived from the repo graph (baseline). */
export type ImpactAnalysis = {
  summary: string;
  mayBreakIfChanged: string[];
  dependentModules: string[];
  regressionTesting: string[];
};

/** Richer impact intelligence for peak mode. */
export type ImpactIntelligence = ImpactAnalysis & {
  directlyTouchedFiles: string[];
  dependentFiles: string[];
  contractsAtRisk: string[];
  testsRecommended: string[];
  userFacingFlowsLikely: string[];
  authRealtimeSecurityIntersections: string[];
  migrationsConfigEnvSurfaces: string[];
};

export type RepoPatternHints = {
  duplicateLogicHints: string[];
  similarPatterns: string[];
  saferExtensionPoints: string[];
};

export type ExtensionIntelligence = {
  idealPlugInPoints: string[];
  similarPatterns: string[];
  duplicationWarnings: string[];
  saferExtensionPoints: string[];
  riskyPatchPoints: string[];
  layerHints: {
    primary: string;
    alternates: string[];
    rationale: string;
  };
};

export type ChangeScopeClassification = {
  minimalLocalized: boolean;
  crossModule: boolean;
  contractChanging: boolean;
  dataModelChanging: boolean;
  securitySensitive: boolean;
  uxSensitive: boolean;
  performanceSensitive: boolean;
  rationale: string[];
};

export type ChangeAuditResult = {
  summary: string;
  impactedAreas: ImpactedAreas;
  relatedFiles: string[];
  impactedFiles: string[];
  upstreamDependencies: string[];
  downstreamEffects: string[];
  dependencyGraph: DependencyGraphAuditPayload;
  impactAnalysis: ImpactAnalysis;
  impactIntelligence: ImpactIntelligence;
  repoPatterns: RepoPatternHints;
  extensionIntelligence: ExtensionIntelligence;
  scopeClassification: ChangeScopeClassification;
  architectureNotes: string;
  riskNotes: string;
  securityNotes: string;
  /** Heuristic static analysis (MALV intelligence expansion). */
  bugDetection?: BugDetectionResult | null;
  performanceIntel?: PerformanceIntelResult | null;
  fixPlan?: FixPlanningResult | null;
};

export type ChangePlanStrategy =
  | "extend_existing_pattern"
  | "refactor_and_extend"
  | "new_module"
  | "localized_patch"
  | "phased_split"
  | "approval_first_risky";

export type VisualStrategyPlan = {
  visualDirection: string;
  /** Pre-implementation layout intent (legacy alias; prefer layoutStrategy). */
  layoutIntent: string;
  /** Layout blueprint: structure, flow, mobile-first rules. */
  layoutStrategy: string;
  hierarchyPlan: string;
  componentStrategy: string;
  interactionNotes: string;
  /** Interaction model: focus, hover, primary CTA behavior. */
  interactionStrategy: string;
  animationPlan: string;
  /** Full motion plan: entrance, hover, loading, reduced-motion. */
  animationStrategy: string;
  responsivePlan: string;
  themeModeConsiderations: string;
  accessibilityNotes: string;
  animationPerformanceNotes: string;
};

export type DesignBrainPlan = {
  designSystemProfile: DesignSystemProfile;
  taste: DesignTasteEvaluation;
  composition: VisualCompositionBlueprint;
  motion: MotionDesignPlan;
};

export type ChangePlanResult = {
  planSummary: string;
  implementationStrategy: string;
  strategy: ChangePlanStrategy;
  strategyRationale: string;
  touchedLayers: string[];
  extensionPointsExplicit: string[];
  contractChanges: string[];
  performanceConsiderations: string;
  securityConsiderations: string;
  designConsiderations: string | null;
  riskSummary: string;
  confidenceRationale: string;
  verificationPreview: VerificationPlan;
  visualStrategy: VisualStrategyPlan | null;
  /** Design Brain V2: profile, taste, composition, motion — required path for frontend work. */
  designBrain: DesignBrainPlan | null;
  frontendDesignAudit: FrontendDesignAuditResult | null;
  filesToModify: string[];
  filesToCreate: string[];
  migrationsRequired: boolean;
  testPlan: string;
  rollbackNotes: string;
  approvalRequired: boolean;
  trustLevel: ChangeTrustLevel;
  scopeComplexity: "low" | "medium" | "high" | "critical";
};

export type VerificationPlan = {
  whatToVerify: string[];
  likelyBreakage: string[];
  mostRelevantTests: string[];
  cannotProveAutomatically: string[];
};

/** Truthful outcome per check; legacy `performed` on each row means status === "passed". */
export type VerificationCheckStatus = "passed" | "failed" | "not_run" | "skipped";

export type PlanExecutionAlignment = "unknown" | "none" | "partial" | "full";

/** Result of comparing filesChanged to plan.filesToModify / filesToCreate. */
export type PlanExecutionCoherence = {
  alignment: PlanExecutionAlignment;
  plannedTargets: string[];
  filesChangedNormalized: string[];
  overlapMatches: string[];
  unmatchedPlanned: string[];
  unmatchedSubmitted: string[];
  warnings: string[];
  codes: string[];
};

/** Evidence from optional post-implementation workspace validation (sandbox operator path). */
export type CciWorkspaceValidationEvidenceEntry = {
  status: VerificationCheckStatus;
  command: string;
  exitCode: number | null;
  summary: string;
  notes?: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
};

export type CciWorkspaceValidationEvidence = {
  typecheck?: CciWorkspaceValidationEvidenceEntry;
  lint?: CciWorkspaceValidationEvidenceEntry;
  tests?: CciWorkspaceValidationEvidenceEntry;
  /** Present when validation was skipped entirely (e.g. no workspace). */
  skippedReason?: string;
};

export type ChangeVerificationResult = {
  verificationSummary: string;
  verificationPlan: VerificationPlan;
  testsRun: Array<Record<string, unknown>>;
  checksPerformed: Array<Record<string, unknown>>;
  provenSafeAreas: string;
  unprovenAreas: string;
  regressionNotes: string;
  confidenceLevel: "low" | "medium" | "high";
  engineeringConfidence: "low" | "medium" | "high";
  designConfidence: "low" | "medium" | "high" | "n/a";
  scopeComplexity: "low" | "medium" | "high" | "critical";
  /**
   * Machine-oriented flags for gaps where no automated tool proved correctness
   * (typecheck, lint, contract diff, DB migration validation, etc.).
   */
  validationGaps?: string[];
  planExecutionCoherence?: PlanExecutionCoherence | null;
  /** When CCI workspace validation ran or was attempted; included in stored quality / final JSON. */
  postImplementationWorkspaceValidation?: CciWorkspaceValidationEvidence | null;
};

export type RenderedCritiqueIssue = {
  code: string;
  severity: "low" | "medium" | "high";
  note: string;
};

/** UX / product issues from rendered review (vision); separate from pure visual design issues. */
export type UsabilityCritiqueIssue = {
  code: string;
  severity: "low" | "medium" | "high";
  note: string;
};

export type ReviewedUiStateRecord = {
  uiState: string;
  routePath: string;
  viewport: string;
  colorScheme: string;
  captured: boolean;
  skipReason?: string;
};

export type ChangePatchReviewResult = {
  reviewSummary: string;
  issuesFound: Array<Record<string, unknown>>;
  issuesFixed: Array<Record<string, unknown>>;
  residualRisks: string;
  residualEngineeringRisks: string;
  residualDesignRisks: string;
  /** Code-pattern / TSX heuristic 0–100; null when no apps/web files in change. */
  designQualityScore: number | null;
  designCritiqueSummary: string | null;
  improvementSuggestions: string[];
  designCritiqueDimensions: FrontendDesignCritiqueDimensions | null;
  /** From multimodal analysis of preview screenshots; null when unavailable or unproven. */
  visualQualityScore: number | null;
  renderedReviewAvailable: boolean;
  renderedCritiqueSummary: string | null;
  renderedReviewSkipReason: string | null;
  renderedCritiqueIssues: RenderedCritiqueIssue[];
  renderedCritiqueSuggestions: string[];
  /** State-aware capture audit trail. */
  reviewedStates: ReviewedUiStateRecord[];
  /** Honest summary of which UI states were proven vs default-only. */
  stateCoverageSummary: string | null;
  /** Cross-state risks (vision + synthetic unproven targets). */
  stateAwareDesignRisks: string | null;
  /** Preview capture diagnostics (paths, timing); omit from user-facing summaries. */
  renderedUiCaptureMeta?: Record<string, unknown> | null;
  /** After applying code-pattern + rendered (when proven) critique rules. */
  adjustedDesignConfidence: "low" | "medium" | "high" | "n/a";
  /** How captures map to first-time / returning / error journeys; honest when capture skipped. */
  uxScenarioSimulationSummary: string | null;
  /** Usability + flow score from vision when returned; null if omitted or critique unavailable. */
  uxQualityScore: number | null;
  userExperienceSummary: string | null;
  frictionAnalysis: string | null;
  usabilityIssues: UsabilityCritiqueIssue[];
  frictionPoints: string[];
  /**
   * Which intelligence phases contributed model or merged output during patch review
   * (design critique augmentation, rendered vision, etc.).
   */
  malvPatchReviewPhaseProducers?: Partial<
    Record<"design_critique" | "rendered_ui_critique", "heuristic" | "model" | "merged">
  >;
};

export type ChangeIntelligenceFinalResult = {
  requestSummary: { id: string; title: string; goal: string };
  architectureAuditSummary: string;
  impactSummary: string;
  implementationPlanSummary: string;
  visualDesignSummary: string | null;
  /** Frontend output: direction + strategies (from planning / design brain). */
  visualDirection?: string | null;
  layoutStrategy?: string | null;
  interactionStrategy?: string | null;
  animationStrategy?: string | null;
  filesChanged: string[];
  whatWasVerified: string;
  whatWasNotFullyProven: string;
  engineeringConfidence: "low" | "medium" | "high";
  designConfidence: "low" | "medium" | "high" | "n/a";
  /** Present when patch review ran critique; may supersede designConfidence from verification when critique downgrades. */
  /** 0–100 from structured code-pattern UI critique after implementation. */
  designQualityScore?: number | null;
  designCritiqueSummary?: string | null;
  improvementSuggestions?: string[];
  /** 0–100 from rendered screenshot critique when vision succeeded; otherwise omitted/null. */
  visualQualityScore?: number | null;
  renderedReviewAvailable?: boolean;
  renderedCritiqueSummary?: string | null;
  reviewedStates?: ReviewedUiStateRecord[];
  stateCoverageSummary?: string | null;
  stateAwareDesignRisks?: string | null;
  uxScenarioSimulationSummary?: string | null;
  uxQualityScore?: number | null;
  userExperienceSummary?: string | null;
  frictionAnalysis?: string | null;
  usabilityIssues?: UsabilityCritiqueIssue[];
  frictionPoints?: string[];
  scopeComplexity: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean;
  residualRisks: string;
  implementationPathRationale: string | null;
  designFitRationale: string | null;
  /** Latest pipeline snapshot from patch-review stage (audit/plan carry their own rows). */
  malvModelReadiness?: Record<string, unknown> | null;
  autoDebugAttempted?: boolean;
  autoDebugAttempts?: number;
  autoDebugOutcome?: "passed" | "failed" | "skipped" | "not_eligible" | "max_attempts_reached";
  autoDebugFailuresSeen?: string[];
  autoDebugSummary?: string;
  autoDebugEnhanced?: {
    attempts: number;
    failureHistory: unknown[];
    improvementHistory: unknown[];
    strategiesUsed: unknown[];
    finalOutcome: string;
    stoppedReason: string;
  };
};

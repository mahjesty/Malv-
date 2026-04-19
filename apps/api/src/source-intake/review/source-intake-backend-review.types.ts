/** Persisted under `auditJson.modelReview` and mirrored in API normalization. */

export const SOURCE_INTAKE_BACKEND_REVIEW_VERSION = 1 as const;

export type SourceIntakeReviewMode = "static_policy_only" | "model_assisted";

export type BackendSourceReviewDecision = "approved" | "approved_with_warnings" | "declined";

export type BackendReviewRiskSeverity = "low" | "medium" | "high";

export type BackendSourceReviewRisk = {
  severity: BackendReviewRiskSeverity;
  category: string;
  title: string;
  evidence?: string;
  path?: string;
  line?: number;
  implication?: string;
  recommendation?: string;
};

export type BackendSourceReviewResult = {
  version: typeof SOURCE_INTAKE_BACKEND_REVIEW_VERSION;
  reviewMode: SourceIntakeReviewMode;
  summary?: string;
  capabilitiesDetected?: string[];
  risks?: BackendSourceReviewRisk[];
  limitations?: string[];
  confidence?: "low" | "medium" | "high";
  decision: BackendSourceReviewDecision;
  previewAllowed: boolean;
  publishAllowed: boolean;
  rationale: string;
};

/** Compact policy snapshot stored alongside full `modelReview` for stable reads. */
export type SourceIntakeReviewPolicySnapshot = {
  version: typeof SOURCE_INTAKE_BACKEND_REVIEW_VERSION;
  reviewMode: SourceIntakeReviewMode;
  decision: BackendSourceReviewDecision | "pending";
  rationale: string;
  previewAllowed: boolean;
  publishAllowed: boolean;
  pipelineReadError: boolean;
  publishWithWarningsAllowed: boolean;
};

export type NormalizedSourceIntakeReviewV1 = {
  version: typeof SOURCE_INTAKE_BACKEND_REVIEW_VERSION;
  reviewMode: SourceIntakeReviewMode;
  decision: BackendSourceReviewDecision | "pending";
  rationale: string;
  previewAllowed: boolean;
  publishAllowed: boolean;
  pipelineReadError: boolean;
  limitations: string[];
  modelReview: BackendSourceReviewResult | null;
  reviewPolicy: SourceIntakeReviewPolicySnapshot;
};

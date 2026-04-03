/** Bug / static analysis signals (heuristic, not a full typechecker). */
export type BugCategory =
  | "type_inconsistency"
  | "unsafe_pattern"
  | "duplicated_logic"
  | "dead_code"
  | "risky_async";

export type BugSeverity = "low" | "medium" | "high";

export type BugIssue = {
  id: string;
  category: BugCategory;
  severity: BugSeverity;
  file: string;
  lineHint?: number;
  message: string;
  evidence?: string;
};

export type BugDetectionResult = {
  scannedFiles: number;
  issues: BugIssue[];
  summary: string;
};

export type PerformanceIssueKind =
  | "sequential_await_in_loop"
  | "heavy_sync_in_render"
  | "missing_memoization_hint"
  | "inefficient_loop"
  | "suspicious_query_pattern";

export type PerformanceIssue = {
  id: string;
  kind: PerformanceIssueKind;
  severity: BugSeverity;
  file: string;
  message: string;
  suggestion: string;
};

export type PerformanceIntelResult = {
  scannedFiles: number;
  issues: PerformanceIssue[];
  summary: string;
};

export type FixRisk = "low" | "medium" | "high";

export type FixConfidence = "low" | "medium" | "high";

export type FixPlanItem = {
  issueId: string;
  source: "bug" | "performance";
  impactSummary: string;
  proposedFix: string;
  risk: FixRisk;
  confidence: FixConfidence;
};

export type FixPlanningResult = {
  items: FixPlanItem[];
  pipelinePolicy: string;
  summary: string;
};

/** Stored learning outcomes for self-improvement over time. */
export type LearningOutcome = "success" | "failed" | "partial" | "unknown";

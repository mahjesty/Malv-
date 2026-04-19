import type { SourceIntakeAuditDecision } from "../../db/entities/source-intake-session.entity";
import type { IntakeAuditFinding, IntakeTerminalDecision } from "../source-intake-static-audit.util";
import { SOURCE_INTAKE_BACKEND_REVIEW_VERSION, type BackendSourceReviewResult, type SourceIntakeReviewPolicySnapshot } from "./source-intake-backend-review.types";
import type { SourceModelReviewOutput } from "./source-model-review.contract";

export function findingCategoryLabel(code: string): string {
  if (code.startsWith("FS_")) return "Filesystem & destructive paths";
  if (code.startsWith("NET_") || code.startsWith("SEC_")) return "Network, credentials & exfiltration";
  if (code.startsWith("NPM_")) return "Install / lifecycle scripts";
  if (code.startsWith("SYS_")) return "System / extract";
  return "Dynamic execution & obfuscation";
}

function mapFindingSeverityToRisk(severity: string): "low" | "medium" | "high" {
  const s = severity.toLowerCase();
  if (s === "critical") return "high";
  if (s === "warning") return "medium";
  return "low";
}

function implicationForSeverity(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") {
    return "Contributes to a decline under the current static policy ruleset unless the pattern is removed or addressed.";
  }
  if (s === "warning") {
    return "Contributes to an approval-with-warnings outcome under the current ruleset; confirm before execution or publish.";
  }
  return "Informational for the audit trail under static review.";
}

function recommendationForSeverity(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") {
    return "Remove or replace the flagged pattern, then start a new import if you need a different outcome.";
  }
  if (s === "warning") {
    return "Review the flagged behavior against your risk tolerance before running or publishing.";
  }
  return "No policy-mandated action unless your workspace requires documentation.";
}

export function findingsToBackendRisks(findings: IntakeAuditFinding[]): BackendSourceReviewResult["risks"] {
  const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "warning" || f.severity === "info");
  if (!blocking.length) return undefined;
  return blocking.map((f) => ({
    severity: mapFindingSeverityToRisk(f.severity),
    category: findingCategoryLabel(f.code),
    title: f.message || f.code || "Finding",
    evidence: f.message,
    path: f.path?.trim() ? f.path : undefined,
    line: f.line ?? undefined,
    implication: implicationForSeverity(f.severity),
    recommendation: recommendationForSeverity(f.severity)
  }));
}

function isUnknownFramework(fw: string): boolean {
  const t = fw.trim().toLowerCase();
  return !t || t.includes("unknown") || t === "not inferred";
}

function isUnknownRuntime(rt: string): boolean {
  const t = rt.trim().toLowerCase();
  return !t || t.includes("unknown") || t === "not inferred";
}

export function capabilitiesFromDetectionJson(det: Record<string, unknown> | null | undefined): string[] | undefined {
  if (!det || typeof det !== "object") return undefined;
  const caps: string[] = [];
  const fw = typeof det.framework === "string" ? det.framework : "";
  if (fw.trim() && !isUnknownFramework(fw)) caps.push(`UI / framework indicator: ${fw.trim()}`);
  const rt = typeof det.runtime === "string" ? det.runtime : "";
  if (rt.trim() && !isUnknownRuntime(rt)) caps.push(`Runtime / environment marker: ${rt.trim()}`);
  const eps = Array.isArray(det.entrypoints)
    ? (det.entrypoints as unknown[]).filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
    : [];
  if (eps.length) caps.push(`Entry fields from manifest: ${eps.join(", ")}`);
  const deps = Array.isArray(det.dependenciesInferred)
    ? (det.dependenciesInferred as unknown[]).filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
    : [];
  if (deps.length) caps.push(`Package manifest read — dependency keys sampled (${deps.length})`);
  const fc = typeof det.fileCount === "number" && Number.isFinite(det.fileCount) ? det.fileCount : null;
  if (fc != null) caps.push(`Source files enumerated in scan: ${fc}`);
  return caps.length ? caps : undefined;
}

export type ReviewLimitationContext = {
  pipelineReadError?: boolean;
  extractError?: string | null;
  scanTruncated?: boolean;
  detectionNote?: string | null;
  disclaimer?: string | null;
};

export function buildReviewLimitations(ctx: ReviewLimitationContext): string[] {
  const out: string[] = [];
  if (ctx.pipelineReadError) {
    out.push("Automated review could not read the uploaded bytes end-to-end — no full static scan was produced.");
  }
  if (ctx.extractError?.trim()) {
    out.push(`Archive / extraction limitation: ${ctx.extractError.trim()}`);
  }
  if (ctx.scanTruncated) {
    out.push("Archive or per-file scan hit configured size or entry limits — analysis is partial.");
  }
  if (ctx.detectionNote?.trim()) {
    out.push(`Detection note: ${ctx.detectionNote.trim()}`);
  }
  if (ctx.disclaimer?.trim()) {
    out.push("Static policy review only — not runtime behavior, dependency resolution, or malware detection.");
  }
  return out;
}

export function computePreviewAllowedPolicy(args: {
  auditDecision: SourceIntakeAuditDecision;
  statusDeclined: boolean;
  pipelineReadError: boolean;
}): boolean {
  if (args.pipelineReadError) return false;
  if (args.auditDecision === "declined" || args.statusDeclined) return false;
  if (args.auditDecision === "pending") return false;
  return args.auditDecision === "approved" || args.auditDecision === "approved_with_warnings";
}

export function computePublishAllowedPolicy(args: {
  auditDecision: SourceIntakeAuditDecision;
  buildUnitId: string | null;
  pipelineReadError: boolean;
  publishWithWarningsAllowed: boolean;
}): boolean {
  if (args.pipelineReadError) return false;
  if (args.auditDecision === "pending" || args.auditDecision === "declined") return false;
  if (args.buildUnitId) return false;
  if (args.auditDecision === "approved_with_warnings" && !args.publishWithWarningsAllowed) return false;
  return args.auditDecision === "approved" || args.auditDecision === "approved_with_warnings";
}

function staticConfidence(decision: SourceIntakeAuditDecision, hasLimitations: boolean): "low" | "medium" | "high" | undefined {
  if (decision === "approved_with_warnings") return "medium";
  if (decision === "approved" && hasLimitations) return "medium";
  return undefined;
}

export function terminalDecisionToBackendDecision(terminal: IntakeTerminalDecision): BackendSourceReviewResult["decision"] {
  const d = terminal.auditDecision;
  if (d === "approved" || d === "approved_with_warnings" || d === "declined") return d;
  return "declined";
}

export type AssembleStaticReviewArgs = {
  terminal: IntakeTerminalDecision;
  findings: IntakeAuditFinding[];
  detectionJson: Record<string, unknown>;
  auditSummaryLine: string;
  pipelineReadError: boolean;
  buildUnitId: string | null;
  publishWithWarningsAllowed: boolean;
  extractError?: string | null;
  scanTruncated?: boolean;
};

/**
 * Truthful static-only review record. No model narrative; optional risks mirror structured audit findings.
 */
export function assembleStaticPolicyModelReview(args: AssembleStaticReviewArgs): BackendSourceReviewResult {
  const decision = terminalDecisionToBackendDecision(args.terminal);
  const previewAllowed = computePreviewAllowedPolicy({
    auditDecision: args.terminal.auditDecision,
    statusDeclined: args.terminal.status === "declined",
    pipelineReadError: args.pipelineReadError
  });
  const publishAllowed = computePublishAllowedPolicy({
    auditDecision: args.terminal.auditDecision,
    buildUnitId: args.buildUnitId,
    pipelineReadError: args.pipelineReadError,
    publishWithWarningsAllowed: args.publishWithWarningsAllowed
  });

  const detectionNote = typeof args.detectionJson.note === "string" ? args.detectionJson.note : null;
  const limitations = buildReviewLimitations({
    pipelineReadError: args.pipelineReadError,
    extractError: args.extractError ?? null,
    scanTruncated: Boolean(args.scanTruncated),
    detectionNote,
    disclaimer: null
  });

  const capabilities = capabilitiesFromDetectionJson(args.detectionJson);
  const risks = findingsToBackendRisks(args.findings);
  const confidence = staticConfidence(args.terminal.auditDecision, limitations.length > 0);

  const rationale =
    args.auditSummaryLine.trim() ||
    "Outcome produced by static policy rules only — no model-assisted review ran for this session.";

  return {
    version: SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
    reviewMode: "static_policy_only",
    capabilitiesDetected: capabilities,
    risks,
    limitations: limitations.length ? limitations : undefined,
    confidence,
    decision,
    previewAllowed,
    publishAllowed,
    rationale
  };
}

function modelOutputHasContent(o: SourceModelReviewOutput | null | undefined): boolean {
  if (!o) return false;
  if (typeof o.summary === "string" && o.summary.trim()) return true;
  if (Array.isArray(o.risks) && o.risks.length > 0) return true;
  if (Array.isArray(o.capabilitiesDetected) && o.capabilitiesDetected.length > 0) return true;
  if (Array.isArray(o.limitations) && o.limitations.length > 0) return true;
  return false;
}

function mergeUniqueStrings(a?: string[], b?: string[]): string[] | undefined {
  const s = new Set<string>();
  for (const x of a ?? []) if (x.trim()) s.add(x.trim());
  for (const x of b ?? []) if (x.trim()) s.add(x.trim());
  const out = Array.from(s);
  return out.length ? out : undefined;
}

/**
 * Enrich with model output when present. Backend decision/rationale/preview/publish remain authoritative.
 */
export function mergeModelReviewEnrichment(
  base: BackendSourceReviewResult,
  model: SourceModelReviewOutput | null | undefined
): BackendSourceReviewResult {
  if (!modelOutputHasContent(model) || !model) {
    return base;
  }
  const mergedLimitations = mergeUniqueStrings(base.limitations, model.limitations);
  const mergedCaps = mergeUniqueStrings(base.capabilitiesDetected, model.capabilitiesDetected);
  const extraRisks: NonNullable<BackendSourceReviewResult["risks"]> = [];
  if (model.risks?.length) {
    for (const r of model.risks) {
      if (!r?.title?.trim()) continue;
      extraRisks.push({
        severity: r.severity === "high" || r.severity === "medium" || r.severity === "low" ? r.severity : "low",
        category: r.category?.trim() ? r.category.trim() : "Model-assisted signal",
        title: r.title.trim(),
        evidence: r.evidence,
        path: r.path,
        line: r.line,
        implication: r.implication,
        recommendation: r.recommendation
      });
    }
  }
  const combinedRisks = [...(base.risks ?? []), ...extraRisks];
  return {
    ...base,
    reviewMode: "model_assisted",
    summary: typeof model.summary === "string" && model.summary.trim() ? model.summary.trim() : base.summary,
    capabilitiesDetected: mergedCaps ?? base.capabilitiesDetected,
    risks: combinedRisks.length ? combinedRisks : base.risks,
    limitations: mergedLimitations ?? base.limitations,
    confidence: model.confidence ?? base.confidence
  };
}

export function buildReviewPolicySnapshot(
  modelReview: BackendSourceReviewResult,
  extras: { pipelineReadError: boolean; publishWithWarningsAllowed: boolean; pending?: boolean }
): SourceIntakeReviewPolicySnapshot {
  const decision: SourceIntakeReviewPolicySnapshot["decision"] = extras.pending
    ? "pending"
    : modelReview.decision;
  return {
    version: SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
    reviewMode: modelReview.reviewMode,
    decision,
    rationale: modelReview.rationale,
    previewAllowed: modelReview.previewAllowed,
    publishAllowed: modelReview.publishAllowed,
    pipelineReadError: extras.pipelineReadError,
    publishWithWarningsAllowed: extras.publishWithWarningsAllowed
  };
}

export function flattenReviewIntoAuditJson(modelReview: BackendSourceReviewResult, reviewPolicy: SourceIntakeReviewPolicySnapshot): Record<string, unknown> {
  return {
    reviewMode: modelReview.reviewMode,
    rationale: modelReview.rationale,
    previewAllowed: modelReview.previewAllowed,
    publishAllowed: modelReview.publishAllowed,
    reviewPolicy,
    modelReview
  };
}

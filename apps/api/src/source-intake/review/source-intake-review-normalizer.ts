import type { SourceIntakeSessionEntity } from "../../db/entities/source-intake-session.entity";
import {
  SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
  type BackendSourceReviewResult,
  type NormalizedSourceIntakeReviewV1,
  type SourceIntakeReviewPolicySnapshot
} from "./source-intake-backend-review.types";
import {
  assembleStaticPolicyModelReview,
  buildReviewPolicySnapshot,
  computePreviewAllowedPolicy,
  computePublishAllowedPolicy,
  terminalDecisionToBackendDecision
} from "./source-intake-review-policy.helper";
import type { IntakeAuditFinding, IntakeTerminalDecision } from "../source-intake-static-audit.util";

function parseModelReviewFromAuditJson(audit: Record<string, unknown> | null): BackendSourceReviewResult | null {
  if (!audit) return null;
  const raw = audit.modelReview;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.version !== SOURCE_INTAKE_BACKEND_REVIEW_VERSION) return null;
  const decision = m.decision;
  const reviewMode = m.reviewMode;
  const rationale = m.rationale;
  if (
    (decision !== "approved" && decision !== "approved_with_warnings" && decision !== "declined") ||
    (reviewMode !== "static_policy_only" && reviewMode !== "model_assisted") ||
    typeof rationale !== "string" ||
    typeof m.previewAllowed !== "boolean" ||
    typeof m.publishAllowed !== "boolean"
  ) {
    return null;
  }
  return m as unknown as BackendSourceReviewResult;
}

function coerceFindings(raw: unknown): IntakeAuditFinding[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeAuditFinding[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : "";
    const severity = typeof o.severity === "string" ? o.severity : "info";
    const path = typeof o.path === "string" ? o.path : "";
    const message = typeof o.message === "string" ? o.message : "";
    const line = typeof o.line === "number" && Number.isFinite(o.line) ? o.line : null;
    if (!code && !message) continue;
    out.push({
      code,
      severity: severity as IntakeAuditFinding["severity"],
      path,
      line,
      message
    });
  }
  return out;
}

function fallbackTerminalFromSession(row: SourceIntakeSessionEntity): IntakeTerminalDecision {
  const st = row.status;
  const summary = row.auditSummary?.trim() || "";
  if (st === "approved") {
    return {
      status: "approved",
      auditDecision: "approved",
      auditSummary: summary || "Approved under static policy review."
    };
  }
  if (st === "approved_with_warnings") {
    return {
      status: "approved_with_warnings",
      auditDecision: "approved_with_warnings",
      auditSummary: summary || "Approved with warnings under static policy review."
    };
  }
  if (st === "declined") {
    return {
      status: "declined",
      auditDecision: "declined",
      auditSummary: summary || "Declined under static policy review."
    };
  }
  return {
    status: st as IntakeTerminalDecision["status"],
    auditDecision: "pending",
    auditSummary: summary || "Pending."
  };
}

/**
 * API-facing normalization: reconciles persisted `auditJson` with live session fields (`buildUnitId`, etc.).
 */
export function normalizeSourceIntakeReviewResult(
  row: SourceIntakeSessionEntity,
  opts: { publishWithWarningsAllowed: boolean }
): NormalizedSourceIntakeReviewV1 {
  const audit = row.auditJson && typeof row.auditJson === "object" ? (row.auditJson as Record<string, unknown>) : null;
  const pipelineReadError = audit?.pipelineReadError === true;
  const stored = parseModelReviewFromAuditJson(audit);

  const pending =
    row.auditDecision === "pending" ||
    row.status === "uploaded" ||
    row.status === "detecting" ||
    row.status === "auditing";

  if (pending) {
    const snapshot: SourceIntakeReviewPolicySnapshot = {
      version: SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
      reviewMode: "static_policy_only",
      decision: "pending",
      rationale: "Review is still in progress on the server.",
      previewAllowed: false,
      publishAllowed: false,
      pipelineReadError,
      publishWithWarningsAllowed: opts.publishWithWarningsAllowed
    };
    return {
      version: SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
      reviewMode: "static_policy_only",
      decision: "pending",
      rationale: snapshot.rationale,
      previewAllowed: false,
      publishAllowed: false,
      pipelineReadError,
      limitations: pipelineReadError
        ? ["Automated review could not read the uploaded bytes end-to-end — no full static scan was produced."]
        : [],
      modelReview: null,
      reviewPolicy: snapshot
    };
  }

  let modelReview = stored;
  const detectionJson =
    row.detectionJson && typeof row.detectionJson === "object"
      ? (row.detectionJson as Record<string, unknown>)
      : {};

  if (!modelReview) {
    const findings = coerceFindings(audit?.findings);
    const terminal = fallbackTerminalFromSession(row);
    const extractError = typeof audit?.extractError === "string" ? audit.extractError : null;
    const scanTruncated = audit?.scanTruncated === true;
    modelReview = assembleStaticPolicyModelReview({
      terminal,
      findings,
      detectionJson,
      auditSummaryLine: row.auditSummary?.trim() || terminal.auditSummary,
      pipelineReadError,
      buildUnitId: row.buildUnitId,
      publishWithWarningsAllowed: opts.publishWithWarningsAllowed,
      extractError,
      scanTruncated
    });
  } else {
    const terminal = fallbackTerminalFromSession(row);
    const backendDecision = terminalDecisionToBackendDecision(terminal);
    const previewAllowed = computePreviewAllowedPolicy({
      auditDecision: terminal.auditDecision,
      statusDeclined: terminal.status === "declined",
      pipelineReadError
    });
    const publishAllowed = computePublishAllowedPolicy({
      auditDecision: terminal.auditDecision,
      buildUnitId: row.buildUnitId,
      pipelineReadError,
      publishWithWarningsAllowed: opts.publishWithWarningsAllowed
    });
    modelReview = {
      ...modelReview,
      decision: backendDecision,
      previewAllowed,
      publishAllowed,
      rationale:
        pipelineReadError && row.auditSummary?.trim() ? row.auditSummary.trim() : modelReview.rationale
    };
  }

  const reviewPolicy = buildReviewPolicySnapshot(modelReview, {
    pipelineReadError,
    publishWithWarningsAllowed: opts.publishWithWarningsAllowed,
    pending: false
  });

  return {
    version: SOURCE_INTAKE_BACKEND_REVIEW_VERSION,
    reviewMode: modelReview.reviewMode,
    decision: modelReview.decision,
    rationale: modelReview.rationale,
    previewAllowed: modelReview.previewAllowed,
    publishAllowed: modelReview.publishAllowed,
    pipelineReadError,
    limitations: modelReview.limitations ?? [],
    modelReview,
    reviewPolicy
  };
}

/** Used by tests and tooling to derive a static review without a DB row. */
export function deriveStaticPolicyReviewResultForAnalysis(args: {
  terminal: IntakeTerminalDecision;
  findings: IntakeAuditFinding[];
  detectionJson: Record<string, unknown>;
  auditSummaryLine: string;
  extractError?: string | null;
  scanTruncated?: boolean;
  pipelineReadError?: boolean;
  buildUnitId?: string | null;
  publishWithWarningsAllowed?: boolean;
}): BackendSourceReviewResult {
  return assembleStaticPolicyModelReview({
    terminal: args.terminal,
    findings: args.findings,
    detectionJson: args.detectionJson,
    auditSummaryLine: args.auditSummaryLine,
    pipelineReadError: Boolean(args.pipelineReadError),
    buildUnitId: args.buildUnitId ?? null,
    publishWithWarningsAllowed: args.publishWithWarningsAllowed ?? true,
    extractError: args.extractError,
    scanTruncated: args.scanTruncated
  });
}

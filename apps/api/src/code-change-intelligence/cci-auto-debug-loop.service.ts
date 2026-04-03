import { Injectable } from "@nestjs/common";
import type {
  ChangeAuditResult,
  ChangePlanResult,
  CciWorkspaceValidationEvidence,
  CciWorkspaceValidationEvidenceEntry,
  PlanExecutionCoherence
} from "./change-intelligence.types";

export type AutoDebugFailureCategory =
  | "typecheck_failure"
  | "lint_failure"
  | "unit_test_failure"
  | "mixed_validation_failure"
  | "non_retryable_failure";

type AutoDebugOutcome = "passed" | "failed" | "skipped" | "not_eligible" | "max_attempts_reached";

export type AutoDebugAttemptRecord = {
  attempt: number;
  category: AutoDebugFailureCategory;
  summary: string;
  filesInScope: string[];
  failureAnalysis?: AutoDebugFailureAnalysis;
  fixStrategy?: AutoDebugFixStrategy;
  improvementAnalysis?: AutoDebugImprovementAnalysis;
  partialSuccess?: AutoDebugPartialSuccess;
};

export type AutoDebugFailureAnalysis = {
  failureType: AutoDebugFailureCategory | "infra_environment_failure";
  affectedFiles: string[];
  probableRootCause: string;
  errorSummary: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  evidence: Array<{
    check: "typecheck" | "lint" | "tests";
    command: string;
    exitCode: number | null;
    errorMessages: string[];
    filePaths: string[];
    stackTraces: string[];
  }>;
};

export type AutoDebugFixStrategy = {
  strategyType: "syntax_fix" | "type_fix" | "lint_fix" | "test_fix" | "mixed";
  targetFiles: string[];
  changeScope: "minimal" | "localized" | "expanded";
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
  scopeExpansionRequested: boolean;
  scopeExpansionApproved: boolean;
};

export type AutoDebugImprovementAnalysis = {
  previousFailure: string;
  currentFailure: string;
  improved: boolean;
  regression: boolean;
  unchanged: boolean;
  improvementScore: number;
};

export type AutoDebugPartialSuccess = {
  compileFixed: boolean;
  lintImproved: boolean;
  testsImproved: boolean;
};

export type AutoDebugLoopMetadata = {
  attempted: boolean;
  attempts: number;
  outcome: AutoDebugOutcome;
  failuresSeen: AutoDebugFailureCategory[];
  summary: string;
  stoppedReason: string;
  attemptsDetail: AutoDebugAttemptRecord[];
  failureHistory: AutoDebugFailureAnalysis[];
  improvementHistory: AutoDebugImprovementAnalysis[];
  strategiesUsed: AutoDebugFixStrategy[];
  finalOutcome: AutoDebugOutcome;
};

@Injectable()
export class CciAutoDebugLoopService {
  isEnabled(): boolean {
    const v = (process.env.MALV_CCI_AUTO_DEBUG_LOOP ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  maxAttempts(): number {
    const raw = Number(process.env.MALV_CCI_AUTO_DEBUG_LOOP_MAX_ATTEMPTS ?? "1");
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(2, Math.floor(raw)));
  }

  classifyFailure(evidence: CciWorkspaceValidationEvidence | null | undefined): AutoDebugFailureCategory {
    if (!evidence) return "non_retryable_failure";
    const failed = this.failedKeys(evidence);
    if (failed.length === 0) return "non_retryable_failure";
    if (failed.length > 1) return "mixed_validation_failure";
    if (failed[0] === "typecheck") return "typecheck_failure";
    if (failed[0] === "lint") return "lint_failure";
    if (failed[0] === "tests") return "unit_test_failure";
    return "non_retryable_failure";
  }

  shouldAttemptRetry(args: {
    evidence: CciWorkspaceValidationEvidence | null | undefined;
    plan: ChangePlanResult | null | undefined;
    audit: ChangeAuditResult | null | undefined;
    trustLevel: string | null | undefined;
    planExecutionCoherence: PlanExecutionCoherence | null | undefined;
    filesChanged: string[];
    attempt: number;
  }): {
    allowed: boolean;
    reason: string;
    category: AutoDebugFailureCategory;
    scope: string[];
    failureAnalysis: AutoDebugFailureAnalysis;
    fixStrategy: AutoDebugFixStrategy;
  } {
    const category = this.classifyFailure(args.evidence);
    const scope = this.computeAllowedScope({
      plan: args.plan,
      filesChanged: args.filesChanged
    });
    const failureAnalysis = this.analyzeFailure(args.evidence ?? null, scope);
    const fixStrategy = this.buildFixStrategy({
      failureAnalysis,
      plan: args.plan,
      filesChanged: args.filesChanged
    });
    if (!this.isEnabled()) return { allowed: false, reason: "feature_disabled", category, scope, failureAnalysis, fixStrategy };
    if (!args.evidence) return { allowed: false, reason: "no_validation_evidence", category, scope, failureAnalysis, fixStrategy };
    if (!this.hasValidationRun(args.evidence))
      return { allowed: false, reason: "validation_not_run", category, scope, failureAnalysis, fixStrategy };
    if (!this.hasValidationFailure(args.evidence))
      return { allowed: false, reason: "validation_passed", category, scope, failureAnalysis, fixStrategy };
    if (args.attempt >= this.maxAttempts())
      return { allowed: false, reason: "max_attempts_reached", category, scope, failureAnalysis, fixStrategy };
    if (scope.length < 1) return { allowed: false, reason: "scope_unknown_or_empty", category, scope, failureAnalysis, fixStrategy };
    if (category === "non_retryable_failure")
      return { allowed: false, reason: "non_retryable_failure", category, scope, failureAnalysis, fixStrategy };
    if (failureAnalysis.failureType === "infra_environment_failure" || this.isInfrastructureFailure(args.evidence)) {
      return { allowed: false, reason: "infra_or_environment_failure", category, scope, failureAnalysis, fixStrategy };
    }
    if (fixStrategy.riskLevel === "high") {
      return { allowed: false, reason: "high_risk_retry_blocked", category, scope, failureAnalysis, fixStrategy };
    }
    if (args.audit?.scopeClassification?.securitySensitive || args.trustLevel === "critical" || args.trustLevel === "sensitive") {
      return { allowed: false, reason: "security_sensitive_requires_human_review", category, scope, failureAnalysis, fixStrategy };
    }
    return { allowed: true, reason: "eligible", category, scope, failureAnalysis, fixStrategy };
  }

  computeAllowedScope(args: { plan: ChangePlanResult | null | undefined; filesChanged: string[] }): string[] {
    const planned = [...(args.plan?.filesToModify ?? []), ...(args.plan?.filesToCreate ?? [])].map((f) => f.trim()).filter(Boolean);
    const changed = args.filesChanged.map((f) => f.trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of changed) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    for (const f of planned) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    return out.slice(0, 64);
  }

  summarizeEvidence(evidence: CciWorkspaceValidationEvidence | null | undefined): string {
    if (!evidence) return "No workspace validation evidence available.";
    const lines = (["typecheck", "lint", "tests"] as const)
      .map((k) => {
        const row = evidence[k];
        if (!row) return null;
        const snippet = this.pickSnippet(row);
        return `${k}:${row.status}${row.exitCode !== null && row.exitCode !== undefined ? ` exit=${row.exitCode}` : ""} ${row.summary}${snippet ? ` | ${snippet}` : ""}`;
      })
      .filter(Boolean);
    return lines.join(" || ").slice(0, 1500);
  }

  isImproved(previous: CciWorkspaceValidationEvidence | null | undefined, next: CciWorkspaceValidationEvidence | null | undefined): boolean {
    const prevFailed = this.failedKeys(previous ?? {});
    const nextFailed = this.failedKeys(next ?? {});
    if (nextFailed.length < prevFailed.length) return true;
    if (nextFailed.length > prevFailed.length) return false;
    return nextFailed.join(",") !== prevFailed.join(",");
  }

  hasValidationFailure(evidence: CciWorkspaceValidationEvidence): boolean {
    return this.failedKeys(evidence).length > 0;
  }

  hasValidationRun(evidence: CciWorkspaceValidationEvidence): boolean {
    return [evidence.typecheck, evidence.lint, evidence.tests].some((row) => row?.status === "passed" || row?.status === "failed");
  }

  qualityMetadata(meta: AutoDebugLoopMetadata): Record<string, unknown> {
    return {
      autoDebugAttempted: meta.attempted,
      autoDebugAttempts: meta.attempts,
      autoDebugOutcome: meta.outcome,
      autoDebugFailuresSeen: meta.failuresSeen,
      autoDebugSummary: meta.summary,
      autoDebugStoppedReason: meta.stoppedReason,
      autoDebugAttemptsDetail: meta.attemptsDetail,
      autoDebugEnhanced: {
        attempts: meta.attempts,
        failureHistory: meta.failureHistory,
        improvementHistory: meta.improvementHistory,
        strategiesUsed: meta.strategiesUsed,
        finalOutcome: meta.finalOutcome,
        stoppedReason: meta.stoppedReason
      }
    };
  }

  analyzeFailure(evidence: CciWorkspaceValidationEvidence | null | undefined, allowedScope: string[]): AutoDebugFailureAnalysis {
    if (!evidence) {
      return {
        failureType: "non_retryable_failure",
        affectedFiles: [],
        probableRootCause: "No validation evidence available.",
        errorSummary: "Validation evidence missing.",
        severity: "high",
        confidence: 0.3,
        evidence: []
      };
    }
    const checks: Array<"typecheck" | "lint" | "tests"> = ["typecheck", "lint", "tests"];
    const entries: AutoDebugFailureAnalysis["evidence"] = [];
    const affected = new Set<string>();
    const snippets: string[] = [];
    let hasSyntax = false;
    let hasExpectation = false;
    let hasInfra = false;
    for (const check of checks) {
      const row = evidence[check];
      if (!row || row.status !== "failed") continue;
      const raw = [row.summary, row.stderrSnippet, row.stdoutSnippet, row.notes].filter(Boolean).join("\n");
      const filePaths = this.extractFilePaths(raw);
      for (const f of filePaths) affected.add(f);
      const errorMessages = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8);
      const stackTraces = errorMessages.filter((l) => /^\s*at\s+/.test(l) || /stack/i.test(l));
      entries.push({
        check,
        command: row.command,
        exitCode: row.exitCode ?? null,
        errorMessages,
        filePaths,
        stackTraces
      });
      snippets.push(`${check}: ${errorMessages[0] ?? row.summary}`);
      const lc = raw.toLowerCase();
      if (/ts\d{4}|unexpected token|parsing error|syntaxerror|ts1005/.test(lc)) hasSyntax = true;
      if (/expected|to equal|assert|received/.test(lc)) hasExpectation = true;
      if (/enoent|eacces|network|timeout|module not found|system unavailable|cannot find command/.test(lc)) hasInfra = true;
    }
    const category = this.classifyFailure(evidence);
    const affectedFiles = [...affected].slice(0, 16);
    const outOfScope = affectedFiles.filter((f) => !allowedScope.includes(f)).length;
    const probableRootCause = hasInfra
      ? "Infrastructure or environment failure detected in validation output."
      : hasSyntax
        ? "Likely syntax/parsing issue in recently changed files."
        : hasExpectation
          ? "Likely logic or test expectation mismatch."
          : category === "lint_failure"
            ? "Lint rule violations in scoped files."
            : category === "typecheck_failure"
              ? "Type contract mismatch in scoped code."
              : "Mixed validation failures across checks.";
    return {
      failureType: hasInfra ? "infra_environment_failure" : category,
      affectedFiles,
      probableRootCause,
      errorSummary: snippets.join(" | ").slice(0, 700),
      severity: hasInfra || outOfScope > 2 ? "high" : hasSyntax || category === "mixed_validation_failure" ? "medium" : "low",
      confidence: Math.max(0.25, Math.min(0.95, affectedFiles.length > 0 ? 0.85 : 0.6)),
      evidence: entries
    };
  }

  buildFixStrategy(args: {
    failureAnalysis: AutoDebugFailureAnalysis;
    plan: ChangePlanResult | null | undefined;
    filesChanged: string[];
  }): AutoDebugFixStrategy {
    const preferredScope = this.computeAllowedScope({ plan: args.plan, filesChanged: args.filesChanged });
    const inScopeTargets = args.failureAnalysis.affectedFiles.filter((f) => preferredScope.includes(f));
    const outOfScopeTargets = args.failureAnalysis.affectedFiles.filter((f) => !preferredScope.includes(f));
    const scopeExpansionRequested = outOfScopeTargets.length > 0 && args.failureAnalysis.confidence >= 0.8;
    const scopeExpansionApproved = scopeExpansionRequested && outOfScopeTargets.length <= 2;
    const expandedTargets = scopeExpansionApproved ? outOfScopeTargets.slice(0, 2) : [];
    const targetFiles = [...new Set([...inScopeTargets, ...preferredScope.slice(0, 4), ...expandedTargets])].slice(0, 8);
    let strategyType: AutoDebugFixStrategy["strategyType"] = "mixed";
    if (args.failureAnalysis.failureType === "typecheck_failure") {
      strategyType = /syntax|parsing/i.test(args.failureAnalysis.probableRootCause) ? "syntax_fix" : "type_fix";
    } else if (args.failureAnalysis.failureType === "lint_failure") strategyType = "lint_fix";
    else if (args.failureAnalysis.failureType === "unit_test_failure") strategyType = "test_fix";
    return {
      strategyType,
      targetFiles,
      changeScope: scopeExpansionApproved ? "expanded" : targetFiles.length <= 2 ? "minimal" : "localized",
      reasoning: `${args.failureAnalysis.probableRootCause} Targeting ${targetFiles.length} file(s).`,
      riskLevel:
        args.failureAnalysis.failureType === "infra_environment_failure" || targetFiles.length > 6 || scopeExpansionRequested
          ? "high"
          : args.failureAnalysis.failureType === "mixed_validation_failure"
            ? "medium"
            : "low",
      scopeExpansionRequested,
      scopeExpansionApproved
    };
  }

  compareImprovement(
    previous: CciWorkspaceValidationEvidence | null | undefined,
    current: CciWorkspaceValidationEvidence | null | undefined
  ): AutoDebugImprovementAnalysis {
    const prevFailed = this.failedKeys(previous ?? {}).sort();
    const curFailed = this.failedKeys(current ?? {}).sort();
    const prevErrors = this.errorCount(previous ?? null);
    const curErrors = this.errorCount(current ?? null);
    const improved = curFailed.length < prevFailed.length || curErrors < prevErrors;
    const regression = curFailed.length > prevFailed.length || curErrors > prevErrors;
    const unchanged = !improved && !regression && prevFailed.join(",") === curFailed.join(",");
    const typeShiftBonus = prevFailed.join(",") !== curFailed.join(",") ? 0.2 : 0;
    const score = Math.max(-1, Math.min(1, (prevErrors - curErrors) / Math.max(1, prevErrors) + typeShiftBonus));
    return {
      previousFailure: prevFailed.join(",") || "none",
      currentFailure: curFailed.join(",") || "none",
      improved,
      regression,
      unchanged,
      improvementScore: Number(score.toFixed(3))
    };
  }

  detectPartialSuccess(
    previous: CciWorkspaceValidationEvidence | null | undefined,
    current: CciWorkspaceValidationEvidence | null | undefined
  ): AutoDebugPartialSuccess {
    const prevType = previous?.typecheck?.status;
    const curType = current?.typecheck?.status;
    const prevLint = previous?.lint?.status;
    const curLint = current?.lint?.status;
    const prevTests = previous?.tests?.status;
    const curTests = current?.tests?.status;
    return {
      compileFixed: prevType === "failed" && curType === "passed",
      lintImproved: prevLint === "failed" && curLint !== "failed",
      testsImproved: prevTests === "failed" && curTests !== "failed"
    };
  }

  private failedKeys(evidence: CciWorkspaceValidationEvidence): Array<"typecheck" | "lint" | "tests"> {
    const keys: Array<"typecheck" | "lint" | "tests"> = [];
    if (evidence.typecheck?.status === "failed") keys.push("typecheck");
    if (evidence.lint?.status === "failed") keys.push("lint");
    if (evidence.tests?.status === "failed") keys.push("tests");
    return keys;
  }

  private isInfrastructureFailure(evidence: CciWorkspaceValidationEvidence): boolean {
    const rows = [evidence.typecheck, evidence.lint, evidence.tests].filter(Boolean) as CciWorkspaceValidationEvidenceEntry[];
    if (rows.length === 0) return true;
    return rows.some((r) => (r.summary ?? "").toLowerCase().includes("system unavailable"));
  }

  private pickSnippet(row: CciWorkspaceValidationEvidenceEntry): string {
    return (row.stderrSnippet || row.stdoutSnippet || row.notes || "").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  private extractFilePaths(raw: string): string[] {
    const out = new Set<string>();
    const re = /\b([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|py|go|rs|java|css|scss))(?:[:(]\d+(?::\d+)?\)?)?/g;
    let m: RegExpExecArray | null = re.exec(raw);
    while (m) {
      out.add(m[1]);
      m = re.exec(raw);
    }
    return [...out].slice(0, 12);
  }

  private errorCount(evidence: CciWorkspaceValidationEvidence | null): number {
    if (!evidence) return 0;
    const rows = [evidence.typecheck, evidence.lint, evidence.tests].filter(Boolean) as CciWorkspaceValidationEvidenceEntry[];
    let total = 0;
    for (const r of rows) {
      if (r.status !== "failed") continue;
      const blob = [r.summary, r.stderrSnippet, r.stdoutSnippet, r.notes].filter(Boolean).join("\n");
      const explicit = (blob.match(/\berror\b/gi) ?? []).length;
      const tsCodes = (blob.match(/\bTS\d{4}\b/g) ?? []).length;
      total += Math.max(1, explicit + tsCodes);
    }
    return total;
  }
}


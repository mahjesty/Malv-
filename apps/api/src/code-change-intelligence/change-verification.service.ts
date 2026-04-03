import { Injectable } from "@nestjs/common";
import type {
  ChangeAuditResult,
  ChangePlanResult,
  ChangeVerificationResult,
  CciWorkspaceValidationEvidence,
  CciWorkspaceValidationEvidenceEntry,
  PlanExecutionCoherence,
  VerificationCheckStatus
} from "./change-intelligence.types";
import { isFrontendRepoPath } from "./frontend-repo-paths";

type CheckRow = Record<string, unknown>;

function checkRow(args: {
  type: string;
  status: VerificationCheckStatus;
  summary: string;
  source?: string;
  notes?: string;
  command?: string;
  exitCode?: number | null;
}): CheckRow {
  const performed = args.status === "passed";
  return {
    type: args.type,
    status: args.status,
    performed,
    summary: args.summary,
    detail: args.summary,
    ...(args.source ? { source: args.source } : {}),
    ...(args.notes ? { notes: args.notes } : {}),
    ...(args.command ? { command: args.command } : {}),
    ...(args.exitCode !== undefined && args.exitCode !== null ? { exitCode: args.exitCode } : {})
  };
}

@Injectable()
export class ChangeVerificationService {
  verify(args: {
    filesChanged: string[];
    checksPerformed?: CheckRow[];
    plan?: ChangePlanResult | null;
    audit?: ChangeAuditResult | null;
    /** When omitted (e.g. unit tests), plan/execution coherence row is skipped. */
    planExecutionCoherence?: PlanExecutionCoherence | null;
    /** Optional sandbox-backed workspace validation results (typecheck/lint/tests). */
    postImplementationWorkspaceValidation?: CciWorkspaceValidationEvidence | null;
  }): ChangeVerificationResult {
    const plan = args.plan;
    const audit = args.audit;
    const touchesFrontend = args.filesChanged.some((f) => isFrontendRepoPath(f.replace(/\\/g, "/")));
    const validationGaps: string[] = [];

    if (args.filesChanged.length === 0) {
      validationGaps.push("cci_no_files_changed_recorded");
    }

    const checks: CheckRow[] =
      args.checksPerformed ??
      this.buildDefaultChecks({
        plan,
        audit,
        touchesFrontend,
        validationGaps
      });

    if (args.planExecutionCoherence !== undefined && args.planExecutionCoherence !== null) {
      const c = args.planExecutionCoherence;
      for (const code of c.codes) {
        validationGaps.push(code);
      }
      let cohStatus: VerificationCheckStatus;
      if (c.alignment === "unknown") {
        cohStatus = "skipped";
      } else if (c.alignment === "full") {
        cohStatus = "passed";
      } else {
        cohStatus = "failed";
      }
      checks.push(
        checkRow({
          type: "plan_execution_coherence",
          status: cohStatus,
          summary:
            c.alignment === "full"
              ? "Submitted filesChanged aligns with plan filesToModify/filesToCreate."
              : c.alignment === "partial"
                ? "Partial overlap between filesChanged and planned targets — see warnings."
                : c.alignment === "none"
                  ? "Execution metadata does not match planned file targets."
                  : "Plan did not list explicit file targets; coherence not applicable.",
          source: "cci_plan_execution_compare",
          notes: c.warnings.length ? c.warnings.join(" | ") : undefined
        })
      );
    }

    const wsEvidence = args.postImplementationWorkspaceValidation;
    if (wsEvidence) {
      this.applyWorkspaceValidationEvidence({ checks, validationGaps, evidence: wsEvidence });
    }

    const notRunCount = checks.filter((row) => row.status === "not_run").length;
    if (notRunCount >= 4) {
      validationGaps.push("cci_many_checks_not_run");
    }

    const testsRunBase = [
      {
        type: "malv_cci_pipeline",
        status: "stages_recorded",
        note: "CCI audit/plan/verify/review artifacts — not the target repo test suite; run tsc/eslint/tests in workspace or CI."
      },
      ...(plan?.verificationPreview?.mostRelevantTests ?? [])
        .slice(0, 3)
        .map((t) => ({ type: "targeted", note: t, status: "recommended" }))
    ];
    const testsRun = wsEvidence?.tests
      ? [
          {
            type: "target_repo_workspace_validation",
            status: wsEvidence.tests.status,
            command: wsEvidence.tests.command,
            exitCode: wsEvidence.tests.exitCode,
            note: wsEvidence.tests.summary,
            source: "cci_workspace_operator_validation"
          },
          ...testsRunBase
        ]
      : testsRunBase;

    const hasUnproven = args.filesChanged.length > 8 || (audit?.scopeClassification?.crossModule ?? false);
    const scopeComplexity = plan?.scopeComplexity ?? "medium";

    let engineeringConfidence: "low" | "medium" | "high" =
      scopeComplexity === "critical" || hasUnproven ? "medium" : args.filesChanged.length > 12 ? "medium" : "high";

    if (args.filesChanged.length === 0) {
      engineeringConfidence = "low";
    } else if (validationGaps.length > 0) {
      engineeringConfidence = engineeringConfidence === "high" ? "medium" : engineeringConfidence;
    }

    const coherence = args.planExecutionCoherence;
    if (coherence && coherence.plannedTargets.length > 0) {
      if (coherence.alignment === "none") {
        engineeringConfidence = "low";
      } else if (coherence.alignment === "partial") {
        if (engineeringConfidence === "high") engineeringConfidence = "medium";
      }
    }

    if (notRunCount >= 6 && engineeringConfidence === "high") {
      engineeringConfidence = "medium";
    }

    const designConfidence: "low" | "medium" | "high" | "n/a" =
      audit?.impactedAreas.frontend || plan?.visualStrategy
        ? plan?.visualStrategy
          ? engineeringConfidence === "high"
            ? "high"
            : "medium"
          : "low"
        : "n/a";

    const verificationPlan = plan?.verificationPreview ?? {
      whatToVerify: [],
      likelyBreakage: [],
      mostRelevantTests: [],
      cannotProveAutomatically: []
    };

    const unprovenParts: string[] = [];
    if (hasUnproven) {
      unprovenParts.push("End-to-end integration paths beyond touched modules are not fully proven automatically.");
    }
    const wsExecuted =
      wsEvidence &&
      [wsEvidence.typecheck, wsEvidence.lint, wsEvidence.tests].some(
        (x) => x && (x.status === "passed" || x.status === "failed")
      );
    if (wsExecuted) {
      unprovenParts.push(
        "Workspace validation (tsc/eslint/tests) ran via the operator sandbox — see checksPerformed and testsRun for command/exit evidence. DB migration apply and OpenAPI/client diff are not run in CCI."
      );
    } else {
      unprovenParts.push(
        "CCI does not invoke tsc, eslint, DB migration apply, or OpenAPI/client diff here — treat those as required external validation for third-party apps."
      );
    }
    if (touchesFrontend) {
      unprovenParts.push(
        "UI critique and rendered review run in the patch-review stage after this report; engineering verification alone does not prove UX."
      );
    }
    if (coherence?.warnings.length) {
      unprovenParts.push(`Plan vs execution: ${coherence.warnings.join(" ")}`);
    }

    const provenSafeAreas =
      "Workflow stage gating completed: audit and plan artifacts exist for this request; implementation metadata was recorded before this verification step.";

    return {
      verificationSummary: `Verification: scope=${scopeComplexity}; engineering=${engineeringConfidence}; design=${designConfidence}. See checksPerformed[].status (passed|failed|not_run|skipped) and validationGaps.`,
      verificationPlan,
      testsRun,
      checksPerformed: checks,
      provenSafeAreas,
      unprovenAreas: unprovenParts.join(" "),
      regressionNotes: audit?.impactIntelligence?.migrationsConfigEnvSurfaces?.length
        ? `Watch: ${audit.impactIntelligence.migrationsConfigEnvSurfaces.slice(0, 3).join("; ")}`
        : "No migration/env hotspots flagged in audit cone.",
      confidenceLevel: engineeringConfidence,
      engineeringConfidence,
      designConfidence,
      scopeComplexity,
      validationGaps: validationGaps.length ? validationGaps : undefined,
      planExecutionCoherence: coherence ?? undefined,
      postImplementationWorkspaceValidation: wsEvidence ?? undefined
    };
  }

  private applyWorkspaceValidationEvidence(args: {
    checks: CheckRow[];
    validationGaps: string[];
    evidence: CciWorkspaceValidationEvidence;
  }): void {
    const { checks, validationGaps, evidence } = args;
    const pullGap = (code: string) => {
      const i = validationGaps.indexOf(code);
      if (i >= 0) validationGaps.splice(i, 1);
    };
    const replace = (checkType: string, entry: CciWorkspaceValidationEvidenceEntry | undefined, gapCode: string) => {
      if (!entry) return;
      if (entry.status === "passed") pullGap(gapCode);
      const idx = checks.findIndex((c) => c.type === checkType);
      const notes = [entry.notes, entry.stderrSnippet?.slice(0, 800), entry.stdoutSnippet?.slice(0, 400)].filter(Boolean).join(" | ");
      const row: CheckRow = {
        type: checkType,
        status: entry.status,
        performed: entry.status === "passed",
        summary: entry.summary,
        detail: entry.summary,
        source: "cci_workspace_operator_validation",
        ...(notes ? { notes } : {}),
        command: entry.command,
        ...(entry.exitCode !== null && entry.exitCode !== undefined ? { exitCode: entry.exitCode } : {})
      };
      if (idx >= 0) checks[idx] = row;
      else checks.push(row);
    };
    replace("typecheck_impact_review", evidence.typecheck, "cci_typescript_compiler_not_run");
    replace("lint_impact_review", evidence.lint, "cci_linter_not_run");
    if (evidence.tests) {
      const notes = [evidence.tests.notes, evidence.tests.stderrSnippet?.slice(0, 800)].filter(Boolean).join(" | ");
      checks.push({
        type: "repository_test_suite_execution",
        status: evidence.tests.status,
        performed: evidence.tests.status === "passed",
        summary: evidence.tests.summary,
        detail: evidence.tests.summary,
        source: "cci_workspace_operator_validation",
        command: evidence.tests.command,
        ...(evidence.tests.exitCode !== null && evidence.tests.exitCode !== undefined
          ? { exitCode: evidence.tests.exitCode }
          : {}),
        ...(notes ? { notes } : {})
      });
    }
  }

  private buildDefaultChecks(args: {
    plan: ChangePlanResult | null | undefined;
    audit: ChangeAuditResult | null | undefined;
    touchesFrontend: boolean;
    validationGaps: string[];
  }): CheckRow[] {
    const { plan, audit, touchesFrontend, validationGaps } = args;

    const frontendPlanned = Boolean(
      audit?.impactedAreas.frontend || plan?.visualStrategy || plan?.designBrain?.designSystemProfile
    );

    const notRun = (type: string, gap: string, summary: string): CheckRow => {
      validationGaps.push(gap);
      return checkRow({ type, status: "not_run", summary, source: "cci_verification", notes: "No tool executed in CCI for this check." });
    };

    const skippedScope = (type: string, summary: string): CheckRow =>
      checkRow({
        type,
        status: "skipped",
        summary,
        source: "cci_verification",
        notes: "Not applicable to this plan/scope."
      });

    const passedHeuristic = (type: string, summary: string, source: string, notes?: string): CheckRow =>
      checkRow({ type, status: "passed", summary, source, notes });

    const checks: CheckRow[] = [
      audit?.summary
        ? passedHeuristic(
            "code_audit",
            "Audit artifact present from earlier CCI pipeline stage.",
            "cci_audit_stage",
            "Heuristic/graph audit completed before verification."
          )
        : checkRow({
            type: "code_audit",
            status: "failed",
            summary: "No audit summary available at verification time.",
            source: "cci_verification"
          }),
      frontendPlanned
        ? plan?.designBrain?.designSystemProfile
          ? passedHeuristic(
              "design_audit",
              "Design system profile recorded during planning.",
              "cci_planning_stage",
              "Planning-time scan, not post-implementation proof."
            )
          : notRun("design_audit", "cci_design_audit_missing", "Design audit output not present on plan.")
        : skippedScope("design_audit", "Skipped: plan is not frontend/design scoped."),
      frontendPlanned
        ? plan?.visualStrategy
          ? passedHeuristic(
              "visual_strategy",
              "Visual strategy recorded during planning.",
              "cci_planning_stage",
              "Planning output only."
            )
          : notRun("visual_strategy", "cci_visual_strategy_missing", "Visual strategy not present on plan.")
        : skippedScope("visual_strategy", "Skipped: plan is not frontend/design scoped."),
      notRun(
        "typecheck_impact_review",
        "cci_typescript_compiler_not_run",
        "TypeScript compiler was not executed in CCI; run tsc or CI typecheck on the workspace."
      ),
      notRun(
        "lint_impact_review",
        "cci_linter_not_run",
        "ESLint/format or other linters were not executed in CCI."
      ),
      notRun(
        "contract_consistency_review",
        "cci_no_openapi_dto_diff",
        "No automated diff between DTOs, controllers, and frontend clients."
      ),
      notRun(
        "security_review_touched_scope",
        "cci_no_automated_security_scan",
        "No SAST or auth-route proof executed in CCI."
      ),
      notRun(
        "db_schema_consistency",
        "cci_db_schema_not_validated",
        "Migrations/entities were not applied or validated against a database in CCI."
      ),
      passedHeuristic(
        "regression_risk_review",
        "Impact graph / audit regression hints reviewed (heuristic only, no tests run).",
        "cci_audit_impact_graph",
        "Derived from audit intelligence, not from test execution."
      ),
      frontendPlanned
        ? plan?.visualStrategy
          ? passedHeuristic(
              "design_quality_review",
              "Plan includes visual strategy (pre-implementation signal).",
              "cci_planning_stage"
            )
          : notRun("design_quality_review", "cci_design_quality_plan_missing", "No visual strategy on plan.")
        : skippedScope("design_quality_review", "Skipped: plan is not frontend/design scoped."),
      frontendPlanned
        ? plan?.designBrain?.composition
          ? passedHeuristic("layout_blueprint_before_implementation", "Composition blueprint present on plan.", "cci_planning_stage")
          : notRun("layout_blueprint_before_implementation", "cci_layout_blueprint_missing", "Composition blueprint not on plan.")
        : skippedScope("layout_blueprint_before_implementation", "Skipped: plan is not frontend/design scoped."),
      frontendPlanned
        ? plan?.designBrain?.motion
          ? passedHeuristic("motion_plan_before_implementation", "Motion plan present on plan.", "cci_planning_stage")
          : notRun("motion_plan_before_implementation", "cci_motion_plan_missing", "Motion plan not on plan.")
        : skippedScope("motion_plan_before_implementation", "Skipped: plan is not frontend/design scoped.")
    ];

    if (touchesFrontend) {
      checks.push(
        notRun(
          "structured_ui_critique",
          "cci_ui_critique_follows_in_patch_review",
          "Structured UI critique runs in patch review after this verification step."
        ),
        notRun(
          "design_critique_post_implementation",
          "cci_post_impl_critique_follows_in_patch_review",
          "Post-implementation design critique is not available at verification time."
        )
      );
    } else {
      checks.push(
        checkRow({
          type: "structured_ui_critique",
          status: "skipped",
          summary: "Skipped: no frontend paths in submitted filesChanged.",
          source: "cci_verification",
          notes: "Scope rule — not applicable to this execution metadata."
        }),
        checkRow({
          type: "design_critique_post_implementation",
          status: "skipped",
          summary: "Skipped: no frontend paths in submitted filesChanged.",
          source: "cci_verification",
          notes: "Deferred to patch review if UI files appear in review context."
        })
      );
    }

    checks.push(
      audit?.bugDetection
        ? passedHeuristic(
            "bug_detection_scan",
            "Bug detection scan artifact present from audit stage.",
            "cci_audit_stage",
            "Heuristic patterns only — not tsc/eslint."
          )
        : notRun("bug_detection_scan", "cci_bug_detection_missing", "No bug detection artifact on audit."),
      audit?.performanceIntel
        ? passedHeuristic(
            "performance_intelligence_scan",
            "Performance intelligence artifact present from audit stage.",
            "cci_audit_stage",
            "Heuristic hints only."
          )
        : notRun("performance_intelligence_scan", "cci_perf_intel_missing", "No performance intelligence artifact on audit."),
      audit?.fixPlan
        ? passedHeuristic("fix_planning", "Fix planning artifact present from audit stage.", "cci_audit_stage")
        : notRun("fix_planning", "cci_fix_plan_missing", "No fix plan artifact on audit.")
    );

    return checks;
  }
}

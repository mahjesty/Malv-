import { ChangeVerificationService } from "./change-verification.service";
import type { ChangeAuditResult, ChangePlanResult } from "./change-intelligence.types";
import { validateExecutionMatchesPlan } from "./plan-execution-coherence";

describe("ChangeVerificationService", () => {
  const svc = new ChangeVerificationService();

  const minimalAudit = (overrides?: Partial<ChangeAuditResult>): ChangeAuditResult =>
    ({
      summary: "audit ok",
      impactedAreas: {
        frontend: false,
        backend: true,
        dtoSchema: false,
        authPermissions: false,
        realtimeEvents: false,
        tests: true,
        dbMigrations: false,
        configEnv: false
      },
      relatedFiles: [],
      impactedFiles: [],
      upstreamDependencies: [],
      downstreamEffects: [],
      dependencyGraph: {
        cacheKey: "",
        generatedAt: 0,
        scanRoots: [],
        fileCount: 0,
        edgeCount: 0,
        symbolEdgeSample: [],
        fileEdgeSample: [],
        moduleEdgeSample: []
      },
      impactAnalysis: {
        summary: "",
        mayBreakIfChanged: [],
        dependentModules: [],
        regressionTesting: []
      },
      impactIntelligence: {
        summary: "",
        mayBreakIfChanged: [],
        dependentModules: [],
        regressionTesting: [],
        directlyTouchedFiles: [],
        dependentFiles: [],
        contractsAtRisk: [],
        testsRecommended: [],
        userFacingFlowsLikely: [],
        authRealtimeSecurityIntersections: [],
        migrationsConfigEnvSurfaces: []
      },
      repoPatterns: { duplicateLogicHints: [], similarPatterns: [], saferExtensionPoints: [] },
      extensionIntelligence: {
        idealPlugInPoints: [],
        similarPatterns: [],
        duplicationWarnings: [],
        saferExtensionPoints: [],
        riskyPatchPoints: [],
        layerHints: { primary: "service", alternates: [], rationale: "" }
      },
      scopeClassification: {
        minimalLocalized: true,
        crossModule: false,
        contractChanging: false,
        dataModelChanging: false,
        securitySensitive: false,
        uxSensitive: false,
        performanceSensitive: false,
        rationale: []
      },
      architectureNotes: "",
      riskNotes: "",
      securityNotes: "",
      bugDetection: { scannedFiles: 1, issues: [], summary: "ok" },
      performanceIntel: { scannedFiles: 1, issues: [], summary: "ok" },
      fixPlan: { items: [], pipelinePolicy: "", summary: "" },
      ...overrides
    }) as ChangeAuditResult;

  const minimalBackendPlan = (): ChangePlanResult =>
    ({
      planSummary: "p",
      implementationStrategy: "s",
      strategy: "localized_patch",
      strategyRationale: "",
      touchedLayers: [],
      extensionPointsExplicit: [],
      contractChanges: [],
      performanceConsiderations: "",
      securityConsiderations: "",
      designConsiderations: null,
      riskSummary: "",
      confidenceRationale: "",
      verificationPreview: {
        whatToVerify: [],
        likelyBreakage: [],
        mostRelevantTests: [],
        cannotProveAutomatically: []
      },
      visualStrategy: null,
      designBrain: null,
      frontendDesignAudit: null,
      filesToModify: ["apps/api/src/svc.ts"],
      filesToCreate: [],
      migrationsRequired: false,
      testPlan: "",
      rollbackNotes: "",
      approvalRequired: false,
      trustLevel: "controlled",
      scopeComplexity: "low"
    }) as ChangePlanResult;

  it("marks typecheck and lint as not_run with no false performed", () => {
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit()
    });
    const typecheck = out.checksPerformed.find((c) => c.type === "typecheck_impact_review");
    const lint = out.checksPerformed.find((c) => c.type === "lint_impact_review");
    expect(typecheck?.status).toBe("not_run");
    expect(typecheck?.performed).toBe(false);
    expect(lint?.status).toBe("not_run");
    expect(lint?.performed).toBe(false);
  });

  it("preserves legacy performed as alias for status===passed", () => {
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit()
    });
    for (const row of out.checksPerformed) {
      expect(row.performed).toBe(row.status === "passed");
    }
  });

  it("downgrades confidence for empty filesChanged when plan expected targets", () => {
    const coherence = validateExecutionMatchesPlan({
      filesChanged: [],
      filesToModify: ["apps/api/src/a.ts"],
      filesToCreate: []
    });
    const out = svc.verify({
      filesChanged: [],
      plan: minimalBackendPlan(),
      audit: minimalAudit(),
      planExecutionCoherence: coherence
    });
    expect(out.engineeringConfidence).toBe("low");
    expect(out.validationGaps).toEqual(expect.arrayContaining(["cci_plan_execution_empty_vs_planned_targets"]));
    const cohRow = out.checksPerformed.find((c) => c.type === "plan_execution_coherence");
    expect(cohRow?.status).toBe("failed");
  });

  it("full coherence yields passed plan_execution_coherence and does not force low confidence", () => {
    const coherence = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/svc.ts"],
      filesToModify: ["apps/api/src/svc.ts"],
      filesToCreate: []
    });
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit(),
      planExecutionCoherence: coherence
    });
    const cohRow = out.checksPerformed.find((c) => c.type === "plan_execution_coherence");
    expect(cohRow?.status).toBe("passed");
    expect(out.engineeringConfidence).not.toBe("low");
  });

  it("partial coherence keeps engineering confidence at medium at most", () => {
    const coherence = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/svc.ts"],
      filesToModify: ["apps/api/src/svc.ts", "apps/api/src/other.ts"],
      filesToCreate: []
    });
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit(),
      planExecutionCoherence: coherence
    });
    expect(coherence.alignment).toBe("partial");
    expect(out.engineeringConfidence).toBe("medium");
  });

  it("omitting planExecutionCoherence does not add plan_execution_coherence row", () => {
    const out = svc.verify({
      filesChanged: ["a.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit()
    });
    expect(out.checksPerformed.some((c) => c.type === "plan_execution_coherence")).toBe(false);
  });

  it("workspace validation evidence replaces typecheck/lint rows and removes compiler/lint gap codes when passed", () => {
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit(),
      postImplementationWorkspaceValidation: {
        typecheck: { status: "passed", command: "tsc --noEmit", exitCode: 0, summary: "OK" },
        lint: { status: "passed", command: "eslint .", exitCode: 0, summary: "OK" }
      }
    });
    const typecheck = out.checksPerformed.find((c) => c.type === "typecheck_impact_review");
    const lint = out.checksPerformed.find((c) => c.type === "lint_impact_review");
    expect(typecheck?.status).toBe("passed");
    expect(typecheck?.source).toBe("cci_workspace_operator_validation");
    expect(lint?.status).toBe("passed");
    expect(out.validationGaps).not.toContain("cci_typescript_compiler_not_run");
    expect(out.validationGaps).not.toContain("cci_linter_not_run");
    expect(out.postImplementationWorkspaceValidation?.typecheck?.status).toBe("passed");
  });

  it("workspace validation failed tests append repository_test_suite_execution and prepend testsRun", () => {
    const out = svc.verify({
      filesChanged: ["apps/api/src/svc.ts"],
      plan: minimalBackendPlan(),
      audit: minimalAudit(),
      postImplementationWorkspaceValidation: {
        tests: { status: "failed", command: "jest", exitCode: 1, summary: "1 failed" }
      }
    });
    expect(out.testsRun[0]).toMatchObject({
      type: "target_repo_workspace_validation",
      status: "failed",
      exitCode: 1
    });
    const row = out.checksPerformed.find((c) => c.type === "repository_test_suite_execution");
    expect(row?.status).toBe("failed");
  });
});

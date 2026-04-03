import { CodeGraphService } from "./code-graph.service";
import { CodebaseAuditService } from "./codebase-audit.service";
import { createChangePlanningService } from "./change-planning-wiring";
import { BadRequestException } from "@nestjs/common";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";
import { ChangeVerificationService } from "./change-verification.service";
import { patchReviewServiceForTests } from "./patch-review-test-utils";
import { modelReadinessTestDeps } from "./model-readiness/model-readiness.spec-helpers";
import { BugDetectionService } from "./bug-detection.service";
import { PerformanceIntelligenceService } from "./performance-intelligence.service";
import { FixPlanningService } from "./fix-planning.service";
import type { IntelligenceLearningService } from "./intelligence-learning.service";

function mockIntelligenceLearning(): IntelligenceLearningService {
  return { recordPipelineCompletionBestEffort: jest.fn().mockResolvedValue(undefined) } as unknown as IntelligenceLearningService;
}

function mockAutoDebugLoop(): any {
  return {
    maxAttempts: jest.fn(() => 1),
    shouldAttemptRetry: jest.fn(() => ({ shouldRetry: false })),
    summarizeEvidence: jest.fn(() => "n/a"),
    compareImprovement: jest.fn(() => ({ improved: false })),
    detectPartialSuccess: jest.fn(() => false),
    hasValidationFailure: jest.fn(() => false),
    qualityMetadata: jest.fn((m: Record<string, unknown>) => m)
  };
}

function makeRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  return {
    rows,
    create: jest.fn((input: T) => ({ ...input })),
    save: jest.fn(async (input: T) => {
      const row = { ...input } as T;
      if (!(row as any).id) (row as any).id = `id-${rows.length + 1}`;
      const idx = rows.findIndex((r) => (r as any).id === (row as any).id);
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      return row;
    }),
    findOne: jest.fn(async (opts?: any) => {
      const id = opts?.where?.id ?? opts?.where?.changeRequest?.id;
      if (!id) return rows[rows.length - 1] ?? null;
      return rows.filter((r) => (r as any).id === id || (r as any)?.changeRequest?.id === id).slice(-1)[0] ?? null;
    })
  };
}

describe("Peak code intelligence", () => {
  it("code graph includes dependents and module-to-module edges", () => {
    const g = new CodeGraphService();
    g.invalidateCache();
    const snap = g.getOrBuildGraph();
    expect(snap.dependents).toBeDefined();
    expect(Object.keys(snap.dependents).length).toBeGreaterThan(0);
    expect(snap.moduleEdges.length).toBeGreaterThan(0);
    const payload = g.buildAuditPayload(snap);
    expect(payload.moduleEdgeSample.length).toBeGreaterThan(0);
  });

  it("audit captures impact intelligence and extension points", () => {
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "improve realtime gateway event handling",
      hints: []
    });
    expect(audit.impactIntelligence.directlyTouchedFiles.length).toBeGreaterThan(0);
    expect(audit.extensionIntelligence.layerHints.primary).toBeTruthy();
    expect(audit.scopeClassification.rationale.length).toBeGreaterThan(0);
  });

  it("scope classification affects approval and plan complexity metadata", () => {
    const planning = createChangePlanningService();
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "update env config and secret settings for production",
      hints: []
    });
    const plan = planning.createPlan({ requestedGoal: audit.summary, audit });
    expect(plan.approvalRequired).toBe(true);
    expect(["critical", "high", "medium", "low"]).toContain(plan.scopeComplexity);
  });

  it("planning uses repo intelligence (non-naive file list) when cone is large", () => {
    const planning = createChangePlanningService();
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "refactor authentication service and permissions",
      hints: []
    });
    expect(audit.impactedFiles.length).toBeGreaterThan(2);
    const plan = planning.createPlan({ requestedGoal: "auth hardening", audit });
    expect(plan.filesToModify.some((f) => f.includes("auth") || f.includes("module"))).toBe(true);
  });

  it("frontend plan includes visualDirection, animationPlan, responsivePlan", () => {
    const planning = createChangePlanningService();
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "redesign the dashboard page layout for mobile",
      hints: []
    });
    expect(audit.impactedAreas.frontend).toBe(true);
    const plan = planning.createPlan({ requestedGoal: "dashboard UI", audit });
    expect(plan.visualStrategy).not.toBeNull();
    expect(plan.visualStrategy?.visualDirection).toBeTruthy();
    expect(plan.visualStrategy?.animationPlan).toBeTruthy();
    expect(plan.visualStrategy?.responsivePlan).toBeTruthy();
    expect(plan.designBrain?.designSystemProfile.spacingScale).toBeDefined();
    expect(plan.visualStrategy?.layoutStrategy).toBeTruthy();
  });

  it("patch review separates engineering vs design issue domains when frontend touched", async () => {
    const patch = patchReviewServiceForTests();
    const out = await patch.review({
      filesChanged: ["apps/web/src/app/page.tsx"],
      patchSummary: "adjust layout",
      audit: {
        impactedAreas: { frontend: true } as any,
        scopeClassification: { contractChanging: true } as any
      } as any,
      plan: { visualStrategy: { visualDirection: "x" } } as any
    });
    const domains = out.issuesFound.map((i) => (i as { domain?: string }).domain);
    expect(domains).toContain("design");
    expect(typeof out.designQualityScore).toBe("number");
    expect(out.designCritiqueSummary).toBeTruthy();
    expect(Array.isArray(out.improvementSuggestions)).toBe(true);
    expect(out.adjustedDesignConfidence).toBeTruthy();
    expect(out.renderedReviewAvailable).toBe(false);
    expect(out.visualQualityScore).toBeNull();
  });

  it("verification exposes engineering and design confidence", () => {
    const v = new ChangeVerificationService();
    const out = v.verify({
      filesChanged: ["apps/web/src/a.tsx"],
      plan: {
        scopeComplexity: "medium",
        visualStrategy: { visualDirection: "x" },
        verificationPreview: {
          whatToVerify: [],
          likelyBreakage: [],
          mostRelevantTests: [],
          cannotProveAutomatically: []
        }
      } as any,
      audit: {
        impactedAreas: { frontend: true },
        scopeClassification: {
          minimalLocalized: true,
          crossModule: false,
          contractChanging: false,
          dataModelChanging: false,
          securitySensitive: false,
          uxSensitive: true,
          performanceSensitive: false,
          rationale: []
        }
      } as any
    });
    expect(out.engineeringConfidence).toBeTruthy();
    expect(out.designConfidence).not.toBe("n/a");
  });

  it("code graph cache returns same instance within TTL", () => {
    const g = new CodeGraphService();
    g.invalidateCache();
    const a = g.getOrBuildGraph();
    const b = g.getOrBuildGraph();
    expect(a.generatedAt).toBe(b.generatedAt);
  });
});

describe("Peak workflow regressions", () => {
  it("realtime emits intelStage labels during audit/planning", async () => {
    const requests = makeRepo<any>();
    const audits = makeRepo<any>();
    const plans = makeRepo<any>();
    const runs = makeRepo<any>();
    const verifications = makeRepo<any>();
    const reviews = makeRepo<any>();
    const realtime = { emitMalvOrchestration: jest.fn() };
    const mr = modelReadinessTestDeps();
    const cciValidationBridge = { maybeRunPostImplementationValidation: jest.fn().mockResolvedValue(null) };
    const service = new CodeChangeIntelligenceService(
      requests as any,
      audits as any,
      plans as any,
      runs as any,
      verifications as any,
      reviews as any,
      new CodebaseAuditService(new CodeGraphService()),
      createChangePlanningService(),
      new ChangeVerificationService(),
      patchReviewServiceForTests(),
      new CodeGraphService(),
      new BugDetectionService(),
      new PerformanceIntelligenceService(),
      new FixPlanningService(),
      mockIntelligenceLearning(),
      realtime as any,
      { emitBestEffort: jest.fn() } as any,
      mr.gate,
      mr.artifacts,
      mr.reasoningProvider,
      mr.planningProvider,
      cciValidationBridge as any,
      mockAutoDebugLoop()
    );
    const req = await service.createChangeRequest({ userId: "u1", title: "T", requestedGoal: "fix backend api" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "x" });
    const labels = realtime.emitMalvOrchestration.mock.calls.map((c) => c[1]?.label ?? c[1]?.intelStage);
    expect(labels.some((l: string) => typeof l === "string" && l.includes("dependency"))).toBe(true);
    expect(labels.some((l: string) => typeof l === "string" && l.includes("impact"))).toBe(true);
  });

  it("frontend workflow without visual strategy fails at planning gate", async () => {
    const requests = makeRepo<any>();
    const audits = makeRepo<any>();
    const plans = makeRepo<any>();
    const runs = makeRepo<any>();
    const verifications = makeRepo<any>();
    const reviews = makeRepo<any>();
    const realtime = { emitMalvOrchestration: jest.fn() };
    const auditSvc = {
      audit: jest.fn(() => ({
        summary: "x",
        impactedAreas: { frontend: true, backend: false, dtoSchema: false, authPermissions: false, realtimeEvents: false, tests: true, dbMigrations: false, configEnv: false },
        relatedFiles: [],
        impactedFiles: ["apps/web/src/x.tsx"],
        upstreamDependencies: [],
        downstreamEffects: [],
        dependencyGraph: { moduleEdgeSample: [], fileEdgeSample: [], symbolEdgeSample: [], cacheKey: "", generatedAt: 0, scanRoots: [], fileCount: 0, edgeCount: 0 },
        impactAnalysis: { summary: "", mayBreakIfChanged: [], dependentModules: [], regressionTesting: [] },
        impactIntelligence: { summary: "", mayBreakIfChanged: [], dependentModules: [], regressionTesting: [], directlyTouchedFiles: [], dependentFiles: [], contractsAtRisk: [], testsRecommended: [], userFacingFlowsLikely: [], authRealtimeSecurityIntersections: [], migrationsConfigEnvSurfaces: [] },
        repoPatterns: { duplicateLogicHints: [], similarPatterns: [], saferExtensionPoints: [] },
        extensionIntelligence: { idealPlugInPoints: [], similarPatterns: [], duplicationWarnings: [], saferExtensionPoints: [], riskyPatchPoints: [], layerHints: { primary: "x", alternates: [], rationale: "" } },
        scopeClassification: { minimalLocalized: true, crossModule: false, contractChanging: false, dataModelChanging: false, securitySensitive: false, uxSensitive: true, performanceSensitive: false, rationale: [] },
        architectureNotes: "",
        riskNotes: "",
        securityNotes: ""
      }))
    };
    const planningSvc = {
      createPlan: jest.fn(() => ({
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
        verificationPreview: { whatToVerify: [], likelyBreakage: [], mostRelevantTests: [], cannotProveAutomatically: [] },
        visualStrategy: null,
        frontendDesignAudit: null,
        filesToModify: ["a"],
        filesToCreate: [],
        migrationsRequired: false,
        testPlan: "",
        rollbackNotes: "",
        approvalRequired: false,
        trustLevel: "safe",
        scopeComplexity: "low"
      }))
    };
    const mr = modelReadinessTestDeps();
    const cciValidationBridge = { maybeRunPostImplementationValidation: jest.fn().mockResolvedValue(null) };
    const service = new CodeChangeIntelligenceService(
      requests as any,
      audits as any,
      plans as any,
      runs as any,
      verifications as any,
      reviews as any,
      auditSvc as any,
      planningSvc as any,
      new ChangeVerificationService(),
      patchReviewServiceForTests(),
      new CodeGraphService(),
      new BugDetectionService(),
      new PerformanceIntelligenceService(),
      new FixPlanningService(),
      mockIntelligenceLearning(),
      realtime as any,
      { emitBestEffort: jest.fn() } as any,
      mr.gate,
      mr.artifacts,
      mr.reasoningProvider,
      mr.planningProvider,
      cciValidationBridge as any,
      mockAutoDebugLoop()
    );
    const req = await service.createChangeRequest({ userId: "u1", title: "UI", requestedGoal: "ui" });
    await expect(service.runWorkflow({ changeRequestId: req.id, filesChanged: [], patchSummary: "x" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("implementation cannot run without a plan artifact", async () => {
    const requests = makeRepo<any>();
    const mr = modelReadinessTestDeps();
    const cciValidationBridge = { maybeRunPostImplementationValidation: jest.fn().mockResolvedValue(null) };
    const service = new CodeChangeIntelligenceService(
      requests as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      new CodebaseAuditService(new CodeGraphService()),
      createChangePlanningService(),
      new ChangeVerificationService(),
      patchReviewServiceForTests(),
      new CodeGraphService(),
      new BugDetectionService(),
      new PerformanceIntelligenceService(),
      new FixPlanningService(),
      mockIntelligenceLearning(),
      { emitMalvOrchestration: jest.fn() } as any,
      { emitBestEffort: jest.fn() } as any,
      mr.gate,
      mr.artifacts,
      mr.reasoningProvider,
      mr.planningProvider,
      cciValidationBridge as any,
      mockAutoDebugLoop()
    );
    const req = await service.createChangeRequest({ userId: "u1", title: "T", requestedGoal: "x" });
    await expect(
      service.runImplementation({ request: { ...req, status: "queued" } as any, filesChanged: [], patchSummary: "x", sandboxRunId: null })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

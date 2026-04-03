import { BadRequestException } from "@nestjs/common";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";
import { CodebaseAuditService } from "./codebase-audit.service";
import { CodeGraphService } from "./code-graph.service";
import { ChangeVerificationService } from "./change-verification.service";
import { createChangePlanningService } from "./change-planning-wiring";
import { patchReviewServiceForTests } from "./patch-review-test-utils";
import { BugDetectionService } from "./bug-detection.service";
import { PerformanceIntelligenceService } from "./performance-intelligence.service";
import { FixPlanningService } from "./fix-planning.service";
import type { IntelligenceLearningService } from "./intelligence-learning.service";
import { modelReadinessTestDeps } from "./model-readiness/model-readiness.spec-helpers";
import { CciAutoDebugLoopService } from "./cci-auto-debug-loop.service";

function mockIntelligenceLearning(): IntelligenceLearningService {
  return { recordPipelineCompletionBestEffort: jest.fn().mockResolvedValue(undefined) } as unknown as IntelligenceLearningService;
}

function makeRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  return {
    rows,
    create: jest.fn((input: T) => ({ ...input })),
    save: jest.fn(async (input: T) => {
      const row = { ...input } as T;
      if (!row.id) (row as any).id = `id-${rows.length + 1}`;
      const idx = rows.findIndex((r) => r.id === row.id);
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

describe("CodeChangeIntelligenceService", () => {
  function build() {
    const requests = makeRepo<any>();
    const audits = makeRepo<any>();
    const plans = makeRepo<any>();
    const runs = makeRepo<any>();
    const verifications = makeRepo<any>();
    const reviews = makeRepo<any>();
    const realtime = { emitMalvOrchestration: jest.fn() };
    const securityEvents = { emitBestEffort: jest.fn() };
    const mr = modelReadinessTestDeps();
    const cciValidationBridge = { maybeRunPostImplementationValidation: jest.fn().mockResolvedValue(null) };
    const cciAutoDebugLoop = new CciAutoDebugLoopService();
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
      securityEvents as any,
      mr.gate,
      mr.artifacts,
      mr.reasoningProvider,
      mr.planningProvider,
      cciValidationBridge as any,
      cciAutoDebugLoop
    );
    return { service, requests, audits, plans, runs, verifications, reviews, realtime, cciValidationBridge };
  }

  it("creating a change request runs audit stage first on workflow", async () => {
    const { service, realtime } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
    const statuses = realtime.emitMalvOrchestration.mock.calls.map((c) => c[1]?.status);
    expect(statuses).toContain("auditing");
    expect(statuses.indexOf("auditing")).toBeLessThan(statuses.indexOf("planning"));
  });

  it("implementation stage cannot begin without a recorded plan", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
    await expect(
      service.runImplementation({ request: req as any, filesChanged: [], patchSummary: "x", sandboxRunId: null })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("verification stage records proven vs unproven areas", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Safe", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["a.ts"], patchSummary: "small patch" });
    const detail = await service.getRequestDetail(req.id);
    expect(detail.verification?.provenSafeAreas).toBeTruthy();
    expect(detail.verification?.unprovenAreas).toBeTruthy();
  });

  it("patch review can attach issues and fixes to a change request", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Patch", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["a.ts"], patchSummary: "" });
    const detail = await service.getRequestDetail(req.id);
    expect(Array.isArray(detail.review?.issuesFound)).toBe(true);
    expect((detail.review?.issuesFound ?? []).length).toBeGreaterThan(0);
    expect((detail.review?.issuesFixed ?? []).length).toBeGreaterThan(0);
  });

  it("sensitive and critical changes are classified correctly", async () => {
    const { service } = build();
    const sensitive = await service.createChangeRequest({
      userId: "u1",
      title: "Auth",
      requestedGoal: "fix auth permissions for role guard"
    });
    const sensOut = await service.runWorkflow({ changeRequestId: sensitive.id, filesChanged: [], patchSummary: "x" });
    expect(sensOut.request.trustLevel).toBe("sensitive");
    const critical = await service.createChangeRequest({
      userId: "u1",
      title: "Env",
      requestedGoal: "update env config and secret settings"
    });
    const critOut = await service.runWorkflow({ changeRequestId: critical.id, filesChanged: [], patchSummary: "x" });
    expect(critOut.request.trustLevel).toBe("critical");
  });

  it("workflow status transitions are valid and auditable", async () => {
    const { service, requests } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Flow", requestedGoal: "fix backend bug" });
    const out = await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["a.ts"], patchSummary: "patched" });
    expect(out.request.status).toBe("completed");
    expect((requests.rows[0] as any).status).toBe("completed");
  });

  it("websocket progress events reflect backend stage transitions", async () => {
    const { service, realtime } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Flow", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["a.ts"], patchSummary: "patched" });
    const labels = realtime.emitMalvOrchestration.mock.calls.map((c) => c[1]?.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Auditing codebase",
        "Building dependency graph",
        "Analyzing impact",
        "Building plan",
        "Building implementation plan",
        "Implementing changes",
        "Verifying",
        "Verifying code",
        "Reviewing patch",
        "Reviewing engineering quality",
        "Reviewing design quality (structured UI critique)",
        "Reviewing rendered UI + product UX (optional; skipped if preview unavailable)",
        "Completed"
      ])
    );
  });

  it("final result JSON includes rendered review fields (honest defaults when unavailable)", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "R", requestedGoal: "fix backend bug" });
    const out = await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["a.ts"], patchSummary: "patch" });
    const fr = out.request.finalResultJson as Record<string, unknown>;
    expect(fr).toHaveProperty("renderedReviewAvailable", false);
    expect(fr).toHaveProperty("visualQualityScore", null);
    expect(fr).toHaveProperty("renderedCritiqueSummary", null);
    expect(fr).toHaveProperty("reviewedStates");
    expect(Array.isArray(fr.reviewedStates)).toBe(true);
    expect(fr).toHaveProperty("stateCoverageSummary");
    expect(fr).toHaveProperty("stateAwareDesignRisks");
    expect(fr).toHaveProperty("uxScenarioSimulationSummary");
    expect(fr).toHaveProperty("uxQualityScore");
    expect(fr).toHaveProperty("userExperienceSummary");
    expect(fr).toHaveProperty("frictionAnalysis");
    expect(fr).toHaveProperty("usabilityIssues");
    expect(fr).toHaveProperty("frictionPoints");
    expect(fr).toHaveProperty("malvModelReadiness");
    expect(fr.malvModelReadiness && typeof fr.malvModelReadiness).toBe("object");
    expect(fr).toHaveProperty("autoDebugAttempted");
    expect(fr).toHaveProperty("autoDebugAttempts");
    expect(fr).toHaveProperty("autoDebugOutcome");
    expect(fr).toHaveProperty("autoDebugFailuresSeen");
    expect(fr).toHaveProperty("autoDebugSummary");
    expect(fr).toHaveProperty("autoDebugEnhanced");
  });

  it("auto-debug disabled: does not retry verification", async () => {
    const prev = process.env.MALV_CCI_AUTO_DEBUG_LOOP;
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "0";
    try {
      const { service, cciValidationBridge } = build();
      const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
      await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
      expect(cciValidationBridge.maybeRunPostImplementationValidation).toHaveBeenCalledTimes(1);
    } finally {
      process.env.MALV_CCI_AUTO_DEBUG_LOOP = prev;
    }
  });

  it("auto-debug retries once for failed workspace typecheck evidence", async () => {
    const prev = process.env.MALV_CCI_AUTO_DEBUG_LOOP;
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "1";
    try {
      const { service, cciValidationBridge, runs } = build();
      cciValidationBridge.maybeRunPostImplementationValidation
        .mockResolvedValueOnce({
          typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type errors", stderrSnippet: "TS2322" },
          lint: { status: "passed", command: "eslint .", exitCode: 0, summary: "OK" },
          tests: { status: "passed", command: "jest", exitCode: 0, summary: "OK" }
        })
        .mockResolvedValueOnce({
          typecheck: { status: "passed", command: "tsc --noEmit", exitCode: 0, summary: "OK" },
          lint: { status: "passed", command: "eslint .", exitCode: 0, summary: "OK" },
          tests: { status: "passed", command: "jest", exitCode: 0, summary: "OK" }
        });
      const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
      const out = await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
      expect(cciValidationBridge.maybeRunPostImplementationValidation).toHaveBeenCalledTimes(2);
      expect(runs.rows.length).toBeGreaterThanOrEqual(2);
      const fr = out.request.finalResultJson as Record<string, unknown>;
      expect(fr.autoDebugAttempted).toBe(true);
      expect(fr.autoDebugOutcome).toBe("passed");
      expect((fr.autoDebugEnhanced as { attempts?: number })?.attempts).toBeGreaterThanOrEqual(1);
    } finally {
      process.env.MALV_CCI_AUTO_DEBUG_LOOP = prev;
    }
  });

  it("auto-debug stops on no improvement", async () => {
    const prev = process.env.MALV_CCI_AUTO_DEBUG_LOOP;
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "1";
    try {
      const { service, cciValidationBridge } = build();
      cciValidationBridge.maybeRunPostImplementationValidation
        .mockResolvedValueOnce({
          typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type errors", stderrSnippet: "error TS2322" }
        })
        .mockResolvedValueOnce({
          typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type errors", stderrSnippet: "error TS2322" }
        });
      const req = await service.createChangeRequest({ userId: "u1", title: "No Improve", requestedGoal: "fix backend bug" });
      const out = await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
      const fr = out.request.finalResultJson as Record<string, unknown>;
      const enhanced = fr.autoDebugEnhanced as { stoppedReason?: string };
      expect(fr.autoDebugOutcome).toBe("failed");
      expect(enhanced.stoppedReason).toBe("no_improvement");
    } finally {
      process.env.MALV_CCI_AUTO_DEBUG_LOOP = prev;
    }
  });

  it("auto-debug stops on regression", async () => {
    const prev = process.env.MALV_CCI_AUTO_DEBUG_LOOP;
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "1";
    process.env.MALV_CCI_AUTO_DEBUG_LOOP_MAX_ATTEMPTS = "2";
    try {
      const { service, cciValidationBridge } = build();
      cciValidationBridge.maybeRunPostImplementationValidation
        .mockResolvedValueOnce({
          typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type errors", stderrSnippet: "error TS2322" }
        })
        .mockResolvedValueOnce({
          typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type errors", stderrSnippet: "error TS2322 error TS1005 error TS2741" },
          lint: { status: "failed", command: "eslint .", exitCode: 1, summary: "Lint errors", stderrSnippet: "error no-unused-vars" }
        });
      const req = await service.createChangeRequest({ userId: "u1", title: "Regress", requestedGoal: "fix backend bug" });
      const out = await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
      const enhanced = (out.request.finalResultJson as Record<string, unknown>).autoDebugEnhanced as { stoppedReason?: string };
      expect(enhanced.stoppedReason).toBe("regression_detected");
    } finally {
      process.env.MALV_CCI_AUTO_DEBUG_LOOP = prev;
      delete process.env.MALV_CCI_AUTO_DEBUG_LOOP_MAX_ATTEMPTS;
    }
  });

  it("persists malvModelReadiness on audit and plan rows for future model comparison", async () => {
    const { service, audits, plans } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "R", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patch" });
    const auditRow = audits.rows[audits.rows.length - 1];
    const repo = auditRow?.repoIntelligence as Record<string, unknown> | undefined;
    expect(repo?.malvModelReadiness).toBeTruthy();
    expect((repo?.malvModelReadiness as { assistMode?: string }).assistMode).toBe("heuristic_only");
    const planRow = plans.rows[plans.rows.length - 1];
    const intel = planRow?.planIntelligence as Record<string, unknown> | undefined;
    expect(intel?.malvModelReadiness).toBeTruthy();
  });

  it("direct implement-immediately path is blocked", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Hotfix", requestedGoal: "fix bug properly" });
    await expect(
      service.runImplementation({
        request: { ...req, status: "queued" } as any,
        filesChanged: ["x.ts"],
        patchSummary: "quick patch",
        sandboxRunId: null
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("verification marks typecheck as not_run (truthful status)", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
    const detail = await service.getRequestDetail(req.id);
    const checks = detail.verification?.checksPerformed as Array<{ type: string; status?: string }>;
    expect(checks.find((c) => c.type === "typecheck_impact_review")?.status).toBe("not_run");
  });

  it("persists planExecutionCoherence on verification quality", async () => {
    const { service } = build();
    const req = await service.createChangeRequest({ userId: "u1", title: "Fix", requestedGoal: "fix backend bug" });
    await service.runWorkflow({ changeRequestId: req.id, filesChanged: ["apps/api/src/a.ts"], patchSummary: "patched bug" });
    const detail = await service.getRequestDetail(req.id);
    const q = detail.verification?.quality as { planExecutionCoherence?: { alignment?: string } } | undefined;
    expect(q?.planExecutionCoherence?.alignment).toBeDefined();
  });

  it("strictPlanCoherence: true rejects empty filesChanged when plan lists file targets", async () => {
    const { service } = build();
    const probe = await service.createChangeRequest({
      userId: "u1",
      title: "Probe",
      requestedGoal: "fix backend bug in API controllers"
    });
    const probeOut = await service.runWorkflow({
      changeRequestId: probe.id,
      filesChanged: ["apps/api/src/a.ts"],
      patchSummary: "probe"
    });
    const n =
      (probeOut.plan.filesToModify?.length ?? 0) + (probeOut.plan.filesToCreate?.length ?? 0);
    if (n === 0) return;

    const req = await service.createChangeRequest({
      userId: "u1",
      title: "Strict",
      requestedGoal: "fix backend bug in API controllers"
    });
    await expect(
      service.runWorkflow({
        changeRequestId: req.id,
        filesChanged: [],
        patchSummary: "x",
        strictPlanCoherence: true
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

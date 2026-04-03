import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ChangeRequestEntity,
  type ChangeRequestPriority,
  type ChangeRequestStatus,
  type ChangeTrustLevel
} from "../db/entities/change-request.entity";
import { ChangeAuditEntity } from "../db/entities/change-audit.entity";
import { ChangePlanEntity } from "../db/entities/change-plan.entity";
import { ChangeExecutionRunEntity } from "../db/entities/change-execution-run.entity";
import { ChangeVerificationReportEntity } from "../db/entities/change-verification-report.entity";
import { ChangePatchReviewEntity } from "../db/entities/change-patch-review.entity";
import { CodebaseAuditService } from "./codebase-audit.service";
import { ChangePlanningService } from "./change-planning.service";
import { ChangeVerificationService } from "./change-verification.service";
import { PatchReviewService } from "./patch-review.service";
import type {
  ChangeAuditResult,
  ChangePatchReviewResult,
  ChangePlanResult,
  PlanExecutionCoherence
} from "./change-intelligence.types";
import { MalvModelAssistGateService } from "./model-readiness/malv-model-assist.gate.service";
import { MalvIntelligenceArtifactService } from "./model-readiness/malv-intelligence-artifact.service";
import type { MalvIntelligencePhase } from "./model-readiness/malv-model-assist.types";
import {
  MALV_PLANNING_PROVIDER,
  MALV_REASONING_PROVIDER,
  type MalvPlanningProvider,
  type MalvReasoningProvider
} from "./model-readiness/malv-intelligence-providers";
import { isFrontendRepoPath } from "./frontend-repo-paths";
import { CodeGraphService } from "./code-graph.service";
import { BugDetectionService } from "./bug-detection.service";
import { PerformanceIntelligenceService } from "./performance-intelligence.service";
import { FixPlanningService } from "./fix-planning.service";
import { IntelligenceLearningService } from "./intelligence-learning.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SecurityEventService } from "../security/security-event.service";
import {
  isCciStrictPlanCoherenceEnabled,
  shouldBlockStrictPlanExecution,
  validateExecutionMatchesPlan
} from "./plan-execution-coherence";
import { CciValidationExecutionBridge } from "./cci-validation-execution.bridge";
import { CciAutoDebugLoopService, type AutoDebugLoopMetadata } from "./cci-auto-debug-loop.service";

@Injectable()
export class CodeChangeIntelligenceService {
  private readonly transitions: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
    queued: ["auditing", "blocked", "failed"],
    auditing: ["planning", "blocked", "failed"],
    planning: ["implementing", "blocked", "failed"],
    implementing: ["verifying", "blocked", "failed"],
    verifying: ["reviewing", "blocked", "failed"],
    reviewing: ["completed", "blocked", "failed"],
    completed: [],
    blocked: ["planning", "failed"],
    failed: []
  };

  constructor(
    @InjectRepository(ChangeRequestEntity) private readonly requests: Repository<ChangeRequestEntity>,
    @InjectRepository(ChangeAuditEntity) private readonly audits: Repository<ChangeAuditEntity>,
    @InjectRepository(ChangePlanEntity) private readonly plans: Repository<ChangePlanEntity>,
    @InjectRepository(ChangeExecutionRunEntity) private readonly executionRuns: Repository<ChangeExecutionRunEntity>,
    @InjectRepository(ChangeVerificationReportEntity) private readonly verificationReports: Repository<ChangeVerificationReportEntity>,
    @InjectRepository(ChangePatchReviewEntity) private readonly patchReviews: Repository<ChangePatchReviewEntity>,
    private readonly auditService: CodebaseAuditService,
    private readonly planningService: ChangePlanningService,
    private readonly verificationService: ChangeVerificationService,
    private readonly patchReviewService: PatchReviewService,
    private readonly codeGraph: CodeGraphService,
    private readonly bugDetection: BugDetectionService,
    private readonly performanceIntel: PerformanceIntelligenceService,
    private readonly fixPlanning: FixPlanningService,
    private readonly intelligenceLearning: IntelligenceLearningService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly securityEvents: SecurityEventService,
    private readonly modelAssistGate: MalvModelAssistGateService,
    private readonly intelligenceArtifacts: MalvIntelligenceArtifactService,
    @Inject(MALV_REASONING_PROVIDER) private readonly reasoningProvider: MalvReasoningProvider,
    @Inject(MALV_PLANNING_PROVIDER) private readonly planningProvider: MalvPlanningProvider,
    private readonly cciValidationBridge: CciValidationExecutionBridge,
    private readonly cciAutoDebugLoop: CciAutoDebugLoopService
  ) {}

  async createChangeRequest(args: {
    userId: string;
    workspaceId?: string | null;
    sourceMessageId?: string | null;
    title: string;
    requestedGoal: string;
    priority?: ChangeRequestPriority;
  }) {
    const row = this.requests.create({
      user: { id: args.userId } as any,
      workspace: args.workspaceId ? ({ id: args.workspaceId } as any) : null,
      sourceMessageId: args.sourceMessageId ?? null,
      title: args.title.trim().slice(0, 200),
      requestedGoal: args.requestedGoal.trim(),
      status: "queued",
      priority: args.priority ?? "normal",
      trustLevel: "controlled",
      approvalRequired: false
    });
    await this.requests.save(row);
    await this.emitStage(row, "queued", "Queued");
    return row;
  }

  async runWorkflow(args: {
    changeRequestId: string;
    filesChanged?: string[];
    patchSummary?: string;
    sandboxRunId?: string | null;
    requestedBy?: string;
    /** When set, overrides env-based strict plan/execution blocking. */
    strictPlanCoherence?: boolean;
  }) {
    const request = await this.requireRequest(args.changeRequestId);
    const audit = await this.runAudit(request);
    const planRow = await this.runPlanning(request);
    const planReloaded = await this.plans.findOne({
      where: { changeRequest: { id: request.id } },
      order: { createdAt: "DESC" }
    });
    const planForTargets = planReloaded ?? planRow;
    const planSnapshot = planForTargets.planIntelligence as unknown as ChangePlanResult | null | undefined;
    const filesToModifyForCoherence =
      planForTargets.filesToModify?.length ? planForTargets.filesToModify : planSnapshot?.filesToModify ?? [];
    const filesToCreateForCoherence =
      planForTargets.filesToCreate?.length ? planForTargets.filesToCreate : planSnapshot?.filesToCreate ?? [];
    const planExecutionCoherence = validateExecutionMatchesPlan({
      filesChanged: args.filesChanged ?? [],
      filesToModify: filesToModifyForCoherence,
      filesToCreate: filesToCreateForCoherence
    });
    const strictCoherence =
      args.strictPlanCoherence !== undefined ? args.strictPlanCoherence : isCciStrictPlanCoherenceEnabled();
    if (strictCoherence && shouldBlockStrictPlanExecution(planExecutionCoherence)) {
      throw new BadRequestException(
        planExecutionCoherence.warnings.join(" ") || "Plan execution coherence rejected under strict mode."
      );
    }
    if (planRow.approvalRequired && !request.approvedAt) {
      await this.transition(request, "blocked", "Awaiting approval");
      return { request, audit, plan: planRow, blocked: true };
    }
    let execution = await this.runImplementation({
      request,
      filesChanged: args.filesChanged ?? [],
      patchSummary: args.patchSummary ?? "No patch summary provided.",
      sandboxRunId: args.sandboxRunId ?? null
    });
    let verification = await this.runVerification(request, execution.filesChanged, planExecutionCoherence);
    const autoDebugMeta = await this.runAutoDebugLoop({
      request,
      plan: planSnapshot ?? null,
      audit,
      execution,
      verification,
      planExecutionCoherence,
      sandboxRunId: args.sandboxRunId ?? null
    });
    execution = autoDebugMeta.execution;
    verification = autoDebugMeta.verification;
    const review = await this.runPatchReview(request, execution, verification);

    const planIntel = planRow.planIntelligence as unknown as ChangePlanResult | null | undefined;
    const auditRepo = audit.repoIntelligence as Record<string, unknown> | null | undefined;
    const impactSummary =
      (auditRepo?.impactIntelligence as { summary?: string } | undefined)?.summary ?? audit.summary;

    const vq = verification.quality as { designConfidence?: string; engineeringConfidence?: string } | null;
    const patchMeta = review.reviewMetadata as {
      adjustedDesignConfidence?: string;
      designQualityScore?: number | null;
      designCritiqueSummary?: string | null;
      improvementSuggestions?: string[];
      visualQualityScore?: number | null;
      renderedReviewAvailable?: boolean;
      renderedCritiqueSummary?: string | null;
      renderedReviewSkipReason?: string | null;
      reviewedStates?: Array<Record<string, unknown>>;
      stateCoverageSummary?: string | null;
      stateAwareDesignRisks?: string | null;
      uxScenarioSimulationSummary?: string | null;
      uxQualityScore?: number | null;
      userExperienceSummary?: string | null;
      frictionAnalysis?: string | null;
      usabilityIssues?: Array<Record<string, unknown>>;
      frictionPoints?: string[];
      malvModelReadiness?: Record<string, unknown>;
    } | null;
    const designConfidenceFinal =
      patchMeta?.adjustedDesignConfidence && patchMeta.adjustedDesignConfidence !== "n/a"
        ? patchMeta.adjustedDesignConfidence
        : vq?.designConfidence ?? null;

    const touchesWeb = execution.filesChanged.some((f) => isFrontendRepoPath(f.replace(/\\/g, "/")));
    const renderedUnprovenNote =
      touchesWeb && !patchMeta?.renderedReviewAvailable
        ? `Rendered UI critique unproven${patchMeta?.renderedReviewSkipReason ? ` (${patchMeta.renderedReviewSkipReason})` : ""}.`
        : "";
    const whatWasNotFullyProvenMerged = [verification.unprovenAreas, renderedUnprovenNote].filter(Boolean).join(" ").trim();

    const vs = planIntel?.visualStrategy;
    request.finalResultJson = {
      requestSummary: { id: request.id, title: request.title, goal: request.requestedGoal },
      architectureAuditSummary: audit.summary,
      impactSummary,
      implementationPlanSummary: planRow.planSummary,
      visualDesignSummary: vs
        ? `${vs.visualDirection} ${vs.layoutStrategy?.slice(0, 400) ?? ""} ${vs.animationStrategy?.slice(0, 400) ?? vs.animationPlan}`.slice(
            0,
            2000
          )
        : null,
      visualDirection: vs?.visualDirection ?? null,
      layoutStrategy: vs?.layoutStrategy ?? null,
      interactionStrategy: vs?.interactionStrategy ?? null,
      animationStrategy: vs?.animationStrategy ?? null,
      filesChanged: execution.filesChanged,
      whatWasVerified: verification.provenSafeAreas,
      whatWasNotFullyProven: whatWasNotFullyProvenMerged || verification.unprovenAreas,
      engineeringConfidence: vq?.engineeringConfidence ?? null,
      designConfidence: designConfidenceFinal,
      designQualityScore: patchMeta?.designQualityScore ?? null,
      designCritiqueSummary: patchMeta?.designCritiqueSummary ?? null,
      improvementSuggestions: patchMeta?.improvementSuggestions ?? [],
      visualQualityScore: patchMeta?.visualQualityScore ?? null,
      renderedReviewAvailable: patchMeta?.renderedReviewAvailable ?? false,
      renderedCritiqueSummary: patchMeta?.renderedCritiqueSummary ?? null,
      reviewedStates: patchMeta?.reviewedStates ?? [],
      stateCoverageSummary: patchMeta?.stateCoverageSummary ?? null,
      stateAwareDesignRisks: patchMeta?.stateAwareDesignRisks ?? null,
      uxScenarioSimulationSummary: patchMeta?.uxScenarioSimulationSummary ?? null,
      uxQualityScore: patchMeta?.uxQualityScore ?? null,
      userExperienceSummary: patchMeta?.userExperienceSummary ?? null,
      frictionAnalysis: patchMeta?.frictionAnalysis ?? null,
      usabilityIssues: patchMeta?.usabilityIssues ?? [],
      frictionPoints: patchMeta?.frictionPoints ?? [],
      scopeComplexity: (verification.quality as { scopeComplexity?: string } | null)?.scopeComplexity ?? null,
      implementationPathRationale: planIntel?.strategyRationale ?? null,
      designFitRationale: planIntel?.designConsiderations ?? null,
      confidenceLevel: request.confidenceLevel,
      verificationValidationGaps: (verification.quality as { validationGaps?: string[] } | null)?.validationGaps ?? [],
      planExecutionCoherence: (verification.quality as { planExecutionCoherence?: unknown } | null)?.planExecutionCoherence ?? null,
      postImplementationWorkspaceValidation:
        (verification.quality as { postImplementationWorkspaceValidation?: unknown } | null)?.postImplementationWorkspaceValidation ?? null,
      autoDebugAttempted: autoDebugMeta.meta.attempted,
      autoDebugAttempts: autoDebugMeta.meta.attempts,
      autoDebugOutcome: autoDebugMeta.meta.outcome,
      autoDebugFailuresSeen: autoDebugMeta.meta.failuresSeen,
      autoDebugSummary: autoDebugMeta.meta.summary,
      autoDebugEnhanced: {
        attempts: autoDebugMeta.meta.attempts,
        failureHistory: autoDebugMeta.meta.failureHistory,
        improvementHistory: autoDebugMeta.meta.improvementHistory,
        strategiesUsed: autoDebugMeta.meta.strategiesUsed,
        finalOutcome: autoDebugMeta.meta.finalOutcome,
        stoppedReason: autoDebugMeta.meta.stoppedReason
      },
      approvalRequired: request.approvalRequired,
      residualRisks: review.residualRisks,
      auditSummary: audit.summary,
      whatChanged: execution.patchSummary,
      malvModelReadiness: patchMeta?.malvModelReadiness ?? null
    };
    request.failureReason = null;
    await this.transition(request, "completed", "Completed");
    await this.intelligenceLearning.recordPipelineCompletionBestEffort({
      changeRequestId: request.id,
      requestedGoal: request.requestedGoal,
      outcome: "success",
      metadata: {
        bugIssues: (auditRepo?.bugDetection as { issues?: unknown[] } | undefined)?.issues?.length ?? 0,
        perfIssues: (auditRepo?.performanceIntel as { issues?: unknown[] } | undefined)?.issues?.length ?? 0,
        fixProposals: (auditRepo?.fixPlan as { items?: unknown[] } | undefined)?.items?.length ?? 0,
        engineeringConfidence: vq?.engineeringConfidence,
        designQualityScore: patchMeta?.designQualityScore ?? null,
        visualQualityScore: patchMeta?.visualQualityScore ?? null,
        uxQualityScore: patchMeta?.uxQualityScore ?? null,
        renderedReviewAvailable: patchMeta?.renderedReviewAvailable ?? false
      }
    });
    return { request, audit, plan: planRow, execution, verification, review, blocked: false };
  }

  async approveForExecution(args: { changeRequestId: string; approver: string }) {
    const request = await this.requireRequest(args.changeRequestId);
    if (!request.approvalRequired) return request;
    request.approvedAt = new Date();
    request.approvedBy = args.approver;
    void this.securityEvents.emitBestEffort({
      eventType: "change_intelligence.approval.granted",
      severity: request.trustLevel === "critical" ? "critical" : "high",
      subsystem: "change_intelligence",
      summary: `Change request ${request.id} approved for execution`,
      details: { changeRequestId: request.id, trustLevel: request.trustLevel, title: request.title },
      actorUserId: args.approver,
      correlationId: request.id
    });
    if (request.status === "blocked") {
      await this.transition(request, "planning", "Approval recorded");
    } else {
      await this.requests.save(request);
    }
    return request;
  }

  /**
   * Creates a change request and runs heuristic audit + planning (no implementation).
   * For chat/orchestrator handoff when patch context is not yet available.
   */
  async createChangeRequestAndRunAuditPlan(args: {
    userId: string;
    workspaceId?: string | null;
    sourceMessageId?: string | null;
    title: string;
    requestedGoal: string;
  }) {
    const request = await this.createChangeRequest({
      userId: args.userId,
      workspaceId: args.workspaceId,
      sourceMessageId: args.sourceMessageId,
      title: args.title,
      requestedGoal: args.requestedGoal
    });
    await this.runAudit(request);
    const planRow = await this.runPlanning(request);
    const auditRow = await this.audits.findOne({
      where: { changeRequest: { id: request.id } },
      order: { createdAt: "DESC" }
    });
    const refreshed = await this.requests.findOne({ where: { id: request.id } });
    const blocked = planRow.approvalRequired && !refreshed?.approvedAt;
    return {
      changeRequestId: request.id,
      auditSummary: auditRow?.summary ?? "",
      planSummary: planRow.planSummary,
      blocked,
      trustLevel: refreshed?.trustLevel ?? request.trustLevel,
      approvalRequired: refreshed?.approvalRequired ?? request.approvalRequired,
      requestStatus: refreshed?.status ?? request.status
    };
  }

  async getRequestDetail(changeRequestId: string) {
    const request = await this.requireRequest(changeRequestId);
    const [audit, plan, executionRun, verification, review] = await Promise.all([
      this.audits.findOne({ where: { changeRequest: { id: changeRequestId } }, order: { createdAt: "DESC" } }),
      this.plans.findOne({ where: { changeRequest: { id: changeRequestId } }, order: { createdAt: "DESC" } }),
      this.executionRuns.findOne({ where: { changeRequest: { id: changeRequestId } }, order: { createdAt: "DESC" } }),
      this.verificationReports.findOne({ where: { changeRequest: { id: changeRequestId } }, order: { createdAt: "DESC" } }),
      this.patchReviews.findOne({ where: { changeRequest: { id: changeRequestId } }, order: { createdAt: "DESC" } })
    ]);
    return { request, audit, plan, executionRun, verification, review };
  }

  async runImplementation(args: {
    request: ChangeRequestEntity;
    filesChanged: string[];
    patchSummary: string;
    sandboxRunId?: string | null;
  }) {
    const plan = await this.plans.findOne({ where: { changeRequest: { id: args.request.id } }, order: { createdAt: "DESC" } });
    if (!plan) {
      throw new BadRequestException("Implementation stage is blocked until a recorded plan exists.");
    }
    await this.transition(args.request, "implementing", "Implementing changes");
    const execution = this.executionRuns.create({
      changeRequest: args.request,
      sandboxRunId: args.sandboxRunId ?? null,
      executionSummary: "Implementation artifacts recorded after plan gate.",
      filesChanged: args.filesChanged,
      patchSummary: args.patchSummary,
      status: "completed"
    });
    await this.executionRuns.save(execution);
    return execution;
  }

  private async runAudit(request: ChangeRequestEntity) {
    await this.transition(request, "auditing", "Auditing codebase");
    await this.emitProgress(request, "Building dependency graph");
    let result = this.auditService.audit({ requestedGoal: request.requestedGoal });
    const auditProducers: Partial<Record<MalvIntelligencePhase, "heuristic" | "model" | "merged">> = {};
    if (this.modelAssistGate.shouldAttemptModelAssist("codebase_audit")) {
      const aug = await this.reasoningProvider.augmentCodebaseAudit({ requestedGoal: request.requestedGoal }, result);
      if (aug) {
        result = aug;
        auditProducers.codebase_audit = "merged";
      }
    }
    await this.emitProgress(request, "Analyzing impact");
    await this.emitProgress(request, "Bug detection & performance intelligence");
    const snap = this.codeGraph.getOrBuildGraph();
    const scopeFiles = result.impactedFiles.slice(0, 48);
    let bugDetection = this.bugDetection.detect(snap.repoRoot, scopeFiles);
    if (this.modelAssistGate.shouldAttemptModelAssist("bug_detection_reasoning")) {
      const b = await this.reasoningProvider.augmentBugDetection({ repoRoot: snap.repoRoot, scopeFiles }, bugDetection);
      if (b) {
        bugDetection = b;
        auditProducers.bug_detection_reasoning = "merged";
      }
    }
    const performanceIntel = this.performanceIntel.analyze(snap.repoRoot, scopeFiles);
    let fixPlan = this.fixPlanning.plan({ bugs: bugDetection, perf: performanceIntel });
    if (this.modelAssistGate.shouldAttemptModelAssist("fix_planning")) {
      const f = await this.reasoningProvider.augmentFixPlanning({ bugs: bugDetection, perf: performanceIntel }, fixPlan);
      if (f) {
        fixPlan = f;
        auditProducers.fix_planning = "merged";
      }
    }
    const malvModelReadiness = this.intelligenceArtifacts.buildAuditPipelineReadiness({
      audit: result,
      bugDetection,
      performanceIntel,
      fixPlan,
      producerByPhase: auditProducers
    });
    const row = this.audits.create({
      changeRequest: request,
      summary: `${result.summary} ${bugDetection.summary} ${performanceIntel.summary}`.trim(),
      impactedAreas: result.impactedAreas,
      relatedFiles: result.relatedFiles,
      architectureNotes: result.architectureNotes,
      riskNotes: result.riskNotes,
      securityNotes: result.securityNotes,
      repoIntelligence: {
        dependencyGraph: result.dependencyGraph,
        impactedFiles: result.impactedFiles,
        upstreamDependencies: result.upstreamDependencies,
        downstreamEffects: result.downstreamEffects,
        impactAnalysis: result.impactAnalysis,
        impactIntelligence: result.impactIntelligence,
        extensionIntelligence: result.extensionIntelligence,
        scopeClassification: result.scopeClassification,
        repoPatterns: result.repoPatterns,
        bugDetection,
        performanceIntel,
        fixPlan,
        intelligencePipeline: {
          directMutationDisallowed: true,
          policy: fixPlan.pipelinePolicy
        },
        malvModelReadiness
      }
    });
    await this.audits.save(row);
    return row;
  }

  private async runPlanning(request: ChangeRequestEntity) {
    await this.transition(request, "planning", "Building plan");
    const audit = await this.audits.findOne({ where: { changeRequest: { id: request.id } }, order: { createdAt: "DESC" } });
    if (!audit) throw new BadRequestException("Planning requires an audit artifact.");
    const repo = audit.repoIntelligence as Record<string, unknown> | null | undefined;
    const merged = this.mergeAuditFromRow(audit, repo);
    await this.emitProgress(request, "Building implementation plan");
    let plan = this.planningService.createPlan({
      requestedGoal: request.requestedGoal,
      audit: merged
    });
    const planningProducers: Partial<Record<MalvIntelligencePhase, "heuristic" | "model" | "merged">> = {};
    if (this.modelAssistGate.shouldAttemptModelAssist("change_planning")) {
      const p = await this.planningProvider.augmentChangePlan(
        { requestedGoal: request.requestedGoal, audit: merged },
        plan
      );
      if (p) {
        plan = p;
        planningProducers.change_planning = "merged";
      }
    }
    if (this.modelAssistGate.shouldAttemptModelAssist("design_strategy")) {
      const d = await this.planningProvider.augmentDesignStrategy(
        { requestedGoal: request.requestedGoal, audit: merged },
        { visualStrategy: plan.visualStrategy, designBrain: plan.designBrain }
      );
      if (d) {
        plan = { ...plan, visualStrategy: d.visualStrategy, designBrain: d.designBrain };
        planningProducers.design_strategy = "merged";
      }
    }
    if (merged.impactedAreas.frontend && (!plan.visualStrategy || !plan.designBrain)) {
      throw new BadRequestException(
        "Frontend change requires design brain output (visual strategy + system scan + composition + motion) — cannot be skipped."
      );
    }
    if (plan.visualStrategy) {
      await this.emitProgress(request, "Building visual strategy");
    }
    request.trustLevel = plan.trustLevel as ChangeTrustLevel;
    request.approvalRequired = plan.approvalRequired;
    await this.requests.save(request);
    const planIntelligence = {
      ...(plan as unknown as Record<string, unknown>),
      malvModelReadiness: this.intelligenceArtifacts.buildPlanningStageReadiness(plan, planningProducers)
    };
    const row = this.plans.create({
      changeRequest: request,
      planSummary: plan.planSummary,
      filesToModify: plan.filesToModify,
      filesToCreate: plan.filesToCreate,
      migrationsRequired: plan.migrationsRequired,
      testPlan: plan.testPlan,
      rollbackNotes: plan.rollbackNotes,
      approvalRequired: plan.approvalRequired,
      planIntelligence
    });
    await this.plans.save(row);
    return row;
  }

  private async runVerification(
    request: ChangeRequestEntity,
    filesChanged: string[],
    planExecutionCoherence: PlanExecutionCoherence | null
  ) {
    await this.transition(request, "verifying", "Verifying");
    await this.emitProgress(request, "Verifying code");
    const planRow = await this.plans.findOne({ where: { changeRequest: { id: request.id } }, order: { createdAt: "DESC" } });
    const auditRow = await this.audits.findOne({ where: { changeRequest: { id: request.id } }, order: { createdAt: "DESC" } });
    const planResult = planRow?.planIntelligence as unknown as ChangePlanResult | null | undefined;
    const auditMerged = auditRow ? this.mergeAuditFromRow(auditRow, auditRow.repoIntelligence as Record<string, unknown> | null) : null;
    const reqForWs = await this.requests.findOne({ where: { id: request.id }, relations: ["workspace"] });
    const workspaceValidation = await this.cciValidationBridge.maybeRunPostImplementationValidation({
      userId: request.user.id,
      workspaceId: reqForWs?.workspace?.id ?? null
    });
    const out = this.verificationService.verify({
      filesChanged,
      plan: planResult ?? null,
      audit: auditMerged,
      planExecutionCoherence,
      postImplementationWorkspaceValidation: workspaceValidation ?? undefined
    });
    const quality = {
      engineeringConfidence: out.engineeringConfidence,
      designConfidence: out.designConfidence,
      scopeComplexity: out.scopeComplexity,
      verificationPlan: out.verificationPlan,
      validationGaps: out.validationGaps ?? [],
      planExecutionCoherence: out.planExecutionCoherence ?? null,
      postImplementationWorkspaceValidation: out.postImplementationWorkspaceValidation ?? workspaceValidation ?? null
    };
    const row = this.verificationReports.create({
      changeRequest: request,
      verificationSummary: out.verificationSummary,
      testsRun: out.testsRun,
      checksPerformed: out.checksPerformed,
      provenSafeAreas: out.provenSafeAreas,
      unprovenAreas: out.unprovenAreas,
      regressionNotes: out.regressionNotes,
      quality
    });
    await this.verificationReports.save(row);
    request.confidenceLevel = out.confidenceLevel;
    await this.requests.save(request);
    return row;
  }

  private async runPatchReview(
    request: ChangeRequestEntity,
    execution: ChangeExecutionRunEntity,
    verification: ChangeVerificationReportEntity
  ) {
    await this.transition(request, "reviewing", "Reviewing patch");
    await this.emitProgress(request, "Reviewing engineering quality");
    await this.emitProgress(request, "Reviewing design quality (structured UI critique)");
    await this.emitProgress(request, "Reviewing rendered UI + product UX (optional; skipped if preview unavailable)");
    const planRow = await this.plans.findOne({ where: { changeRequest: { id: request.id } }, order: { createdAt: "DESC" } });
    const auditRow = await this.audits.findOne({ where: { changeRequest: { id: request.id } }, order: { createdAt: "DESC" } });
    const planResult = planRow?.planIntelligence as unknown as ChangePlanResult | null | undefined;
    const auditMerged = auditRow ? this.mergeAuditFromRow(auditRow, auditRow.repoIntelligence as Record<string, unknown> | null) : null;
    const priorDesign = (verification.quality as { designConfidence?: "low" | "medium" | "high" | "n/a" } | null)?.designConfidence;
    let out: ChangePatchReviewResult = await this.patchReviewService.review({
      filesChanged: execution.filesChanged,
      patchSummary: execution.patchSummary,
      audit: auditMerged,
      plan: planResult ?? null,
      priorDesignConfidence: priorDesign ?? "n/a"
    });
    let patchSynthesisMerged = false;
    if (this.modelAssistGate.shouldAttemptModelAssist("patch_review_synthesis")) {
      const syn = await this.reasoningProvider.augmentPatchReviewSynthesis(
        {
          filesChanged: execution.filesChanged,
          patchSummary: execution.patchSummary,
          audit: auditMerged,
          plan: planResult ?? null
        },
        out
      );
      if (syn) {
        out = syn;
        patchSynthesisMerged = true;
      }
    }
    const patchProducers: Partial<Record<MalvIntelligencePhase, "heuristic" | "model" | "merged">> = {};
    const pr = out.malvPatchReviewPhaseProducers;
    if (pr?.design_critique) patchProducers.design_critique = pr.design_critique;
    if (pr?.rendered_ui_critique) patchProducers.rendered_ui_critique = pr.rendered_ui_critique;
    if (patchSynthesisMerged) patchProducers.patch_review_synthesis = "merged";
    const reviewMetadata = {
      residualEngineeringRisks: out.residualEngineeringRisks,
      residualDesignRisks: out.residualDesignRisks,
      engineeringIssueCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "engineering").length,
      designIssueCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "design").length,
      uxIssueCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "ux").length,
      designQualityScore: out.designQualityScore,
      designCritiqueSummary: out.designCritiqueSummary,
      improvementSuggestions: out.improvementSuggestions,
      designCritiqueDimensions: out.designCritiqueDimensions,
      adjustedDesignConfidence: out.adjustedDesignConfidence,
      codePatternCritique: {
        designQualityScore: out.designQualityScore,
        designCritiqueSummary: out.designCritiqueSummary,
        designCritiqueDimensions: out.designCritiqueDimensions
      },
      renderedCritique: {
        renderedReviewAvailable: out.renderedReviewAvailable,
        visualQualityScore: out.visualQualityScore,
        renderedCritiqueSummary: out.renderedCritiqueSummary,
        renderedReviewSkipReason: out.renderedReviewSkipReason,
        issues: out.renderedCritiqueIssues,
        suggestions: out.renderedCritiqueSuggestions,
        reviewedStates: out.reviewedStates,
        stateCoverageSummary: out.stateCoverageSummary,
        stateAwareDesignRisks: out.stateAwareDesignRisks,
        uxScenarioSimulationSummary: out.uxScenarioSimulationSummary,
        uxQualityScore: out.uxQualityScore,
        userExperienceSummary: out.userExperienceSummary,
        frictionAnalysis: out.frictionAnalysis,
        usabilityIssues: out.usabilityIssues,
        frictionPoints: out.frictionPoints
      },
      visualQualityScore: out.visualQualityScore,
      renderedReviewAvailable: out.renderedReviewAvailable,
      renderedCritiqueSummary: out.renderedCritiqueSummary,
      renderedReviewSkipReason: out.renderedReviewSkipReason,
      reviewedStates: out.reviewedStates,
      stateCoverageSummary: out.stateCoverageSummary,
      stateAwareDesignRisks: out.stateAwareDesignRisks,
      renderedUiCaptureMeta: out.renderedUiCaptureMeta ?? null,
      uxScenarioSimulationSummary: out.uxScenarioSimulationSummary,
      uxQualityScore: out.uxQualityScore,
      userExperienceSummary: out.userExperienceSummary,
      frictionAnalysis: out.frictionAnalysis,
      usabilityIssues: out.usabilityIssues,
      frictionPoints: out.frictionPoints,
      malvModelReadiness: this.intelligenceArtifacts.buildPatchReviewReadiness(out, patchProducers)
    };
    const row = this.patchReviews.create({
      changeRequest: request,
      reviewSummary: out.reviewSummary,
      issuesFound: out.issuesFound,
      issuesFixed: out.issuesFixed,
      residualRisks: out.residualRisks,
      reviewMetadata
    });
    await this.patchReviews.save(row);
    return row;
  }

  private async runAutoDebugLoop(args: {
    request: ChangeRequestEntity;
    plan: ChangePlanResult | null;
    audit: ChangeAuditEntity;
    execution: ChangeExecutionRunEntity;
    verification: ChangeVerificationReportEntity;
    planExecutionCoherence: PlanExecutionCoherence | null;
    sandboxRunId: string | null;
  }): Promise<{ execution: ChangeExecutionRunEntity; verification: ChangeVerificationReportEntity; meta: AutoDebugLoopMetadata }> {
    const metadata: AutoDebugLoopMetadata = {
      attempted: false,
      attempts: 0,
      outcome: "skipped",
      failuresSeen: [],
      summary: "Auto-debug loop skipped.",
      stoppedReason: "feature_disabled",
      attemptsDetail: [],
      failureHistory: [],
      improvementHistory: [],
      strategiesUsed: [],
      finalOutcome: "skipped"
    };
    let execution = args.execution;
    let verification = args.verification;
    for (let attempt = 0; attempt < this.cciAutoDebugLoop.maxAttempts(); attempt++) {
      const currentWs = (verification.quality as { postImplementationWorkspaceValidation?: any } | null)
        ?.postImplementationWorkspaceValidation as any;
      const decision = this.cciAutoDebugLoop.shouldAttemptRetry({
        evidence: currentWs ?? null,
        plan: args.plan,
        audit: (args.audit.repoIntelligence as Record<string, unknown> | null | undefined)
          ? this.mergeAuditFromRow(args.audit, args.audit.repoIntelligence as Record<string, unknown> | null)
          : null,
        trustLevel: args.request.trustLevel,
        planExecutionCoherence: args.planExecutionCoherence,
        filesChanged: execution.filesChanged,
        attempt
      });
      if (!decision.allowed) {
        metadata.outcome = decision.reason === "max_attempts_reached" ? "max_attempts_reached" : "not_eligible";
        metadata.stoppedReason = decision.reason;
        metadata.summary = `Auto-debug not run: ${decision.reason}.`;
        metadata.finalOutcome = metadata.outcome;
        break;
      }
      metadata.attempted = true;
      metadata.attempts += 1;
      metadata.failuresSeen.push(decision.category);
      metadata.failureHistory.push(decision.failureAnalysis);
      metadata.strategiesUsed.push(decision.fixStrategy);
      const evidenceSummary = this.cciAutoDebugLoop.summarizeEvidence(currentWs ?? null);
      const retryPatchSummary = [
        `[auto-debug retry #${attempt + 1}]`,
        `failure=${decision.category}`,
        `strategy=${decision.fixStrategy.strategyType}`,
        `scope=${decision.fixStrategy.targetFiles.join(", ")}`,
        `evidence=${evidenceSummary}`
      ]
        .join(" ")
        .slice(0, 2000);
      execution = await this.recordAutoDebugImplementation({
        request: args.request,
        filesChanged: execution.filesChanged.filter((f) => decision.fixStrategy.targetFiles.includes(f)),
        patchSummary: retryPatchSummary,
        sandboxRunId: args.sandboxRunId
      });
      verification = await this.runVerification(args.request, execution.filesChanged, args.planExecutionCoherence);
      metadata.attemptsDetail.push({
        attempt: attempt + 1,
        category: decision.category,
        summary: evidenceSummary,
        filesInScope: decision.scope,
        failureAnalysis: decision.failureAnalysis,
        fixStrategy: decision.fixStrategy
      });
      const nextWs = (verification.quality as { postImplementationWorkspaceValidation?: any } | null)
        ?.postImplementationWorkspaceValidation as any;
      const improvement = this.cciAutoDebugLoop.compareImprovement(currentWs ?? null, nextWs ?? null);
      const partialSuccess = this.cciAutoDebugLoop.detectPartialSuccess(currentWs ?? null, nextWs ?? null);
      metadata.improvementHistory.push(improvement);
      metadata.attemptsDetail[metadata.attemptsDetail.length - 1].improvementAnalysis = improvement;
      metadata.attemptsDetail[metadata.attemptsDetail.length - 1].partialSuccess = partialSuccess;
      if (nextWs && !this.cciAutoDebugLoop.hasValidationFailure(nextWs)) {
        metadata.outcome = "passed";
        metadata.stoppedReason = "validation_passed_after_retry";
        metadata.summary = `Auto-debug succeeded after ${metadata.attempts} attempt(s).`;
        metadata.finalOutcome = metadata.outcome;
        break;
      }
      if (improvement.regression) {
        metadata.outcome = "failed";
        metadata.stoppedReason = "regression_detected";
        metadata.summary = `Auto-debug stopped after ${metadata.attempts} attempt(s): validation regressed.`;
        metadata.finalOutcome = metadata.outcome;
        break;
      }
      if (!improvement.improved || improvement.unchanged) {
        metadata.outcome = "failed";
        metadata.stoppedReason = "no_improvement";
        metadata.summary = `Auto-debug stopped after ${metadata.attempts} attempt(s): validation did not improve.`;
        metadata.finalOutcome = metadata.outcome;
        break;
      }
      metadata.outcome = "max_attempts_reached";
      metadata.stoppedReason = "max_attempts_reached";
      metadata.summary = `Auto-debug stopped at max attempts (${this.cciAutoDebugLoop.maxAttempts()}).`;
      metadata.finalOutcome = metadata.outcome;
    }
    verification.quality = {
      ...(verification.quality ?? {}),
      ...this.cciAutoDebugLoop.qualityMetadata(metadata)
    };
    await this.verificationReports.save(verification);
    return { execution, verification, meta: metadata };
  }

  private async recordAutoDebugImplementation(args: {
    request: ChangeRequestEntity;
    filesChanged: string[];
    patchSummary: string;
    sandboxRunId: string | null;
  }) {
    const execution = this.executionRuns.create({
      changeRequest: args.request,
      sandboxRunId: args.sandboxRunId ?? null,
      executionSummary: "Auto-debug retry implementation metadata recorded.",
      filesChanged: args.filesChanged,
      patchSummary: args.patchSummary,
      status: "completed"
    });
    await this.executionRuns.save(execution);
    return execution;
  }

  private mergeAuditFromRow(audit: ChangeAuditEntity, repo: Record<string, unknown> | null | undefined): ChangeAuditResult {
    const r = repo ?? {};
    const emptyGraph: ChangeAuditResult["dependencyGraph"] = {
      cacheKey: "",
      generatedAt: 0,
      scanRoots: [],
      fileCount: 0,
      edgeCount: 0,
      symbolEdgeSample: [],
      fileEdgeSample: [],
      moduleEdgeSample: []
    };
    const impactAnalysis =
      (r.impactAnalysis as ChangeAuditResult["impactAnalysis"]) ??
      ({
        summary: "",
        mayBreakIfChanged: [],
        dependentModules: [],
        regressionTesting: []
      } as ChangeAuditResult["impactAnalysis"]);
    const impactIntelligence =
      (r.impactIntelligence as ChangeAuditResult["impactIntelligence"]) ??
      ({
        ...impactAnalysis,
        directlyTouchedFiles: [],
        dependentFiles: [],
        contractsAtRisk: [],
        testsRecommended: impactAnalysis.regressionTesting,
        userFacingFlowsLikely: [],
        authRealtimeSecurityIntersections: [],
        migrationsConfigEnvSurfaces: []
      } as ChangeAuditResult["impactIntelligence"]);
    const extensionIntelligence =
      (r.extensionIntelligence as ChangeAuditResult["extensionIntelligence"]) ??
      ({
        idealPlugInPoints: [],
        similarPatterns: [],
        duplicationWarnings: [],
        saferExtensionPoints: [],
        riskyPatchPoints: [],
        layerHints: { primary: "service", alternates: [], rationale: "" }
      } as ChangeAuditResult["extensionIntelligence"]);
    const scopeClassification =
      (r.scopeClassification as ChangeAuditResult["scopeClassification"]) ??
      ({
        minimalLocalized: true,
        crossModule: false,
        contractChanging: false,
        dataModelChanging: false,
        securitySensitive: false,
        uxSensitive: false,
        performanceSensitive: false,
        rationale: []
      } as ChangeAuditResult["scopeClassification"]);
    return {
      summary: audit.summary,
      impactedAreas: audit.impactedAreas as ChangeAuditResult["impactedAreas"],
      relatedFiles: audit.relatedFiles,
      impactedFiles: (r.impactedFiles as string[]) ?? audit.relatedFiles,
      upstreamDependencies: (r.upstreamDependencies as string[]) ?? [],
      downstreamEffects: (r.downstreamEffects as string[]) ?? [],
      dependencyGraph: (r.dependencyGraph as ChangeAuditResult["dependencyGraph"]) ?? emptyGraph,
      impactAnalysis,
      impactIntelligence,
      repoPatterns: (r.repoPatterns as ChangeAuditResult["repoPatterns"]) ?? {
        duplicateLogicHints: [],
        similarPatterns: [],
        saferExtensionPoints: []
      },
      extensionIntelligence,
      scopeClassification,
      architectureNotes: audit.architectureNotes,
      riskNotes: audit.riskNotes,
      securityNotes: audit.securityNotes,
      bugDetection: (r.bugDetection as ChangeAuditResult["bugDetection"]) ?? null,
      performanceIntel: (r.performanceIntel as ChangeAuditResult["performanceIntel"]) ?? null,
      fixPlan: (r.fixPlan as ChangeAuditResult["fixPlan"]) ?? null
    };
  }

  private async requireRequest(changeRequestId: string) {
    const row = await this.requests.findOne({ where: { id: changeRequestId }, relations: ["user"] });
    if (!row) throw new NotFoundException("Change request not found");
    return row;
  }

  private async transition(request: ChangeRequestEntity, next: ChangeRequestStatus, label: string) {
    const allowed = this.transitions[request.status] ?? [];
    if (!allowed.includes(next) && request.status !== next) {
      throw new BadRequestException(`Invalid status transition ${request.status} -> ${next}`);
    }
    request.status = next;
    await this.requests.save(request);
    await this.emitStage(request, next, label);
  }

  private async emitStage(request: ChangeRequestEntity, status: ChangeRequestStatus, label: string) {
    const userId = request.user?.id ?? (request as any).userId;
    if (!userId) return;
    this.realtime.emitMalvOrchestration(userId, {
      type: "change_intelligence_progress",
      requestId: request.id,
      status,
      label,
      intelStage: label,
      at: Date.now()
    });
  }

  private async emitProgress(request: ChangeRequestEntity, label: string) {
    const userId = request.user?.id ?? (request as any).userId;
    if (!userId) return;
    this.realtime.emitMalvOrchestration(userId, {
      type: "change_intelligence_progress",
      requestId: request.id,
      status: request.status,
      label,
      intelStage: label,
      at: Date.now()
    });
  }
}

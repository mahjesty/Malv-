import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { SandboxRunPolicyBindingEntity } from "../db/entities/sandbox-run-policy-binding.entity";
import { SandboxCommandPolicyDecisionEntity } from "../db/entities/sandbox-command-policy-decision.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { PolicyDefinitionEntity } from "../db/entities/policy-definition.entity";
import { PolicyVersionEntity } from "../db/entities/policy-version.entity";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { VoiceOperatorEventEntity } from "../db/entities/voice-operator-event.entity";
import { ReviewSessionEntity } from "../db/entities/review-session.entity";
import { ReviewFindingEntity } from "../db/entities/review-finding.entity";
import { SandboxTypedActionEntity } from "../db/entities/sandbox-typed-action.entity";
import { SandboxTypedActionPolicyDecisionEntity } from "../db/entities/sandbox-typed-action-policy-decision.entity";
import { RateLimitEventEntity } from "../db/entities/rate-limit-event.entity";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InfraHealthService } from "../infra/infra-health.service";

@Controller("v1/admin")
export class AdminRuntimeController {
  constructor(
    private readonly killSwitch: KillSwitchService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly infraHealth: InfraHealthService,
    @InjectRepository(SandboxRunEntity) private readonly runs: Repository<SandboxRunEntity>,
    @InjectRepository(SandboxCommandRecordEntity) private readonly commands: Repository<SandboxCommandRecordEntity>,
    @InjectRepository(SandboxPatchProposalEntity) private readonly patches: Repository<SandboxPatchProposalEntity>,
    @InjectRepository(SandboxRunPolicyBindingEntity) private readonly bindings: Repository<SandboxRunPolicyBindingEntity>,
    @InjectRepository(SandboxCommandPolicyDecisionEntity) private readonly cmdPolicy: Repository<SandboxCommandPolicyDecisionEntity>,
    @InjectRepository(AiJobLeaseEntity) private readonly leases: Repository<AiJobLeaseEntity>,
    @InjectRepository(PolicyDefinitionEntity) private readonly defs: Repository<PolicyDefinitionEntity>,
    @InjectRepository(PolicyVersionEntity) private readonly vers: Repository<PolicyVersionEntity>,
    @InjectRepository(AiJobEntity) private readonly jobs: Repository<AiJobEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly approvals: Repository<SandboxApprovalRequestEntity>,
    @InjectRepository(VoiceOperatorEventEntity) private readonly voiceEvents: Repository<VoiceOperatorEventEntity>,
    @InjectRepository(ReviewSessionEntity) private readonly reviewSessions: Repository<ReviewSessionEntity>,
    @InjectRepository(ReviewFindingEntity) private readonly reviewFindings: Repository<ReviewFindingEntity>,
    @InjectRepository(SandboxTypedActionEntity) private readonly typedActions: Repository<SandboxTypedActionEntity>,
    @InjectRepository(SandboxTypedActionPolicyDecisionEntity) private readonly typedActionPolicy: Repository<SandboxTypedActionPolicyDecisionEntity>,
    @InjectRepository(RateLimitEventEntity) private readonly rateLimitEvents: Repository<RateLimitEventEntity>
  ) {}

  private isAdmin(req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    return auth?.role === "admin";
  }

  @Get("runtime/runs/:sandboxRunId")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.runtime.read")
  @RateLimit({ key: "admin.runtime.read", limit: 60, windowSeconds: 60 })
  async getRun(@Req() req: Request, @Param("sandboxRunId") sandboxRunId: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const run = await this.runs.findOne({ where: { id: sandboxRunId }, relations: ["user", "workspace"] });
    if (!run) return { ok: false, error: "Run not found" };
    const binding = await this.bindings.findOne({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      relations: ["policyDefinition", "policyVersion"]
    });
    return { ok: true, run, policyBinding: binding };
  }

  @Get("runtime/runs/:sandboxRunId/replay")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.runtime.replay")
  @RateLimit({ key: "admin.runtime.replay", limit: 40, windowSeconds: 60 })
  async getRunReplay(@Req() req: Request, @Param("sandboxRunId") sandboxRunId: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const run = await this.runs.findOne({ where: { id: sandboxRunId }, relations: ["workspace"] });
    if (!run) return { ok: false, error: "Run not found" };
    const commandHistory = await this.commands.find({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      order: { stepIndex: "ASC", createdAt: "ASC" }
    });
    const policyDecisions = await this.cmdPolicy.find({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      relations: ["sandboxCommandRecord"],
      order: { createdAt: "ASC" }
    });
    const patchHistory = await this.patches.find({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      order: { createdAt: "ASC" }
    });
    const typedActions = await this.typedActions.find({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      relations: ["primaryCommandRecord"],
      order: { stepIndex: "ASC", createdAt: "ASC" }
    });
    const typedPolicy = await this.typedActionPolicy.find({
      where: { sandboxRun: { id: sandboxRunId } } as any,
      relations: ["sandboxTypedAction"],
      order: { createdAt: "ASC" }
    });
    const timeline = [
      ...commandHistory.map((c) => ({
        type: "command_step",
        eventId: c.id,
        stepIndex: c.stepIndex,
        status: c.status,
        ts: c.createdAt,
        payload: {
          commandClass: c.commandClass,
          commandText: c.commandText,
          normalizedCommand: c.parsedResult?.normalizedCommand ?? null,
          exitCode: c.exitCode,
          stdout: c.stdoutText,
          stderr: c.stderrText
        }
      })),
      ...policyDecisions.map((p) => ({
        type: "policy_decision",
        eventId: p.id,
        stepIndex: p.sandboxCommandRecord?.stepIndex ?? null,
        status: p.decision,
        ts: p.createdAt,
        payload: {
          commandClass: p.commandCategory,
          riskLevel: p.riskLevel,
          decision: p.decision,
          reason: p.decisionReason,
          requiresApproval: p.decision === "require_approval"
        }
      })),
      ...patchHistory.map((p) => ({
        type: "patch",
        eventId: p.id,
        stepIndex: null,
        status: p.status,
        ts: p.createdAt,
        payload: {
          summary: p.summary,
          reviewedBy: p.reviewedBy,
          reviewedAt: p.reviewedAt,
          appliedAt: p.appliedAt,
          applyError: p.applyError
        }
      })),
      ...typedActions.map((a) => ({
        type: "typed_action",
        eventId: a.id,
        stepIndex: a.stepIndex,
        status: a.status,
        ts: a.createdAt,
        payload: {
          actionType: a.actionType,
          scopeType: a.scopeType,
          scopeRef: a.scopeRef,
          parameters: a.normalizedParametersJson ?? a.parametersJson,
          outputSummary: a.outputSummary,
          primaryCommandRecordId: (a.primaryCommandRecord as any)?.id ?? null
        }
      })),
      ...typedPolicy.map((p) => ({
        type: "typed_action_policy_decision",
        eventId: p.id,
        stepIndex: (p.sandboxTypedAction as any)?.stepIndex ?? null,
        status: p.decision,
        ts: p.createdAt,
        payload: {
          requestedActionType: p.requestedActionType,
          actionCategory: p.actionCategory,
          riskLevel: p.riskLevel,
          reason: p.decisionReason,
          matchedRuleId: p.matchedRuleId,
          rewrittenParameters: p.rewrittenParametersJson ?? null
        }
      }))
    ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return {
      ok: true,
      run: {
        id: run.id,
        status: run.status,
        runType: run.runType,
        workspaceId: (run as any).workspace?.id ?? null,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt ?? null
      },
      timeline,
      summary: {
        commandSteps: commandHistory.length,
        typedActions: typedActions.length,
        typedActionPolicyDecisions: typedPolicy.length,
        policyDecisions: policyDecisions.length,
        patchEvents: patchHistory.length
      }
    };
  }

  @Get("runtime/runs/:sandboxRunId/graph")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.runtime.replay")
  async getRunGraph(@Req() req: Request, @Param("sandboxRunId") sandboxRunId: string) {
    return this.getRunReplay(req, sandboxRunId);
  }

  @Get("runtime/patches/:patchProposalId")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.patch.read")
  async getPatch(@Req() req: Request, @Param("patchProposalId") patchProposalId: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const patch = await this.patches.findOne({
      where: { id: patchProposalId },
      relations: ["sandboxRun", "user"]
    });
    if (!patch) return { ok: false, error: "Patch not found" };
    return { ok: true, patch };
  }

  @Get("jobs/leases")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.jobs.read")
  async getLeases(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const leases = await this.leases.find({ relations: ["aiJob"], order: { leaseExpiresAt: "ASC" } });
    return {
      ok: true,
      leases: leases.map((l) => ({
        id: l.id,
        aiJobId: (l.aiJob as any)?.id ?? null,
        ownerNode: l.ownerNode,
        ownerPid: l.ownerPid ?? null,
        leaseExpiresAt: l.leaseExpiresAt,
        lastRenewedAt: l.lastRenewedAt,
        stealCount: l.stealCount,
        version: l.version
      }))
    };
  }

  @Get("dashboard/summary")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.dashboard.read", limit: 30, windowSeconds: 60 })
  async getDashboardSummary(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 90_000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [activeRuns, pausedRuns, blockedRuns, pendingPatches, pendingApprovals, queuedJobs] =
      await Promise.all([
        this.runs.count({ where: { status: "executing" as any } }),
        this.runs.count({ where: { status: "paused_approval_required" as any } }),
        this.runs.count({ where: { status: "blocked" as any } }),
        this.patches.count({ where: { status: "pending" as any } }),
        this.approvals.count({ where: { status: "pending" as any } }),
        this.jobs
          .createQueryBuilder("j")
          .select("j.shardKey", "shardKey")
          .addSelect("j.status", "status")
          .addSelect("COUNT(*)", "count")
          .where("j.createdAt >= :dayAgo", { dayAgo })
          .groupBy("j.shardKey")
          .addGroupBy("j.status")
          .getRawMany()
      ]);

    const staleLeasesCount = await this.leases.createQueryBuilder("l").where("l.leaseExpiresAt < :staleBefore", { staleBefore }).getCount();
    const approvalRequiredCount = await this.cmdPolicy
      .createQueryBuilder("d")
      .where("d.decision = :decision", { decision: "require_approval" })
      .andWhere("d.createdAt >= :dayAgo", { dayAgo })
      .getCount();
    const deniedRecentCount = await this.cmdPolicy
      .createQueryBuilder("d")
      .where("d.decision = :decision", { decision: "deny" })
      .andWhere("d.createdAt >= :dayAgo", { dayAgo })
      .getCount();
    const recentVoiceActions = await this.voiceEvents
      .createQueryBuilder("v")
      .where("v.createdAt >= :dayAgo", { dayAgo })
      .select("v.intentType", "intentType")
      .addSelect("COUNT(*)", "count")
      .groupBy("v.intentType")
      .getRawMany();
    const rateLimitHits = await this.rateLimitEvents
      .createQueryBuilder("r")
      .where("r.createdAt >= :dayAgo", { dayAgo })
      .select("r.routeKey", "routeKey")
      .addSelect("COUNT(*)", "count")
      .groupBy("r.routeKey")
      .orderBy("count", "DESC")
      .limit(20)
      .getRawMany();

    return {
      ok: true,
      summary: {
        activeRuns,
        pausedApprovalRuns: pausedRuns,
        blockedRuns,
        pendingPatchProposals: pendingPatches,
        pendingApprovals,
        staleLeases: staleLeasesCount,
        recentPolicy: {
          deniedLast24h: deniedRecentCount,
          approvalRequiredLast24h: approvalRequiredCount
        },
        recentVoiceActions,
        recentRateLimitHits: rateLimitHits,
        jobsByShardStatus: queuedJobs
      }
    };
  }

  @Get("reviews")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.reviews.read")
  @RateLimit({ key: "admin.reviews.read", limit: 30, windowSeconds: 60 })
  async getReviews(
    @Req() req: Request,
    @Query("workspaceRef") workspaceRef?: string,
    @Query("targetType") targetType?: string,
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("category") category?: string,
    @Query("page") pageRaw?: string,
    @Query("pageSize") pageSizeRaw?: string
  ) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const page = Math.max(1, Number(pageRaw ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(pageSizeRaw ?? 20)));
    const offset = (page - 1) * pageSize;
    const qb = this.reviewSessions
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.sandboxRun", "run")
      .leftJoinAndSelect("s.aiJob", "job")
      .leftJoinAndSelect("s.voiceOperatorEvent", "voice")
      .orderBy("s.createdAt", "DESC");
    if (workspaceRef) qb.andWhere("s.targetRef LIKE :workspaceRef", { workspaceRef: `%${workspaceRef}%` });
    if (targetType) qb.andWhere("s.targetType = :targetType", { targetType });
    if (status) qb.andWhere("s.status = :status", { status });
    const [rows, total] = await qb.skip(offset).take(pageSize).getManyAndCount();
    const sessionIds = rows.map((r) => r.id);
    let findings: ReviewFindingEntity[] = [];
    if (sessionIds.length) {
      findings = await this.reviewFindings.find({
        where: {
          reviewSession: { id: In(sessionIds) } as any,
          ...(severity ? ({ severity } as any) : {}),
          ...(category ? ({ category } as any) : {})
        },
        relations: ["reviewSession", "patchProposal"]
      });
    }
    const findingsBySession = findings.reduce<Record<string, ReviewFindingEntity[]>>((acc, f) => {
      const key = (f.reviewSession as any)?.id;
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    }, {});
    return {
      ok: true,
      page,
      pageSize,
      total,
      rows: rows.map((s) => ({
        id: s.id,
        status: s.status,
        targetType: s.targetType,
        targetRef: s.targetRef,
        resultSummary: s.resultSummary,
        createdAt: s.createdAt,
        aiJobId: (s.aiJob as any)?.id ?? null,
        sandboxRunId: (s.sandboxRun as any)?.id ?? null,
        voiceOperatorEventId: (s.voiceOperatorEvent as any)?.id ?? null,
        findings: (findingsBySession[s.id] ?? []).map((f) => ({
          id: f.id,
          severity: f.severity,
          category: f.category,
          title: f.title,
          explanation: f.explanation,
          evidence: f.evidence,
          suggestedFix: f.suggestedFix,
          patchProposalId: (f.patchProposal as any)?.id ?? null
        }))
      }))
    };
  }

  @Get("policies")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.policies.read")
  async getPolicies(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const definitions = await this.defs.find({ order: { createdAt: "DESC" } });
    const versions = await this.vers.find({ relations: ["policyDefinition"], order: { createdAt: "DESC" } });
    const recentDenied = await this.cmdPolicy.find({ where: { decision: "deny" as const } as any, take: 30, order: { createdAt: "DESC" } });
    const recentRewrite = await this.cmdPolicy.find({ where: { decision: "rewrite" as const } as any, take: 30, order: { createdAt: "DESC" } });
    const recentRequireApproval = await this.cmdPolicy.find({ where: { decision: "require_approval" as const } as any, take: 30, order: { createdAt: "DESC" } });
    const shardView = await this.jobs.find({
      where: { status: "queued" as const } as any,
      order: { queuePriority: "DESC", createdAt: "ASC" },
      take: 200
    });
    return {
      ok: true,
      definitions,
      versions,
      shardVisibility: shardView.map((j) => ({ aiJobId: j.id, shardKey: j.shardKey, priority: j.queuePriority, jobType: j.jobType })),
      recentDenied,
      recentRewrite,
      recentRequireApproval
    };
  }

  @Get("system/kill-switch")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.system.kill", limit: 30, windowSeconds: 60 })
  async getKillSwitchState(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const state = await this.killSwitch.getState();
    return { ok: true, state };
  }

  @Get("system/health")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.system.health", limit: 30, windowSeconds: 60 })
  async getSystemHealth(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const [killState, worker, infra] = await Promise.all([
      this.killSwitch.getState(),
      this.beastWorker.health(),
      this.infraHealth.snapshot()
    ]);
    return {
      ok: true,
      killSwitch: killState,
      worker: {
        reachable: worker.reachable,
        inferenceReady: worker.inferenceReady,
        primaryBackend: worker.primaryBackend ?? null,
        selectedModel: worker.selectedModel ?? null,
        inferenceTelemetry: worker.inferenceTelemetry ?? null
      },
      infra,
      alertingHints: infra.alertingHints,
      metricsHints: [
        "Scrape GET /metrics (admin) for Prometheus; alert on malv_http_request_duration_ms, malv_job_executions_total, malv_sandbox_run_duration_ms"
      ]
    };
  }

  @Get("runtime/runs")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.runtime.read")
  @RateLimit({ key: "admin.runtime.list", limit: 40, windowSeconds: 60 })
  async listRecentRuns(@Req() req: Request, @Query("limit") limitRaw?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 40)));
    const rows = await this.runs.find({
      order: { createdAt: "DESC" },
      take: limit,
      relations: ["user", "workspace"]
    });
    return {
      ok: true,
      runs: rows.map((r) => ({
        id: r.id,
        status: r.status,
        runType: r.runType,
        userId: (r.user as any)?.id ?? null,
        workspaceId: (r as any).workspace?.id ?? null,
        createdAt: r.createdAt,
        finishedAt: r.finishedAt ?? null
      }))
    };
  }
}


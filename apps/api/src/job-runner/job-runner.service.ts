import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import crypto from "crypto";

import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { AiJobEntity as AiJobEntityClass } from "../db/entities/ai-job.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { MemoryEntryEntity } from "../db/entities/memory-entry.entity";
import { FileContextEntity } from "../db/entities/file-context.entity";
import { AiWorkerEntity } from "../db/entities/ai-worker.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { RateLimitEventEntity } from "../db/entities/rate-limit-event.entity";
import { MultimodalDeepExtractService } from "../file-understanding/multimodal-deep-extract.service";
import { ObservabilityService } from "../common/observability.service";
import { ClusterLeaderService } from "../infra/cluster-leader.service";
import { RuntimeEventBusService } from "../common/runtime-event-bus.service";
import { WorkspaceTaskExecutionEngineService } from "../workspace/workspace-task-execution-engine.service";

@Injectable()
export class BackgroundJobRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private lastKillPersistAt = 0;
  private lastProactiveScanAt = 0;
  private readonly workerNodeName: string;
  private readonly maxConcurrency: number;
  private readonly ownerPid: number;

  constructor(
    private readonly cfg: ConfigService,
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly sandbox: SandboxExecutionService,
    @InjectRepository(AiJobEntityClass) private readonly aiJobs: Repository<AiJobEntityClass>,
    @InjectRepository(SandboxRunEntity) private readonly sandboxRuns: Repository<SandboxRunEntity>,
    @InjectRepository(SuggestionRecordEntity) private readonly suggestions: Repository<SuggestionRecordEntity>,
    @InjectRepository(BeastActivityLogEntity) private readonly beastLogs: Repository<BeastActivityLogEntity>,
    @InjectRepository(MemoryEntryEntity) private readonly memories: Repository<MemoryEntryEntity>,
    @InjectRepository(FileContextEntity) private readonly fileContexts: Repository<FileContextEntity>,
    @InjectRepository(AiWorkerEntity) private readonly aiWorkers: Repository<AiWorkerEntity>,
    @InjectRepository(AiJobLeaseEntity) private readonly aiJobLeases: Repository<AiJobLeaseEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly approvals: Repository<SandboxApprovalRequestEntity>,
    @InjectRepository(RateLimitEventEntity) private readonly rateLimitEvents: Repository<RateLimitEventEntity>,
    private readonly multimodal: MultimodalDeepExtractService,
    private readonly observability: ObservabilityService,
    private readonly clusterLeader: ClusterLeaderService,
    private readonly runtimeBus: RuntimeEventBusService,
    private readonly workspaceTaskExecution: WorkspaceTaskExecutionEngineService
  ) {
    this.workerNodeName =
      this.cfg.get<string>("JOB_RUNNER_NODE_NAME") ?? `${process.env.HOSTNAME ?? "node"}-${process.pid}`;
    this.maxConcurrency = Math.max(1, Number(this.cfg.get<string>("JOB_RUNNER_MAX_CONCURRENCY") ?? "2"));
    this.ownerPid = process.pid;
  }

  onModuleInit() {
    const enabled = (this.cfg.get<string>("MALV_BACKGROUND_WORKLOADS_ENABLED") ?? "true").toLowerCase() !== "false";
    if (!enabled) {
      this.logger.warn("Background job runner disabled via MALV_BACKGROUND_WORKLOADS_ENABLED=false.");
      return;
    }
    const intervalMs = Number(this.cfg.get<string>("JOB_RUNNER_INTERVAL_MS") ?? "2000");
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.logger.log(`BackgroundJobRunner started (interval=${intervalMs}ms).`);
    void this.ensureWorkerOnline();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const state = await this.killSwitch.getState();
      if (!state.systemOn) {
        // Keep a best-effort audit trail while we pause restricted work.
        const now = Date.now();
        if (now - this.lastKillPersistAt > 30_000) {
          this.lastKillPersistAt = now;
          await this.killSwitch.persistRecentEventsIfNeeded();
        }
        return;
      }

      await this.processSandboxQueue();
      await this.processAiJobsQueue();
      await this.clusterLeader.runIfLeader(async () => {
        await this.processBeastProactiveScan();
        await this.runRetentionCleanup();
        await this.recoverStaleJobLeases();
        const te = await this.workspaceTaskExecution.processDueTasksTick();
        if (te.processed > 0) {
          this.logger.log(`Workspace task execution: processed=${te.processed}`);
        }
      });
      await this.heartbeatWorker();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Job runner tick error: ${errMsg}`);
    } finally {
      this.isTicking = false;
    }
  }

  private async runRetentionCleanup() {
    const ttlHours = Number(this.cfg.get<string>("MALV_RETENTION_TRANSIENT_HOURS") ?? "168");
    const approvalHours = Number(this.cfg.get<string>("MALV_APPROVAL_EXPIRY_HOURS") ?? "24");
    const rateLimitDays = Number(this.cfg.get<string>("MALV_RATELIMIT_EVENT_RETENTION_DAYS") ?? "7");
    const transientCutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const approvalCutoff = new Date(Date.now() - approvalHours * 60 * 60 * 1000);
    const rateLimitCutoff = new Date(Date.now() - rateLimitDays * 24 * 60 * 60 * 1000);
    const expire = await this.approvals
      .createQueryBuilder()
      .update()
      .set({ status: "expired" as any, resolvedAt: new Date(), resolutionNote: "Expired by retention scheduler" } as any)
      .where("status = :status", { status: "pending" })
      .andWhere("requested_at < :cutoff", { cutoff: approvalCutoff })
      .execute();
    const oldLeases = await this.aiJobLeases
      .createQueryBuilder()
      .delete()
      .where("lease_expires_at < :cutoff", { cutoff: transientCutoff })
      .execute();
    const oldRateLimit = await this.rateLimitEvents
      .createQueryBuilder()
      .delete()
      .where("created_at < :cutoff", { cutoff: rateLimitCutoff })
      .execute();
    if ((expire.affected ?? 0) > 0 || (oldLeases.affected ?? 0) > 0 || (oldRateLimit.affected ?? 0) > 0) {
      this.logger.log(
        `Retention cleanup: approvals_expired=${expire.affected ?? 0} leases_deleted=${oldLeases.affected ?? 0} rate_limit_events_deleted=${oldRateLimit.affected ?? 0}`
      );
    }
  }

  private async processSandboxQueue(): Promise<void> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "job_runner_sandbox_dispatch" });

    for (let i = 0; i < this.maxConcurrency; i++) {
      // 1) staged -> validation_pending -> approval_pending|approved
      const staged = await this.sandboxRuns
        .createQueryBuilder("r")
        .where("r.status = :st", { st: "staged" })
        .andWhere(
          "(JSON_EXTRACT(r.input_payload, '$.cciInlineExecution') IS NULL OR JSON_EXTRACT(r.input_payload, '$.cciInlineExecution') = 0)"
        )
        .orderBy("r.runPriority", "DESC")
        .addOrderBy("r.createdAt", "ASC")
        .getOne();
      if (staged) {
        const res = await this.sandboxRuns.update({ id: staged.id, status: "staged" as const }, { status: "validation_pending" as const } as any);
        if (res.affected && res.affected > 0) {
          try {
            await this.sandbox.validateSandboxRunAfterClaim(staged.id);
          } catch (e) {
            if (e instanceof ServiceUnavailableException) {
              await this.sandboxRuns.update({ id: staged.id, status: "validation_pending" as const }, { status: "staged" as const } as any);
            } else {
              throw e;
            }
          }
        }
      }

      // 2) approved -> executing -> completed|failed
      const approved = await this.sandboxRuns
        .createQueryBuilder("r")
        .where("r.status = :st", { st: "approved" })
        .andWhere(
          "(JSON_EXTRACT(r.input_payload, '$.cciInlineExecution') IS NULL OR JSON_EXTRACT(r.input_payload, '$.cciInlineExecution') = 0)"
        )
        .orderBy("r.runPriority", "DESC")
        .addOrderBy("r.createdAt", "ASC")
        .getOne();
      if (approved) {
        const res = await this.sandboxRuns.update({ id: approved.id, status: "approved" as const }, { status: "executing" as const } as any);
        if (res.affected && res.affected > 0) {
          try {
            await this.sandbox.executeSandboxRunAfterClaim(approved.id);
          } catch (e) {
            if (e instanceof ServiceUnavailableException) {
              await this.sandboxRuns.update({ id: approved.id, status: "executing" as const }, { status: "approved" as const } as any);
            } else {
              throw e;
            }
          }
        }
      }
    }
  }

  private async processAiJobsQueue(): Promise<void> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "job_runner_ai_job_dispatch" });

    const budgets = this.shardBudgets();
    const usedByShard = new Map<string, number>();

    for (let slot = 0; slot < this.maxConcurrency; slot++) {
      const queued = await this.aiJobs
        .createQueryBuilder("j")
        .leftJoinAndSelect("j.user", "user")
        .where("j.status = :st", { st: "queued" })
        .andWhere("(j.next_retry_after IS NULL OR j.next_retry_after <= :now)", { now: new Date() })
        .orderBy("j.queuePriority", "DESC")
        .addOrderBy("j.createdAt", "ASC")
        .take(100)
        .getMany();
      if (queued.length < 1) return;

      const sorted = queued
        .map((j) => ({
          job: j,
          priority: Number(j.queuePriority ?? 50),
          shardKey: j.shardKey || this.deriveShardKey(j)
        }))
        .sort((a, b) => b.priority - a.priority || a.job.createdAt.getTime() - b.job.createdAt.getTime());

      const pick = sorted.find((x) => {
        const budget = budgets[x.shardKey] ?? budgets.default ?? 1;
        const used = usedByShard.get(x.shardKey) ?? 0;
        return used < budget;
      });
      if (!pick) return;
      const shard = pick.shardKey;
      const job = pick.job;
      const lease = await this.tryAcquireJobLease(job.id);
      if (!lease) continue;
      usedByShard.set(shard, (usedByShard.get(shard) ?? 0) + 1);

      try {
        const claimed = await this.aiJobs.update(
          { id: job.id, status: "queued" as const },
          { status: "running", progress: 5, shardKey: shard } as any
        );

        if (!claimed.affected || claimed.affected < 1) {
          await this.releaseJobLease(job.id, lease);
          continue;
        }
        this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "running", progress: 5, message: "Job claimed by runner." });

        const userId = job.user?.id;
        if (!userId) {
          await this.releaseJobLease(job.id, lease);
          continue;
        }

        const payload = job.payload ?? {};
        const fileId = (payload as any).fileId as string | undefined;
        const fileContextIds = ((payload as any).fileContextIds ?? []) as string[];
        const requiresApproval = Boolean((payload as any).requiresApproval);

        if (job.jobType === "multimodal_deep_extract") {
          try {
            await this.multimodal.processQueuedJob(job);
            this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "completed", progress: 100, message: "Multimodal job completed." });
            this.observability.recordJobExecution(job.jobType, "completed");
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            const attempts = Number(job.attemptCount ?? 0);
            const max = Math.max(1, Number(job.maxAttempts ?? 3));
            if (attempts + 1 < max) {
              const backoff = Math.min(300_000, 2000 * Math.pow(2, attempts));
              await this.aiJobs.update(
                { id: job.id },
                {
                  status: "queued",
                  progress: 0,
                  attemptCount: attempts + 1,
                  nextRetryAfter: new Date(Date.now() + backoff),
                  errorMessage: errMsg.slice(0, 1200)
                } as any
              );
              this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "queued", progress: 0, message: "Job scheduled for retry." });
              this.observability.recordJobExecution(job.jobType, "retry_scheduled");
              if (userId) this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "queued", progress: 0 });
            } else {
              await this.aiJobs.update(
                { id: job.id },
                { status: "failed", errorMessage: errMsg.slice(0, 1200), finishedAt: new Date() } as any
              );
              this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "failed", progress: 100, message: errMsg.slice(0, 300) });
              this.observability.recordJobExecution(job.jobType, "failed");
              if (userId) this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "failed", progress: 100 });
            }
          }
          await this.releaseJobLease(job.id, lease);
          continue;
        }

        if (job.jobType === "beast_proactive") {
          const unfinished = ((payload as any).unfinished ?? []) as Array<{ aiJobId: string; type: string; error?: string | null }>;
          const summary = unfinished
            .slice(0, 6)
            .map((x, i) => `${i + 1}. ${x.type} (${x.aiJobId})${x.error ? `: ${x.error}` : ""}`)
            .join("\n");

          await this.suggestions.save(
            this.suggestions.create({
              user: { id: userId } as any,
              aiJob: job,
              suggestionType: "next_step",
              riskLevel: "medium",
              status: "active",
              content: `Predictive plan generated for unfinished work:\n${summary}`,
              metadata: { trigger: (payload as any).trigger ?? "proactive", unfinishedCount: unfinished.length }
            })
          );
          await this.beastLogs.save(
            this.beastLogs.create({
              user: { id: userId } as any,
              aiJob: job,
              eventType: "unfinished_work",
              payload: { unfinishedCount: unfinished.length, unfinished }
            })
          );
          await this.aiJobs.update({ id: job.id }, { status: "completed", progress: 100, finishedAt: new Date(), resultReply: "Proactive predictive plan generated." } as any);
          this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "completed", progress: 100, message: "Proactive job completed." });
          this.observability.recordJobExecution(job.jobType, "completed");
          this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "completed", progress: 100 });
          this.realtime.emitToUser(userId, "beast:proactive", { type: "predictive_task_generation", aiJobId: job.id, unfinishedCount: unfinished.length });
          await this.releaseJobLease(job.id, lease);
          continue;
        }

        if (!fileId) {
          await this.aiJobs.update({ id: job.id }, { status: "failed", progress: 100, errorMessage: "Missing fileId in payload" } as any);
          this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "failed", progress: 100, message: "Missing fileId in payload." });
          this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "failed", progress: 100 });
          await this.releaseJobLease(job.id, lease);
          continue;
        }

        const run = await this.sandbox.createFileUnderstandingSandboxRun({
          userId,
          userRole: "user",
          aiJobId: job.id,
          fileId,
          fileContextIds,
          requiresApproval,
          runPriority: Number(job.queuePriority ?? 50)
        }).catch((e) => {
          if (e instanceof ServiceUnavailableException) {
            return null;
          }
          throw e;
        });

        if (!run) {
          await this.aiJobs.update({ id: job.id, status: "running" }, { status: "queued", progress: 0 } as any);
          this.observability.recordJobExecution(job.jobType, "requeued");
          this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "queued", progress: 0 });
          this.runtimeBus.publish({ source: "job", aiJobId: job.id, status: "queued", progress: 0, message: "Requeued after transient sandbox unavailability." });
          await this.releaseJobLease(job.id, lease);
          continue;
        }

        await this.aiJobs.update({ id: job.id }, { payload: { ...payload, sandboxRunId: run.id }, progress: 10 } as any);
        this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "running", progress: 10 });
        this.runtimeBus.publish({ source: "job", aiJobId: job.id, sandboxRunId: run.id, status: "running", progress: 10, message: "Dispatched to sandbox run." });
        await this.releaseJobLease(job.id, lease);
      } catch (e) {
        await this.releaseJobLease(job.id, lease);
        throw e;
      }
    }
  }

  private shardBudgets(): Record<string, number> {
    const raw = this.cfg.get<string>("JOB_SHARD_BUDGETS_JSON") ?? '{"default":2}';
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      const out: Record<string, number> = {};
      for (const k of Object.keys(parsed)) out[k] = Math.max(1, Number(parsed[k] ?? 1));
      if (!out.default) out.default = this.maxConcurrency;
      return out;
    } catch {
      return { default: this.maxConcurrency };
    }
  }

  private deriveShardKey(job: AiJobEntityClass): string {
    const base = job.jobType || "default";
    const p = Number(job.queuePriority ?? 50);
    const pri = p >= 80 ? "high" : p <= 20 ? "low" : "normal";
    return `${base}:${pri}`;
  }

  private async ensureWorkerOnline() {
    const existing = await this.aiWorkers.findOne({ where: { workerType: "job_runner", nodeName: this.workerNodeName } });
    if (existing) {
      existing.status = "online";
      existing.lastSeenAt = new Date();
      await this.aiWorkers.save(existing);
      return;
    }
    await this.aiWorkers.save(
      this.aiWorkers.create({
        workerType: "job_runner",
        nodeName: this.workerNodeName,
        baseUrl: "internal://job-runner",
        status: "online",
        lastSeenAt: new Date(),
        capabilities: { queues: ["ai_jobs", "sandbox_runs"], maxConcurrency: Number(this.cfg.get<string>("JOB_RUNNER_MAX_CONCURRENCY") ?? "2") }
      })
    );
  }

  private async heartbeatWorker() {
    await this.aiWorkers.update({ workerType: "job_runner", nodeName: this.workerNodeName }, { status: "online", lastSeenAt: new Date() } as any);
    const now = new Date();
    const ttlMs = Number(this.cfg.get<string>("JOB_LEASE_TTL_MS") ?? "20000");

    await this.aiJobLeases.update(
      { ownerNode: this.workerNodeName } as any,
      { leaseExpiresAt: new Date(Date.now() + ttlMs), lastRenewedAt: new Date() } as any
    );

    await this.aiJobLeases
      .createQueryBuilder()
      .delete()
      .where("lease_expires_at < :now", { now })
      .execute();
  }

  /** Leader-only: re-queue jobs whose leases expired without release (multi-node safe). */
  private async recoverStaleJobLeases(): Promise<void> {
    const staleRecoveryMs = Number(this.cfg.get<string>("JOB_LEASE_STALE_RECOVERY_MS") ?? "120000");
    const stale = await this.aiJobLeases
      .createQueryBuilder("lease")
      .leftJoinAndSelect("lease.aiJob", "aiJob")
      .where("lease.lease_expires_at < :staleAt", { staleAt: new Date(Date.now() - staleRecoveryMs) })
      .getMany();
    for (const lease of stale) {
      const aiJobId = (lease.aiJob as any)?.id as string | undefined;
      if (aiJobId) {
        await this.aiJobs.update({ id: aiJobId, status: "running" as const }, { status: "queued", progress: 0 } as any);
      }
    }
  }

  private async tryAcquireJobLease(aiJobId: string): Promise<string | null> {
    const token = crypto.randomBytes(32).toString("hex");
    const ttlMs = Number(this.cfg.get<string>("JOB_LEASE_TTL_MS") ?? "20000");
    const stealGraceMs = Number(this.cfg.get<string>("JOB_LEASE_STEAL_GRACE_MS") ?? "5000");
    const expiresAt = new Date(Date.now() + ttlMs);

    try {
      await this.aiJobLeases.insert({
        aiJob: { id: aiJobId } as any,
        ownerNode: this.workerNodeName,
        ownerPid: this.ownerPid,
        leaseToken: token,
        leaseExpiresAt: expiresAt,
        lastRenewedAt: new Date(),
        stealCount: 0,
        version: 1
      } as any);
      return token;
    } catch {
      const existing = await this.aiJobLeases.findOne({ where: { aiJob: { id: aiJobId } } as any });
      if (!existing) return null;
      const expiredFor = Date.now() - existing.leaseExpiresAt.getTime();
      if (expiredFor < stealGraceMs) return null;
      const nextVersion = Number(existing.version ?? 1) + 1;
      const updated = await this.aiJobLeases.update(
        { id: existing.id, version: existing.version } as any,
        {
          ownerNode: this.workerNodeName,
          ownerPid: this.ownerPid,
          leaseToken: token,
          leaseExpiresAt: expiresAt,
          lastRenewedAt: new Date(),
          stealCount: Number(existing.stealCount ?? 0) + 1,
          version: nextVersion
        } as any
      );
      return updated.affected && updated.affected > 0 ? token : null;
    }
  }

  private async releaseJobLease(aiJobId: string, leaseToken: string): Promise<void> {
    await this.aiJobLeases.delete({ aiJob: { id: aiJobId } as any, ownerNode: this.workerNodeName, leaseToken } as any);
  }

  private async processBeastProactiveScan(): Promise<void> {
    const now = Date.now();
    if (now - this.lastProactiveScanAt < 30_000) return;
    this.lastProactiveScanAt = now;

    const recentFailed = await this.aiJobs.find({
      where: { status: "failed" as const },
      order: { updatedAt: "DESC" },
      take: 30,
      relations: ["user"]
    });

    const byUser = new Map<string, AiJobEntityClass[]>();
    for (const j of recentFailed) {
      const uid = j.user?.id;
      if (!uid) continue;
      const list = byUser.get(uid) ?? [];
      list.push(j);
      byUser.set(uid, list);
    }

    for (const [userId, failed] of byUser.entries()) {
      const failures = failed.length;
      const recentMemCount = await this.memories.count({ where: { userId } as any });
      const fileCtxCount = await this.fileContexts.count({ where: { user: { id: userId } } as any });

      // Friction detection + unfinished-work detection.
      if (failures >= 2) {
        const summary = `Detected friction: ${failures} failed jobs; memory=${recentMemCount}, fileContexts=${fileCtxCount}.`;
        await this.suggestions.save(
          this.suggestions.create({
            user: { id: userId } as any,
            aiJob: null,
            suggestionType: "opportunity",
            riskLevel: "medium",
            status: "active",
            content: summary,
            metadata: { category: "friction_detection", failures, recentMemCount, fileCtxCount }
          })
        );
        await this.beastLogs.save(
          this.beastLogs.create({
            user: { id: userId } as any,
            aiJob: null,
            eventType: "friction_detection",
            payload: { failures, recentMemCount, fileCtxCount }
          })
        );
        this.realtime.emitToUser(userId, "beast:proactive", { type: "friction_detection", failures });
      }

      // Predictive task generation through queued proactive job.
      if (failures > 0) {
        const exists = await this.aiJobs.findOne({
          where: { user: { id: userId }, jobType: "beast_proactive" as const, status: "queued" as const }
        });
        if (!exists) {
          const job = this.aiJobs.create({
            user: { id: userId } as any,
            conversation: null as any,
            jobType: "beast_proactive",
            requestedMode: "Smart",
            classifiedMode: "beast",
            status: "queued",
            progress: 0,
            shardKey: "beast_proactive:normal",
            queuePriority: 65,
            payload: {
              trigger: "predictive_next_step_generation",
              failures,
              unfinished: failed.map((f) => ({ aiJobId: f.id, type: f.jobType, error: f.errorMessage ?? null }))
            }
          });
          await this.aiJobs.save(job);
          this.realtime.emitToUser(userId, "job:update", { aiJobId: job.id, status: "queued", progress: 0 });
        }
      }
    }
  }
}


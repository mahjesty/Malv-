import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { WorkspaceTaskEntity, type WorkspaceTaskExecutionState } from "../db/entities/workspace-task.entity";
import { WorkspaceActivityService } from "./workspace-activity.service";
import {
  malvDueAtReminderEligible,
  malvReminderTimeDue,
  MALV_TASK_SCAN_ELIGIBLE_STATES,
  resolveMalvTaskExecutionRoute,
  type MalvTaskExecutionRoute
} from "./workspace-task-execution-engine.util";
import { MalvBridgeCapabilityResolverService } from "../execution-bridge/malv-bridge-capability-resolver.service";
import { MalvNotificationDeliveryService } from "../execution-bridge/malv-notification-delivery.service";
import { MalvExternalActionDispatchService } from "../execution-bridge/malv-external-action-dispatch.service";
import type { MalvBridgeCapabilityReport } from "../execution-bridge/malv-bridge-capability.types";
import { MalvAgentOrchestratorService } from "../agent-system/orchestrator/malv-agent-orchestrator.service";
import type { MalvAgentRequestContext } from "../agent-system/contracts/malv-agent.contracts";
import type { MalvTaskRouterInput } from "../agent-system/router/malv-task-router.service";
import type { WorkspaceActivityType } from "../db/entities/workspace-activity-event.entity";

type RunRouteResult = {
  terminalState: WorkspaceTaskExecutionState;
  outcome: string;
  failureCode?: string | null;
  failureDetail?: string | null;
  clearScheduled: boolean;
  metadataPatch?: Record<string, unknown>;
  activityType: WorkspaceActivityType;
  activityTitle: string;
  executorPath?: string;
};

type ExternalScheduleHandled =
  | { mode: "terminal"; result: RunRouteResult }
  | {
      mode: "waiting_ack";
      leaseUntil: Date;
      metadataPatch: Record<string, unknown>;
      dispatchId: string;
      correlationId: string;
    };

/**
 * Idempotency / multi-worker safety:
 * - Claims use a short DB lease (`execution_lease_owner` + `execution_lease_expires_at`) with compare-and-set
 *   on `execution_state` so only one replica processes a due task at a time.
 * - Reminder consumption clears `reminder_at` after a successful delivery so scans cannot double-fire.
 * - Approval-gated scheduled work transitions to `waiting_approval` once (state predicate in UPDATE).
 * - Expired `dispatched`/`running` leases are released back to `pending` for deliberate retries.
 * - External actions awaiting client ack use `waiting_input` with a longer lease; expiry marks a structured failure.
 */
@Injectable()
export class WorkspaceTaskExecutionEngineService {
  private readonly logger = new Logger(WorkspaceTaskExecutionEngineService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly activity: WorkspaceActivityService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly bridgeResolver: MalvBridgeCapabilityResolverService,
    private readonly notificationDelivery: MalvNotificationDeliveryService,
    private readonly externalDispatch: MalvExternalActionDispatchService,
    private readonly malvOrchestrator: MalvAgentOrchestratorService,
    @InjectRepository(WorkspaceTaskEntity) private readonly tasks: Repository<WorkspaceTaskEntity>
  ) {}

  private ownerName(): string {
    return (
      this.cfg.get<string>("MALV_TASK_EXECUTION_NODE_NAME") ??
      this.cfg.get<string>("JOB_RUNNER_NODE_NAME") ??
      `${process.env.HOSTNAME ?? "node"}-${process.pid}`
    );
  }

  private leaseMs(): number {
    return Math.max(15_000, Number(this.cfg.get<string>("MALV_TASK_EXECUTION_LEASE_MS") ?? "120000"));
  }

  private externalAckLeaseMs(): number {
    return Math.max(60_000, Number(this.cfg.get<string>("MALV_EXTERNAL_ACTION_ACK_LEASE_MS") ?? String(15 * 60 * 1000)));
  }

  private batchSize(): number {
    return Math.min(50, Math.max(1, Number(this.cfg.get<string>("MALV_TASK_EXECUTION_BATCH") ?? "20")));
  }

  private userIdOf(task: WorkspaceTaskEntity): string {
    const u = task.user as { id?: string } | undefined;
    return u?.id ?? (task as unknown as { userId?: string }).userId ?? "";
  }

  /**
   * Leader-scheduled entrypoint: scans due reminders and scheduled executions, emits realtime + activity.
   */
  async processDueTasksTick(): Promise<{ processed: number }> {
    const ks = await this.killSwitch.getState();
    if (!ks.systemOn) {
      return { processed: 0 };
    }

    const now = new Date();
    const released = await this.recoverExpiredLeases(now);
    if (released > 0) {
      this.logger.log(`Released ${released} stale task execution lease(s).`);
    }
    const extFail = await this.recoverExpiredExternalAckWaits(now);
    if (extFail > 0) {
      this.logger.log(`Marked ${extFail} external action wait(s) failed (ack lease expired).`);
    }

    let processed = 0;
    processed += await this.promoteApprovalGatedScheduledBatch(now);
    processed += await this.processReminderBatch(now);
    processed += await this.processScheduledExecutionBatch(now);
    return { processed };
  }

  private async recoverExpiredLeases(now: Date): Promise<number> {
    const res = await this.tasks
      .createQueryBuilder()
      .update(WorkspaceTaskEntity)
      .set({
        executionState: "pending",
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null
      })
      .where("execution_state IN (:...ss)", { ss: ["dispatched", "running"] })
      .andWhere("execution_lease_expires_at IS NOT NULL")
      .andWhere("execution_lease_expires_at < :now", { now })
      .execute();
    return res.affected ?? 0;
  }

  private async recoverExpiredExternalAckWaits(now: Date): Promise<number> {
    const rows = await this.tasks
      .createQueryBuilder("t")
      .innerJoinAndSelect("t.user", "u")
      .where("t.execution_state = :es", { es: "waiting_input" })
      .andWhere("t.execution_lease_expires_at IS NOT NULL")
      .andWhere("t.execution_lease_expires_at < :now", { now })
      .andWhere("JSON_EXTRACT(t.metadata, '$.malvExternalAwaitingAck') = true")
      .take(this.batchSize())
      .getMany();

    let n = 0;
    for (const t of rows) {
      const userId = this.userIdOf(t);
      const meta = { ...(t.metadata ?? {}) };
      const dispatchId = typeof (meta as any).malvExternalDispatchId === "string" ? (meta as any).malvExternalDispatchId : null;
      delete (meta as any).malvExternalAwaitingAck;
      if (dispatchId) {
        await this.externalDispatch.markTimedOut(dispatchId, now.toISOString());
      }
      await this.tasks.update(
        { id: t.id },
        {
          executionState: "failed",
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          executionLastOutcome: "external_action_failed",
          executionFailureCode: "executor_ack_timeout",
          executionFailureDetail: "Executor did not acknowledge this external action before the server lease expired.",
          metadata: {
            ...meta,
            malvExternalDispatchOutcome: { status: "failed", reason: "executor_ack_timeout", at: now.toISOString() }
          } as any
        }
      );
      const fresh = await this.tasks.findOne({ where: { id: t.id }, relations: ["user"] });
      if (fresh) {
        this.emitExecution(userId, fresh, "failed", {
          outcome: "external_action_failed",
          reasonCode: "executor_ack_timeout"
        });
      }
      await this.activity.record({
        userId,
        activityType: "task_execution_failed",
        roomId: t.roomId ?? null,
        conversationId: t.conversationId ?? null,
        entityId: t.id,
        title: `External action timed out: ${t.title}`,
        payloadJson: { taskId: t.id, failureCode: "executor_ack_timeout" }
      });
      n += 1;
    }
    return n;
  }

  private emitExecution(
    userId: string,
    task: WorkspaceTaskEntity,
    phase: string,
    extra?: Record<string, unknown>
  ) {
    if (!userId) return;
    this.realtime.emitToUser(userId, "workspace:task_execution", {
      phase,
      taskId: task.id,
      task,
      ...extra
    });
    this.realtime.emitToUser(userId, "workspace:task_changed", {
      action: "execution",
      task,
      malvExecution: { phase, ...extra }
    });
    if (task.roomId) {
      this.realtime.emitToRoom(task.roomId, "room:task_execution", {
        phase,
        taskId: task.id,
        task,
        ...extra
      });
      this.realtime.emitToRoom(task.roomId, "room:task_changed", {
        action: "execution",
        task,
        malvExecution: { phase, ...extra }
      });
    }
  }

  private async promoteApprovalGatedScheduledBatch(now: Date): Promise<number> {
    let n = 0;
    const take = this.batchSize();
    for (let i = 0; i < take; i++) {
      const row = await this.tasks
        .createQueryBuilder("t")
        .innerJoinAndSelect("t.user", "u")
        .where("t.scheduled_for IS NOT NULL AND t.scheduled_for <= :now", { now })
        .andWhere("t.requires_approval = 1")
        .andWhere("t.status IN (:...st)", { st: ["todo", "in_progress"] })
        .andWhere("t.archived_at IS NULL")
        .andWhere("t.execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
        .orderBy("t.scheduled_for", "ASC")
        .getOne();

      if (!row) break;

      const res = await this.tasks
        .createQueryBuilder()
        .update(WorkspaceTaskEntity)
        .set({
          executionState: "waiting_approval",
          executionLastOutcome: "approval_required",
          executionFailureCode: "requires_approval",
          executionFailureDetail:
            "Scheduled execution is paused until this task is approved. MALV will not auto-run approval-gated work.",
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          executionLastAttemptAt: now
        })
        .where("id = :id", { id: row.id })
        .andWhere("execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
        .andWhere("requires_approval = 1")
        .andWhere("scheduled_for IS NOT NULL AND scheduled_for <= :now", { now })
        .execute();

      if ((res.affected ?? 0) < 1) continue;

      const userId = this.userIdOf(row);
      const fresh = await this.tasks.findOne({ where: { id: row.id }, relations: ["user"] });
      if (!fresh) continue;

      this.emitExecution(userId, fresh, "waiting_for_approval", {
        outcome: "approval_required",
        reasonCode: "requires_approval"
      });
      await this.activity.record({
        userId,
        activityType: "task_execution_approval_required",
        roomId: fresh.roomId ?? null,
        conversationId: fresh.conversationId ?? null,
        entityId: fresh.id,
        title: `Task waiting for approval: ${fresh.title}`,
        payloadJson: {
          taskId: fresh.id,
          executionState: fresh.executionState,
          scheduledFor: fresh.scheduledFor?.toISOString() ?? null
        }
      });
      n += 1;
    }
    return n;
  }

  private async processReminderBatch(now: Date): Promise<number> {
    let n = 0;
    const take = this.batchSize();
    for (let i = 0; i < take; i++) {
      const row = await this.tasks
        .createQueryBuilder("t")
        .innerJoinAndSelect("t.user", "u")
        .where("t.status IN (:...st)", { st: ["todo", "in_progress"] })
        .andWhere("t.archived_at IS NULL")
        .andWhere("t.execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
        .andWhere(
          new Brackets((qb) => {
            qb.where("t.reminder_at IS NOT NULL AND t.reminder_at <= :now", { now }).orWhere(
              new Brackets((qb2) => {
                qb2
                  .where("t.due_at IS NOT NULL AND t.due_at <= :now", { now })
                  .andWhere("t.reminder_at IS NULL")
                  .andWhere("t.scheduled_for IS NULL")
                  .andWhere("t.execution_type IN (:...rt)", { rt: ["reminder", "reminder_only"] });
              })
            );
          })
        )
        .orderBy("t.reminder_at", "ASC")
        .addOrderBy("t.due_at", "ASC")
        .getOne();

      if (!row) break;

      if (!malvReminderTimeDue(row, now) && !malvDueAtReminderEligible(row, now)) continue;

      const claimed = await this.tryClaimForReminder(row.id, now);
      if (!claimed) continue;

      const task = await this.tasks.findOne({ where: { id: row.id }, relations: ["user"] });
      if (!task) continue;

      const userId = this.userIdOf(task);
      await this.finalizeReminderDelivery(task, userId, now);
      n += 1;
    }
    return n;
  }

  private async tryClaimForReminder(taskId: string, now: Date): Promise<boolean> {
    const owner = this.ownerName();
    const leaseUntil = new Date(now.getTime() + this.leaseMs());
    const res = await this.tasks
      .createQueryBuilder()
      .update(WorkspaceTaskEntity)
      .set({
        executionState: "running",
        executionLeaseOwner: owner,
        executionLeaseExpiresAt: leaseUntil,
        executionLastAttemptAt: now,
        executionFailureCode: null,
        executionFailureDetail: null
      })
      .where("id = :id", { id: taskId })
      .andWhere("status IN (:...st)", { st: ["todo", "in_progress"] })
      .andWhere("archived_at IS NULL")
      .andWhere("execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
      .andWhere(
        new Brackets((qb) => {
          qb.where("reminder_at IS NOT NULL AND reminder_at <= :now", { now }).orWhere(
            new Brackets((qb2) => {
              qb2
                .where("due_at IS NOT NULL AND due_at <= :now", { now })
                .andWhere("reminder_at IS NULL")
                .andWhere("scheduled_for IS NULL")
                .andWhere("execution_type IN (:...rt)", { rt: ["reminder", "reminder_only"] });
            })
          );
        })
      )
      .andWhere("(execution_lease_expires_at IS NULL OR execution_lease_expires_at < :now)", { now })
      .execute();
    return (res.affected ?? 0) > 0;
  }

  private async finalizeReminderDelivery(task: WorkspaceTaskEntity, userId: string, now: Date) {
    this.emitExecution(userId, task, "running", { outcome: "reminder_in_progress" });

    const route = resolveMalvTaskExecutionRoute(task);
    const correlationId = randomUUID();
    const delivery = await this.notificationDelivery.deliver({
      userId,
      kind: "task_reminder",
      title: task.title,
      body: task.description ?? null,
      taskId: task.id,
      correlationId,
      payload: { route, taskId: task.id }
    });

    await this.activity.record({
      userId,
      activityType: "malv_notification_delivery",
      roomId: task.roomId ?? null,
      conversationId: task.conversationId ?? null,
      entityId: task.id,
      title: `Reminder delivery: ${task.title}`,
      payloadJson: {
        taskId: task.id,
        notificationId: delivery.notificationId,
        tier: delivery.tier,
        websocketDelivered: delivery.websocketDelivered
      }
    });

    const nextMeta = {
      ...(task.metadata ?? {}),
      malvLastReminderAt: now.toISOString(),
      malvReminderRoute: route,
      malvReminderDelivery: {
        tier: delivery.tier,
        notificationId: delivery.notificationId,
        websocketDelivered: delivery.websocketDelivered,
        nativePush: false
      }
    };

    await this.tasks.update(
      { id: task.id },
      {
        reminderAt: null,
        executionState: "pending" as WorkspaceTaskExecutionState,
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        executionLastOutcome: "reminder_delivered",
        executionFailureCode: null,
        executionFailureDetail: null,
        metadata: nextMeta
      }
    );

    const saved = await this.tasks.findOne({ where: { id: task.id }, relations: ["user"] });
    if (!saved) return;

    const detail =
      delivery.tier === "websocket_live"
        ? "Reminder delivered via live websocket and persisted to the in-app notification center. Native OS push is not enabled in this deployment."
        : delivery.tier === "persisted_inbox_only"
          ? "No live websocket session; reminder stored in the in-app notification center for later visibility."
          : "Kill-switch or delivery constraints prevented a live channel; see notification record.";

    this.emitExecution(userId, saved, "completed", {
      outcome: "reminder_delivered",
      reasonCode: "reminder_only",
      malvDeliveryTier: delivery.tier,
      detail
    });
    await this.activity.record({
      userId,
      activityType: "task_reminder_delivered",
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: `Reminder: ${saved.title}`,
      payloadJson: {
        taskId: saved.id,
        route,
        outcome: "reminder_delivered",
        deliveryTier: delivery.tier,
        notificationId: delivery.notificationId
      }
    });
  }

  private async processScheduledExecutionBatch(now: Date): Promise<number> {
    let n = 0;
    const take = this.batchSize();
    for (let i = 0; i < take; i++) {
      const row = await this.tasks
        .createQueryBuilder("t")
        .innerJoinAndSelect("t.user", "u")
        .where("t.scheduled_for IS NOT NULL AND t.scheduled_for <= :now", { now })
        .andWhere("t.requires_approval = 0")
        .andWhere("t.status IN (:...st)", { st: ["todo", "in_progress"] })
        .andWhere("t.archived_at IS NULL")
        .andWhere("t.execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
        .orderBy("t.scheduled_for", "ASC")
        .getOne();

      if (!row) break;

      const claimed = await this.tryClaimForScheduled(row.id, now);
      if (!claimed) continue;

      const task = await this.tasks.findOne({ where: { id: row.id }, relations: ["user"] });
      if (!task) continue;

      const userId = this.userIdOf(task);
      await this.executeRoutedTask(task, userId, now);
      n += 1;
    }
    return n;
  }

  private async tryClaimForScheduled(taskId: string, now: Date): Promise<boolean> {
    const owner = this.ownerName();
    const leaseUntil = new Date(now.getTime() + this.leaseMs());
    const res = await this.tasks
      .createQueryBuilder()
      .update(WorkspaceTaskEntity)
      .set({
        executionState: "dispatched",
        executionLeaseOwner: owner,
        executionLeaseExpiresAt: leaseUntil,
        executionLastAttemptAt: now
      })
      .where("id = :id", { id: taskId })
      .andWhere("scheduled_for IS NOT NULL AND scheduled_for <= :now", { now })
      .andWhere("requires_approval = 0")
      .andWhere("status IN (:...st)", { st: ["todo", "in_progress"] })
      .andWhere("archived_at IS NULL")
      .andWhere("execution_state IN (:...es)", { es: [...MALV_TASK_SCAN_ELIGIBLE_STATES] })
      .andWhere("(execution_lease_expires_at IS NULL OR execution_lease_expires_at < :now)", { now })
      .execute();
    return (res.affected ?? 0) > 0;
  }

  private async executeRoutedTask(task: WorkspaceTaskEntity, userId: string, now: Date) {
    const route = resolveMalvTaskExecutionRoute(task);
    this.emitExecution(userId, task, "dispatched", { route, outcome: "dispatching" });

    await this.tasks.update(
      { id: task.id },
      {
        executionState: "running",
        executionLastAttemptAt: now
      }
    );
    const running = await this.tasks.findOne({ where: { id: task.id }, relations: ["user"] });
    if (!running) return;
    this.emitExecution(userId, running, "running", { route });

    const bridgeReport = await this.bridgeResolver.resolveForUser(userId, now);
    await this.activity.record({
      userId,
      activityType: "malv_bridge_capability_resolved",
      roomId: running.roomId ?? null,
      conversationId: running.conversationId ?? null,
      entityId: running.id,
      title: `Bridge capability resolved for task`,
      payloadJson: {
        taskId: running.id,
        route,
        liveBridges: bridgeReport.liveBridgeKinds,
        endpoints: bridgeReport.endpoints
      }
    });

    if (route === "external_action") {
      const ext = await this.handleExternalActionScheduled(running, userId, now, bridgeReport);
      if (ext) {
        if (ext.mode === "waiting_ack") {
          const meta = { ...(running.metadata ?? {}), ...ext.metadataPatch };
          await this.tasks.update(
            { id: running.id },
            {
              executionState: "waiting_input",
              executionLeaseOwner: this.ownerName(),
              executionLeaseExpiresAt: ext.leaseUntil,
              executionLastOutcome: "external_action_dispatched",
              executionFailureCode: "awaiting_executor_ack",
              executionFailureDetail: "Dispatched to client executor; awaiting explicit acknowledgement.",
              scheduledFor: running.scheduledFor,
              metadata: meta as any
            }
          );
          const saved = await this.tasks.findOne({ where: { id: running.id }, relations: ["user"] });
          if (saved) {
            this.emitExecution(userId, saved, "waiting_for_external_ack", {
              route,
              dispatchId: ext.dispatchId,
              correlationId: ext.correlationId,
              outcome: "awaiting_executor_ack"
            });
          }
          await this.activity.record({
            userId,
            activityType: "malv_external_dispatch_attempted",
            roomId: running.roomId ?? null,
            conversationId: running.conversationId ?? null,
            entityId: running.id,
            title: `External action dispatched: ${running.title}`,
            payloadJson: {
              taskId: running.id,
              dispatchId: ext.dispatchId,
              correlationId: ext.correlationId
            }
          });
        } else {
          await this.applyRunResult(running.id, userId, route, ext.result, running.scheduledFor, running.metadata);
        }
        return;
      }
    }

    const cap = await this.inferenceCapability();
    const workflowFlag = this.cfg.get<string>("MALV_TASK_WORKFLOW_ORCHESTRATOR_ENABLED") === "true";
    const result = await this.runRoute(route, running, now, cap, bridgeReport, workflowFlag);

    await this.applyRunResult(running.id, userId, route, result, running.scheduledFor, running.metadata);
  }

  private async applyRunResult(
    taskId: string,
    userId: string,
    route: MalvTaskExecutionRoute,
    result: RunRouteResult,
    previousScheduled: Date | null | undefined,
    previousMetadata: Record<string, unknown> | null | undefined
  ) {
    const baseUpdate: Record<string, unknown> = {
      executionState: result.terminalState,
      executionLastOutcome: result.outcome,
      executionFailureCode: result.failureCode ?? null,
      executionFailureDetail: result.failureDetail ?? null,
      executionLeaseOwner: null,
      executionLeaseExpiresAt: null,
      scheduledFor: result.clearScheduled ? null : previousScheduled
    };
    if (result.metadataPatch) {
      baseUpdate.metadata = { ...(previousMetadata ?? {}), ...result.metadataPatch };
    }
    await this.tasks.update({ id: taskId }, baseUpdate as any);

    const saved = await this.tasks.findOne({ where: { id: taskId }, relations: ["user"] });
    if (!saved) return;

    const phase =
      result.terminalState === "completed"
        ? "completed"
        : result.terminalState === "failed"
          ? "failed"
          : "blocked";
    this.emitExecution(userId, saved, phase, {
      route,
      outcome: result.outcome,
      reasonCode: result.failureCode ?? undefined,
      executorPath: result.executorPath
    });

    await this.activity.record({
      userId,
      activityType: result.activityType,
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: result.activityTitle,
      payloadJson: {
        taskId: saved.id,
        route,
        terminalState: saved.executionState,
        outcome: result.outcome,
        failureCode: result.failureCode ?? null,
        executorPath: result.executorPath ?? null
      }
    });
  }

  private async handleExternalActionScheduled(
    task: WorkspaceTaskEntity,
    userId: string,
    now: Date,
    bridgeReport: MalvBridgeCapabilityReport
  ): Promise<ExternalScheduleHandled | null> {
    const ks = await this.killSwitch.getState();
    if (!ks.systemOn) {
      return {
        mode: "terminal",
        result: {
          terminalState: "blocked",
          outcome: "external_action_blocked",
          failureCode: "kill_switch",
          failureDetail: "Kill switch disabled external execution and delivery.",
          clearScheduled: false,
          metadataPatch: { malvLastScheduledExecutionAt: now.toISOString(), malvLastExecutionRoute: "external_action" as const },
          activityType: "task_execution_blocked",
          activityTitle: `Blocked (kill switch): ${task.title}`,
          executorPath: "task_engine:external_kill_switch"
        }
      };
    }

    const envelope = this.externalDispatch.parseEnvelope(task.metadata ?? undefined);
    if (!envelope) {
      return {
        mode: "terminal",
        result: {
          terminalState: "blocked",
          outcome: "external_action_not_executable",
          failureCode: "external_action_spec_missing",
          failureDetail: "Missing metadata.malvExternalActionV1 — MALV will not guess external payloads.",
          clearScheduled: false,
          metadataPatch: { malvLastScheduledExecutionAt: now.toISOString(), malvLastExecutionRoute: "external_action" as const },
          activityType: "task_execution_blocked",
          activityTitle: `Blocked (external spec): ${task.title}`,
          executorPath: "task_engine:external_action_spec"
        }
      };
    }

    if (envelope.kind === "show_notification") {
      const requestKey = this.externalDispatch.buildRequestKey(task);
      const begunNotify = await this.externalDispatch.beginDispatch({
        userId,
        task,
        now,
        cap: bridgeReport,
        requestKey
      });
      if (begunNotify.ok) {
        const leaseUntil = new Date(now.getTime() + this.externalAckLeaseMs());
        return {
          mode: "waiting_ack",
          leaseUntil,
          dispatchId: begunNotify.dispatchId,
          correlationId: begunNotify.correlationId,
          metadataPatch: {
            malvLastScheduledExecutionAt: now.toISOString(),
            malvLastExecutionRoute: "external_action" as const,
            malvExternalAwaitingAck: true,
            malvExternalDispatchId: begunNotify.dispatchId,
            malvExternalCorrelationId: begunNotify.correlationId,
            malvBridgeCapabilityAtDispatch: bridgeReport
          }
        };
      }
      if (begunNotify.ok === false && begunNotify.code === "capability_unavailable") {
        const title = String((envelope.params as any)?.title ?? task.title);
        const body = (envelope.params as any)?.body != null ? String((envelope.params as any).body) : null;
        const delivery = await this.notificationDelivery.deliver({
          userId,
          kind: "external_show_notification",
          title,
          body,
          taskId: task.id,
          correlationId: randomUUID(),
          payload: { envelope }
        });
        await this.activity.record({
          userId,
          activityType: "malv_notification_delivery",
          roomId: task.roomId ?? null,
          conversationId: task.conversationId ?? null,
          entityId: task.id,
          title: `External notification delivered: ${task.title}`,
          payloadJson: { taskId: task.id, tier: delivery.tier, notificationId: delivery.notificationId }
        });
        return {
          mode: "terminal",
          result: {
            terminalState: "completed",
            outcome: "external_show_notification_delivered",
            clearScheduled: true,
            metadataPatch: {
              malvLastScheduledExecutionAt: now.toISOString(),
              malvLastExecutionRoute: "external_action" as const,
              malvExternalNotificationDelivery: delivery
            },
            activityType: "task_execution_surfaced",
            activityTitle: `Notification surfaced: ${task.title}`,
            executorPath: "task_engine:external_show_notification"
          }
        };
      }
      const { code, detail } = begunNotify;
      const failureCode =
        code === "kill_switch"
          ? "kill_switch"
          : code === "high_risk_blocked"
            ? "high_risk_blocked"
            : code === "unsupported_action"
              ? "unsupported_action"
              : code === "executor_route_unavailable"
                ? "device_offline"
              : code === "duplicate_dispatch"
                ? "duplicate_dispatch"
                : code === "malformed_external_action"
                  ? "external_action_spec_missing"
                  : "external_dispatch_blocked";
      return {
        mode: "terminal",
        result: {
          terminalState: "blocked",
          outcome: "external_action_not_executable",
          failureCode,
          failureDetail: detail,
          clearScheduled: false,
          metadataPatch: {
            malvLastScheduledExecutionAt: now.toISOString(),
            malvLastExecutionRoute: "external_action" as const,
            malvExternalDispatchError: { code, detail }
          },
          activityType: "task_execution_blocked",
          activityTitle: `Blocked (external): ${task.title}`,
          executorPath: "task_engine:external_dispatch_gate"
        }
      };
    }

    const requestKey = this.externalDispatch.buildRequestKey(task);
    const begun = await this.externalDispatch.beginDispatch({
      userId,
      task,
      now,
      cap: bridgeReport,
      requestKey
    });

    if (!begun.ok) {
      const { code, detail } = begun;
      const failureCode =
        code === "kill_switch"
          ? "kill_switch"
          : code === "capability_unavailable"
            ? "capability_unavailable"
            : code === "high_risk_blocked"
              ? "high_risk_blocked"
              : code === "unsupported_action"
                ? "unsupported_action"
                : code === "executor_route_unavailable"
                  ? "device_offline"
                : code === "duplicate_dispatch"
                  ? "duplicate_dispatch"
                  : code === "malformed_external_action"
                    ? "external_action_spec_missing"
                    : code === "use_notification_service"
                      ? "routing_misconfiguration"
                      : "external_dispatch_blocked";
      return {
        mode: "terminal",
        result: {
          terminalState: "blocked",
          outcome: "external_action_not_executable",
          failureCode,
          failureDetail: detail,
          clearScheduled: false,
          metadataPatch: {
            malvLastScheduledExecutionAt: now.toISOString(),
            malvLastExecutionRoute: "external_action" as const,
            malvExternalDispatchError: { code, detail }
          },
          activityType: "task_execution_blocked",
          activityTitle: `Blocked (external): ${task.title}`,
          executorPath: "task_engine:external_dispatch_gate"
        }
      };
    }

    const leaseUntil = new Date(now.getTime() + this.externalAckLeaseMs());
    return {
      mode: "waiting_ack",
      leaseUntil,
      dispatchId: begun.dispatchId,
      correlationId: begun.correlationId,
      metadataPatch: {
        malvLastScheduledExecutionAt: now.toISOString(),
        malvLastExecutionRoute: "external_action" as const,
        malvExternalAwaitingAck: true,
        malvExternalDispatchId: begun.dispatchId,
        malvExternalCorrelationId: begun.correlationId,
        malvBridgeCapabilityAtDispatch: bridgeReport
      }
    };
  }

  private async inferenceCapability(): Promise<{ ok: boolean; detail: string }> {
    try {
      const h = await this.beastWorker.health();
      if (h.inferenceReady || Boolean(h.fallbackActive)) {
        return { ok: true, detail: h.detail ?? "worker_ready" };
      }
      return {
        ok: false,
        detail: h.detail ?? h.primarySkipReason ?? h.inferenceTelemetry?.lastErrorSummary ?? "inference_not_ready"
      };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  private async runRoute(
    route: MalvTaskExecutionRoute,
    task: WorkspaceTaskEntity,
    now: Date,
    cap: { ok: boolean; detail: string },
    bridgeReport: MalvBridgeCapabilityReport,
    workflowOrchestratorEnabled: boolean
  ): Promise<RunRouteResult> {
    const baseMeta = {
      malvLastScheduledExecutionAt: now.toISOString(),
      malvLastExecutionRoute: route,
      malvBridgeCapabilitySnapshot: bridgeReport
    };

    switch (route) {
      case "reminder_only": {
        const correlationId = randomUUID();
        const delivery = await this.notificationDelivery.deliver({
          userId: this.userIdOf(task),
          kind: "scheduled_reminder_style",
          title: task.title,
          body: task.description ?? null,
          taskId: task.id,
          correlationId,
          payload: { route: "reminder_only" }
        });
        await this.activity.record({
          userId: this.userIdOf(task),
          activityType: "malv_notification_delivery",
          roomId: task.roomId ?? null,
          conversationId: task.conversationId ?? null,
          entityId: task.id,
          title: `Scheduled reminder delivery: ${task.title}`,
          payloadJson: { taskId: task.id, tier: delivery.tier, notificationId: delivery.notificationId }
        });
        return {
          terminalState: "completed",
          outcome: "reminder_style_completed",
          clearScheduled: true,
          metadataPatch: {
            ...baseMeta,
            malvExecutionNote: "Scheduled reminder-style task surfaced via notification delivery abstraction.",
            malvScheduledReminderDelivery: delivery
          },
          activityType: "task_reminder_delivered",
          activityTitle: `Scheduled reminder surfaced: ${task.title}`,
          executorPath: "task_engine:reminder_only"
        };
      }
      case "call_followup": {
        const correlationId = randomUUID();
        const delivery = await this.notificationDelivery.deliver({
          userId: this.userIdOf(task),
          kind: "call_followup",
          title: `Call follow-up: ${task.title}`,
          body: task.description ?? null,
          taskId: task.id,
          correlationId,
          payload: { callSessionId: task.callSessionId ?? null, conversationId: task.conversationId ?? null }
        });
        await this.activity.record({
          userId: this.userIdOf(task),
          activityType: "malv_notification_delivery",
          roomId: task.roomId ?? null,
          conversationId: task.conversationId ?? null,
          entityId: task.id,
          title: `Call follow-up delivery: ${task.title}`,
          payloadJson: { taskId: task.id, tier: delivery.tier }
        });
        return {
          terminalState: "completed",
          outcome: "call_followup_prompt",
          clearScheduled: true,
          metadataPatch: {
            ...baseMeta,
            malvCallFollowup: {
              callSessionId: task.callSessionId ?? null,
              conversationId: task.conversationId ?? null
            },
            malvCallFollowupDelivery: delivery,
            malvExecutionNote:
              "MALV delivered a call follow-up notification. No outbound call or external automation was performed."
          },
          activityType: "task_execution_surfaced",
          activityTitle: `Call follow-up: ${task.title}`,
          executorPath: "task_engine:call_followup_notify"
        };
      }
      case "chat_followup": {
        const correlationId = randomUUID();
        const delivery = await this.notificationDelivery.deliver({
          userId: this.userIdOf(task),
          kind: "chat_followup",
          title: `Chat follow-up: ${task.title}`,
          body: task.description ?? null,
          taskId: task.id,
          correlationId,
          payload: { conversationId: task.conversationId ?? null }
        });
        await this.activity.record({
          userId: this.userIdOf(task),
          activityType: "malv_notification_delivery",
          roomId: task.roomId ?? null,
          conversationId: task.conversationId ?? null,
          entityId: task.id,
          title: `Chat follow-up delivery: ${task.title}`,
          payloadJson: { taskId: task.id, tier: delivery.tier }
        });
        return {
          terminalState: "completed",
          outcome: "chat_followup_feed",
          clearScheduled: true,
          metadataPatch: {
            ...baseMeta,
            malvChatFollowup: { conversationId: task.conversationId ?? null },
            malvChatFollowupDelivery: delivery,
            malvExecutionNote:
              "MALV delivered a chat follow-up notification. No autonomous chat message was sent by the task engine."
          },
          activityType: "task_execution_surfaced",
          activityTitle: `Chat follow-up: ${task.title}`,
          executorPath: "task_engine:chat_followup_feed"
        };
      }
      case "external_action": {
        return {
          terminalState: "blocked",
          outcome: "external_action_not_executable",
          failureCode: "external_action_unsupported",
          failureDetail: "External action route fell through without dispatch — check engine wiring.",
          clearScheduled: false,
          metadataPatch: baseMeta,
          activityType: "task_execution_blocked",
          activityTitle: `Blocked (external action): ${task.title}`,
          executorPath: "task_engine:external_action_guard"
        };
      }
      case "workflow_task": {
        if (!cap.ok) {
          return {
            terminalState: "failed",
            outcome: "missing_executor_capability",
            failureCode: "inference_unavailable",
            failureDetail: `Workflow-style task not executed: ${cap.detail}`,
            clearScheduled: false,
            metadataPatch: baseMeta,
            activityType: "task_execution_failed",
            activityTitle: `Failed (no inference path): ${task.title}`,
            executorPath: "task_engine:workflow_capability_gate"
          };
        }
        if (!workflowOrchestratorEnabled) {
          return {
            terminalState: "blocked",
            outcome: "workflow_orchestration_not_wired",
            failureCode: "workflow_dispatch_unavailable",
            failureDetail:
              "Internal agent orchestrator path exists but is disabled (MALV_TASK_WORKFLOW_ORCHESTRATOR_ENABLED is not true).",
            clearScheduled: false,
            metadataPatch: baseMeta,
            activityType: "task_execution_blocked",
            activityTitle: `Blocked (workflow not enabled): ${task.title}`,
            executorPath: "task_engine:workflow_policy"
          };
        }
        try {
          const userId = this.userIdOf(task);
          const ctx: MalvAgentRequestContext = {
            traceId: randomUUID(),
            userId,
            workspaceId: null,
            conversationId: task.conversationId ?? null,
            vaultScoped: false,
            surface: "task",
            latencySensitive: false,
            privacySensitive: false,
            callId: task.callSessionId ?? null
          };
          const routerInput: MalvTaskRouterInput = {
            surface: "task",
            userText: `${task.title}\n${task.description ?? ""}`.slice(0, 4000),
            vaultScoped: false,
            studioContext: false,
            callActive: Boolean(task.callSessionId),
            deviceHookActive: false
          };
          const { result } = await this.malvOrchestrator.runAdvisoryLifecycleWithDefaultInputs({
            ctx,
            routerInput,
            timeoutMs: 25_000
          });
          const stopped = result.stoppedReason ?? "complete";
          const ok = stopped === "complete" || stopped === "step_cap";
          return {
            terminalState: ok ? "completed" : "failed",
            outcome: ok ? "workflow_orchestrator_completed" : "workflow_orchestrator_failed",
            failureCode: ok ? null : "workflow_orchestrator_error",
            failureDetail: ok ? null : `Agent lifecycle stopped: ${stopped}`,
            clearScheduled: ok,
            metadataPatch: {
              ...baseMeta,
              malvWorkflowOrchestrator: {
                stoppedReason: stopped,
                telemetry: result.telemetry
              }
            },
            activityType: ok ? "task_execution_surfaced" : "task_execution_failed",
            activityTitle: ok ? `Workflow advisory completed: ${task.title}` : `Workflow advisory failed: ${task.title}`,
            executorPath: "task_engine:malv_agent_orchestrator"
          };
        } catch (e) {
          return {
            terminalState: "failed",
            outcome: "workflow_orchestrator_threw",
            failureCode: "workflow_orchestrator_exception",
            failureDetail: e instanceof Error ? e.message : String(e),
            clearScheduled: false,
            metadataPatch: baseMeta,
            activityType: "task_execution_failed",
            activityTitle: `Failed (workflow exception): ${task.title}`,
            executorPath: "task_engine:workflow_exception"
          };
        }
      }
      case "manual_checklist":
      default: {
        return {
          terminalState: "blocked",
          outcome: "manual_checklist_due",
          failureCode: "manual_completion_required",
          failureDetail:
            "This checklist-style task requires human completion. MALV surfaced it as due but did not auto-complete items.",
          clearScheduled: true,
          metadataPatch: {
            ...baseMeta,
            malvExecutionNote: "Manual checklist — user action required."
          },
          activityType: "task_execution_blocked",
          activityTitle: `Needs manual completion: ${task.title}`,
          executorPath: "task_engine:manual_checklist"
        };
      }
    }
  }
}

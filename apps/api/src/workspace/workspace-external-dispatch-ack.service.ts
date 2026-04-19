import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceActivityService } from "./workspace-activity.service";
import { MalvExternalActionDispatchService } from "../execution-bridge/malv-external-action-dispatch.service";

@Injectable()
export class WorkspaceExternalDispatchAckService {
  constructor(
    private readonly dispatch: MalvExternalActionDispatchService,
    @InjectRepository(WorkspaceTaskEntity) private readonly tasks: Repository<WorkspaceTaskEntity>,
    private readonly activity: WorkspaceActivityService,
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway
  ) {}

  private userIdOf(task: WorkspaceTaskEntity): string {
    const u = task.user as { id?: string } | undefined;
    return u?.id ?? (task as unknown as { userId?: string }).userId ?? "";
  }

  private completionLeaseMs(): number {
    return Math.max(120_000, Number(this.cfg.get<string>("MALV_EXTERNAL_ACTION_COMPLETION_LEASE_MS") ?? String(10 * 60 * 1000)));
  }

  private emitExecution(userId: string, task: WorkspaceTaskEntity, phase: string, extra?: Record<string, unknown>) {
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
  }

  async acknowledge(args: {
    userId: string;
    dispatchId: string;
    status: "accepted" | "completed" | "rejected" | "failed";
    reason?: string | null;
    detail?: string | null;
    result?: Record<string, unknown> | null;
    executedAt?: string | null;
    deviceId?: string | null;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const applied = await this.dispatch.applyClientAck({
      userId: args.userId,
      dispatchId: args.dispatchId,
      status: args.status,
      reason: args.reason ?? null,
      detail: args.detail ?? null,
      result: args.result ?? null,
      executedAt: args.executedAt ?? null,
      deviceId: args.deviceId ?? null
    });
    if (!applied.ok) {
      if (applied.code === "wrong_executor_device") {
        return { ok: false, error: "wrong_executor_device" };
      }
      return { ok: false, error: applied.code === "not_found" ? "not_found" : "invalid_transition" };
    }

    const { row, duplicate } = applied;

    if (args.status === "accepted") {
      if (duplicate) {
        return { ok: true };
      }
      const task = await this.tasks.findOne({ where: { id: row.taskId }, relations: ["user"] });
      if (!task) return { ok: false, error: "task_missing" };
      const userId = this.userIdOf(task);
      const until = new Date(Date.now() + this.completionLeaseMs());
      await this.tasks.update(
        { id: task.id },
        {
          executionState: "waiting_input",
          executionLeaseOwner: null,
          executionLeaseExpiresAt: until,
          executionLastOutcome: "external_action_accepted",
          executionFailureCode: "awaiting_executor_completion",
          executionFailureDetail: "Executor accepted; awaiting completion acknowledgement.",
          metadata: {
            ...(task.metadata ?? {}),
            malvExternalAwaitingAck: true,
            malvExternalDispatchAcceptedAt: new Date().toISOString(),
            malvExternalDispatchAcceptedDeviceId: args.deviceId ?? null,
            malvExternalContinuity: {
              dispatchId: row.id,
              phase: "accepted",
              acceptedAt: new Date().toISOString(),
              activeDeviceId: args.deviceId ?? null
            }
          } as any
        }
      );
      const fresh = await this.tasks.findOne({ where: { id: task.id }, relations: ["user"] });
      if (fresh) {
        this.emitExecution(userId, fresh, "external_action_accepted", {
          dispatchId: row.id,
          outcome: "awaiting_executor_completion"
        });
      }
      await this.activity.record({
        userId,
        activityType: "malv_external_dispatch_ack",
        roomId: task.roomId ?? null,
        conversationId: task.conversationId ?? null,
        entityId: task.id,
        title: `External action accepted: ${task.title}`,
        payloadJson: {
          taskId: task.id,
          dispatchId: row.id,
          status: "accepted",
          deviceId: args.deviceId ?? null
        }
      });
      return { ok: true };
    }

    if (duplicate) {
      return { ok: true };
    }

    const task = await this.tasks.findOne({ where: { id: row.taskId }, relations: ["user"] });
    if (!task) return { ok: false, error: "task_missing" };

    const userId = this.userIdOf(task);
    const meta = { ...(task.metadata ?? {}) };
    delete (meta as any).malvExternalAwaitingAck;

    if (args.status === "completed") {
      await this.tasks.update(
        { id: task.id },
        {
          executionState: "completed",
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          executionLastOutcome: "external_action_completed",
          executionFailureCode: null,
          executionFailureDetail: null,
          scheduledFor: null,
          metadata: {
            ...meta,
            malvExternalDispatchOutcome: {
              dispatchId: row.id,
              status: "completed",
              at: new Date().toISOString(),
              deviceId: args.deviceId ?? null,
              agentResult: args.result ?? undefined
            },
            malvExternalContinuity: {
              dispatchId: row.id,
              phase: "completed",
              completedAt: new Date().toISOString(),
              activeDeviceId: args.deviceId ?? null
            }
          } as any
        }
      );
    } else {
      const code = args.status === "rejected" ? "executor_rejected" : "executor_failed";
      await this.tasks.update(
        { id: task.id },
        {
          executionState: "failed",
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          executionLastOutcome: "external_action_failed",
          executionFailureCode: code,
          executionFailureDetail: args.detail ?? args.reason ?? code,
          metadata: {
            ...meta,
            malvExternalDispatchOutcome: {
              dispatchId: row.id,
              status: args.status,
              reason: args.reason ?? null,
              at: new Date().toISOString(),
              deviceId: args.deviceId ?? null,
              agentResult: args.result ?? undefined
            },
            malvExternalContinuity: {
              dispatchId: row.id,
              phase: args.status,
              terminalAt: new Date().toISOString(),
              activeDeviceId: args.deviceId ?? null
            }
          } as any
        }
      );
    }

    const fresh = await this.tasks.findOne({ where: { id: task.id }, relations: ["user"] });
    if (fresh) {
      this.emitExecution(userId, fresh, args.status === "completed" ? "completed" : "failed", {
        outcome: fresh.executionLastOutcome,
        reasonCode: fresh.executionFailureCode ?? undefined
      });
    }

    await this.activity.record({
      userId,
      activityType: "malv_external_dispatch_ack",
      roomId: task.roomId ?? null,
      conversationId: task.conversationId ?? null,
      entityId: task.id,
      title: `External action ${args.status}: ${task.title}`,
      payloadJson: {
        taskId: task.id,
        dispatchId: row.id,
        status: args.status,
        reason: args.reason ?? null,
        deviceId: args.deviceId ?? null
      }
    });
    return { ok: true };
  }
}

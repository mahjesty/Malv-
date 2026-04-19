import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  WorkspaceTaskEntity,
  type WorkspaceTaskExecutionState,
  type WorkspaceTaskExecutionType,
  type WorkspaceTaskPriority,
  type WorkspaceTaskRiskLevel,
  type WorkspaceTaskSource,
  type WorkspaceTaskStatus
} from "../db/entities/workspace-task.entity";
import {
  WorkspaceApprovalItemEntity,
  type WorkspaceApprovalRiskLevel,
  type WorkspaceApprovalSource,
  type WorkspaceApprovalStatus
} from "../db/entities/workspace-approval-item.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { CallSessionEntity } from "../db/entities/call-session.entity";
import { MessageEntity } from "../db/entities/message.entity";
import type { GlobalRole } from "./workspace-access.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WorkspaceActivityService } from "./workspace-activity.service";
import { AuthorizationService } from "../common/authorization/authorization.service";

@Injectable()
export class WorkspaceProductivityService {
  constructor(
    @InjectRepository(WorkspaceTaskEntity) private readonly tasks: Repository<WorkspaceTaskEntity>,
    @InjectRepository(WorkspaceApprovalItemEntity) private readonly approvals: Repository<WorkspaceApprovalItemEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly sandboxApprovals: Repository<SandboxApprovalRequestEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(CallSessionEntity) private readonly calls: Repository<CallSessionEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly activity: WorkspaceActivityService,
    private readonly authz: AuthorizationService
  ) {}

  async listTasks(userId: string, args?: { status?: WorkspaceTaskStatus; limit?: number; assignedToMe?: boolean }) {
    const take = Math.min(200, Math.max(1, args?.limit ?? 100));
    const where: any = args?.assignedToMe
      ? args.status
        ? [{ assigneeUserId: userId, status: args.status }, { assigneeUserId: null, user: { id: userId }, status: args.status }]
        : [{ assigneeUserId: userId }, { assigneeUserId: null, user: { id: userId } }]
      : { user: { id: userId }, ...(args?.status ? { status: args.status } : {}) };
    const rows = await this.tasks.find({ where, order: { updatedAt: "DESC" }, take });
    return rows;
  }

  async createTask(args: {
    userId: string;
    title: string;
    description?: string | null;
    status?: WorkspaceTaskStatus;
    priority?: WorkspaceTaskPriority;
    source?: WorkspaceTaskSource | string;
    sourceSurface?: WorkspaceTaskSource | string;
    sourceType?: string | null;
    sourceReferenceId?: string | null;
    executionType?: WorkspaceTaskExecutionType;
    conversationId?: string | null;
    callSessionId?: string | null;
    roomId?: string | null;
    sourceFingerprint?: string | null;
    metadata?: Record<string, unknown> | null;
    assigneeUserId?: string | null;
    dueAt?: string | Date | null;
    scheduledFor?: string | Date | null;
    reminderAt?: string | Date | null;
    requiresApproval?: boolean;
    riskLevel?: WorkspaceTaskRiskLevel;
    tags?: string[] | null;
  }) {
    const title = args.title.trim();
    if (!title) throw new BadRequestException("Task title is required.");
    if (args.roomId) {
      await this.authz.assertRoomMemberOrThrow({ userId: args.userId, roomId: args.roomId });
    }
    if (args.sourceFingerprint) {
      const exists = await this.tasks.findOne({
        where: { user: { id: args.userId }, sourceFingerprint: args.sourceFingerprint }
      });
      if (exists) return exists;
    }
    const surface = (args.sourceSurface ?? args.source ?? "manual") as WorkspaceTaskSource;
    const row = this.tasks.create({
      user: { id: args.userId } as any,
      title: title.slice(0, 220),
      description: args.description ?? null,
      status: args.status ?? "todo",
      priority: args.priority ?? "normal",
      source: surface,
      sourceSurface: surface,
      sourceType: args.sourceType ?? null,
      sourceReferenceId: args.sourceReferenceId ?? null,
      executionType: args.executionType ?? "manual",
      executionState: "idle",
      conversationId: args.conversationId ?? null,
      callSessionId: args.callSessionId ?? null,
      roomId: args.roomId ?? null,
      assigneeUserId: args.assigneeUserId ?? null,
      sourceFingerprint: args.sourceFingerprint ?? null,
      metadata: args.metadata ?? null,
      dueAt: args.dueAt ? new Date(args.dueAt) : null,
      scheduledFor: args.scheduledFor ? new Date(args.scheduledFor) : null,
      reminderAt: args.reminderAt ? new Date(args.reminderAt) : null,
      requiresApproval: args.requiresApproval ?? false,
      riskLevel: args.riskLevel ?? "low",
      tags: args.tags ?? null
    });
    const saved = await this.tasks.save(row);
    this.realtime.emitToUser(args.userId, "workspace:task_changed", { action: "created", task: saved });
    if (saved.roomId) this.realtime.emitToRoom(saved.roomId, "room:task_changed", { action: "created", task: saved });
    await this.activity.record({
      userId: args.userId,
      activityType: "task_created",
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: `Task created: ${saved.title}`,
      payloadJson: { taskId: saved.id, status: saved.status, priority: saved.priority }
    });
    return saved;
  }

  async createTaskFromChatOutput(args: { userId: string; messageId: string; title?: string | null; description?: string | null }) {
    const msg = await this.messages.findOne({
      where: { id: args.messageId, user: { id: args.userId }, role: "assistant" },
      relations: ["conversation"]
    });
    if (!msg) throw new BadRequestException("Output message not found.");
    const content = (msg.content ?? "").trim();
    const derivedTitle = args.title?.trim() || content.slice(0, 120) || "Follow-up from chat output";
    const sourceFingerprint = `chat_output:${msg.id}`;
    const convId = (msg.conversation as any)?.id ?? null;
    return await this.createTask({
      userId: args.userId,
      title: derivedTitle,
      description: args.description ?? `Created from chat output message ${msg.id}.`,
      status: "todo",
      source: "chat",
      sourceSurface: "chat",
      sourceType: "conversation",
      sourceReferenceId: convId,
      conversationId: convId,
      sourceFingerprint,
      metadata: { sourceMessageId: msg.id }
    });
  }

  async updateTask(args: {
    userId: string;
    taskId: string;
    title?: string;
    description?: string | null;
    status?: WorkspaceTaskStatus;
    priority?: WorkspaceTaskPriority;
    executionState?: WorkspaceTaskExecutionState;
    assigneeUserId?: string | null;
    dueAt?: string | Date | null;
    scheduledFor?: string | Date | null;
    reminderAt?: string | Date | null;
    requiresApproval?: boolean;
    riskLevel?: WorkspaceTaskRiskLevel;
    tags?: string[] | null;
  }) {
    const row = await this.tasks.findOne({ where: { id: args.taskId, user: { id: args.userId } } });
    if (!row) throw new BadRequestException("Task not found.");
    if (args.title !== undefined) {
      const next = args.title.trim();
      if (!next) throw new BadRequestException("Task title cannot be empty.");
      row.title = next.slice(0, 220);
    }
    if (args.description !== undefined) row.description = args.description ?? null;
    if (args.status !== undefined) {
      row.status = args.status;
      if (args.status === "done" && !row.completedAt) row.completedAt = new Date();
      if (args.status === "archived" && !row.archivedAt) row.archivedAt = new Date();
    }
    if (args.priority !== undefined) row.priority = args.priority;
    if (args.executionState !== undefined) row.executionState = args.executionState;
    if (args.assigneeUserId !== undefined) row.assigneeUserId = args.assigneeUserId;
    if (args.dueAt !== undefined) row.dueAt = args.dueAt ? new Date(args.dueAt) : null;
    if (args.scheduledFor !== undefined) row.scheduledFor = args.scheduledFor ? new Date(args.scheduledFor) : null;
    if (args.reminderAt !== undefined) row.reminderAt = args.reminderAt ? new Date(args.reminderAt) : null;
    if (args.requiresApproval !== undefined) row.requiresApproval = args.requiresApproval;
    if (args.riskLevel !== undefined) row.riskLevel = args.riskLevel;
    if (args.tags !== undefined) row.tags = args.tags ?? null;
    const saved = await this.tasks.save(row);
    this.realtime.emitToUser(args.userId, "workspace:task_changed", { action: "updated", task: saved });
    if (saved.roomId) this.realtime.emitToRoom(saved.roomId, "room:task_changed", { action: "updated", task: saved });
    const activityType = saved.status === "done"
      ? "task_completed"
      : saved.status === "archived"
        ? "task_updated"
        : args.assigneeUserId !== undefined
          ? "task_assigned"
          : "task_updated";
    await this.activity.record({
      userId: args.userId,
      activityType,
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: saved.status === "done" ? `Task completed: ${saved.title}` : `Task updated: ${saved.title}`,
      payloadJson: { taskId: saved.id, status: saved.status, priority: saved.priority, assigneeUserId: saved.assigneeUserId ?? null }
    });
    return saved;
  }

  async markTaskComplete(args: { userId: string; taskId: string }) {
    return await this.updateTask({ userId: args.userId, taskId: args.taskId, status: "done" });
  }

  async archiveTask(args: { userId: string; taskId: string }) {
    return await this.updateTask({ userId: args.userId, taskId: args.taskId, status: "archived" });
  }

  private mapRisk(raw: string | null | undefined): WorkspaceApprovalRiskLevel {
    const x = (raw ?? "").toLowerCase();
    if (x === "critical" || x === "high" || x === "medium" || x === "low") return x;
    return "medium";
  }

  async syncSandboxApprovals(userId: string): Promise<void> {
    const rows = await this.sandboxApprovals.find({
      where: { user: { id: userId } },
      relations: ["sandboxRun"],
      order: { requestedAt: "DESC" },
      take: 100
    });
    for (const row of rows) {
      const sourceRefId = row.id;
      const exists = await this.approvals.findOne({
        where: { user: { id: userId }, source: "sandbox", sourceRefId }
      });
      const actionDescription = row.requestedCommand?.trim() || row.normalizedCommand?.trim() || row.reason?.trim() || "Sensitive sandbox action";
      const nextStatus: WorkspaceApprovalStatus = row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : "pending";
      if (!exists) {
        await this.approvals.save(
          this.approvals.create({
            user: { id: userId } as any,
            source: "sandbox",
            sourceRefId,
            actionDescription: actionDescription.slice(0, 4000),
            riskLevel: this.mapRisk(row.riskLevel),
            status: nextStatus,
            metadata: {
              sandboxRunId: (row.sandboxRun as any)?.id ?? null,
              sandboxApprovalRequestId: row.id
            }
          })
        );
        continue;
      }
      exists.actionDescription = actionDescription.slice(0, 4000);
      exists.riskLevel = this.mapRisk(row.riskLevel);
      exists.status = nextStatus;
      if (nextStatus !== "pending" && row.resolvedAt) {
        exists.resolvedAt = row.resolvedAt;
        exists.resolvedBy = row.resolvedBy ?? null;
      }
      await this.approvals.save(exists);
    }
  }

  async listApprovals(userId: string, args?: { status?: WorkspaceApprovalStatus; limit?: number }) {
    await this.syncSandboxApprovals(userId);
    const take = Math.min(200, Math.max(1, args?.limit ?? 100));
    const where: any = { user: { id: userId } };
    if (args?.status) where.status = args.status;
    return await this.approvals.find({ where, order: { updatedAt: "DESC" }, take });
  }

  async createApproval(args: {
    userId: string;
    source?: WorkspaceApprovalSource;
    sourceRefId?: string | null;
    actionDescription: string;
    riskLevel?: WorkspaceApprovalRiskLevel;
    conversationId?: string | null;
    callSessionId?: string | null;
    roomId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const desc = args.actionDescription.trim();
    if (!desc) throw new BadRequestException("Approval action description is required.");
    if (args.roomId) {
      await this.authz.assertRoomMemberOrThrow({ userId: args.userId, roomId: args.roomId });
    }
    if (args.sourceRefId) {
      const exists = await this.approvals.findOne({
        where: {
          user: { id: args.userId },
          source: args.source ?? "other",
          sourceRefId: args.sourceRefId
        }
      });
      if (exists) return exists;
    }
    const row = this.approvals.create({
      user: { id: args.userId } as any,
      source: args.source ?? "other",
      sourceRefId: args.sourceRefId ?? null,
      actionDescription: desc.slice(0, 4000),
      riskLevel: args.riskLevel ?? "medium",
      status: "pending",
      conversationId: args.conversationId ?? null,
      callSessionId: args.callSessionId ?? null,
      roomId: args.roomId ?? null,
      metadata: args.metadata ?? null
    });
    const saved = await this.approvals.save(row);
    this.realtime.emitToUser(args.userId, "workspace:approval_changed", { action: "created", approval: saved });
    if (saved.roomId) this.realtime.emitToRoom(saved.roomId, "room:approval_changed", { action: "created", approval: saved });
    await this.activity.record({
      userId: args.userId,
      activityType: "approval_created",
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: "Approval created",
      payloadJson: { approvalId: saved.id, riskLevel: saved.riskLevel, status: saved.status }
    });
    return saved;
  }

  async decideApproval(args: {
    userId: string;
    globalRole: GlobalRole;
    approvalId: string;
    decision: "approved" | "rejected";
  }) {
    const row = await this.approvals.findOne({ where: { id: args.approvalId, user: { id: args.userId } } });
    if (!row) throw new BadRequestException("Approval item not found.");
    if (row.status !== "pending") return row;
    if (row.source === "sandbox") {
      throw new BadRequestException("Sandbox approvals are resolved via sandbox approval control plane.");
    }
    if (args.globalRole !== "admin" && row.riskLevel === "critical") {
      throw new ForbiddenException("Critical approvals require admin review.");
    }
    row.status = args.decision;
    row.resolvedAt = new Date();
    row.resolvedBy = args.userId;
    const saved = await this.approvals.save(row);
    this.realtime.emitToUser(args.userId, "workspace:approval_changed", { action: "decided", approval: saved });
    if (saved.roomId) this.realtime.emitToRoom(saved.roomId, "room:approval_changed", { action: "decided", approval: saved });
    await this.activity.record({
      userId: args.userId,
      activityType: "approval_decided",
      roomId: saved.roomId ?? null,
      conversationId: saved.conversationId ?? null,
      entityId: saved.id,
      title: `Approval ${saved.status}`,
      payloadJson: { approvalId: saved.id, decision: saved.status }
    });
    return saved;
  }

  async workspaceSummary(args: { userId: string }) {
    await this.syncSandboxApprovals(args.userId);
    const [tasks, approvals, recaps, conversations, outputs, activity] = await Promise.all([
      this.tasks.find({ where: { user: { id: args.userId } }, order: { updatedAt: "DESC" }, take: 40 }),
      this.approvals.find({ where: { user: { id: args.userId } }, order: { updatedAt: "DESC" }, take: 30 }),
      this.calls.find({ where: { user: { id: args.userId }, status: "ended" }, order: { endedAt: "DESC" }, take: 12 }),
      this.conversations.find({ where: { user: { id: args.userId } }, order: { updatedAt: "DESC" }, take: 12 }),
      this.messages.find({
        where: { user: { id: args.userId }, role: "assistant", status: "done" },
        relations: ["conversation"],
        order: { createdAt: "DESC" },
        take: 20
      }),
      this.activity.listForUser({ userId: args.userId, limit: 30 })
    ]);
    return {
      tasks,
      approvals,
      callRecaps: recaps.map((r) => ({
        callSessionId: r.id,
        kind: r.kind,
        conversationId: r.conversationId ?? null,
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        recap: r.recapJson ?? null
      })),
      conversations: conversations.map((c) => ({
        conversationId: c.id,
        title: c.title ?? null,
        mode: c.mode,
        updatedAt: c.updatedAt.toISOString()
      })),
      outputs: outputs
        .filter((m) => !((m.metadata as any)?.malvPlaceholder))
        .slice(0, 12)
        .map((m) => ({
          messageId: m.id,
          conversationId: (m.conversation as any)?.id ?? null,
          preview: (m.content ?? "").slice(0, 200),
          source: m.source ?? null,
          createdAt: m.createdAt.toISOString(),
          metadata: m.metadata ?? null
        })),
      activity
    };
  }

  async ensureTaskFromCallAction(args: {
    userId: string;
    callSessionId: string;
    conversationId?: string | null;
    actionItem: string;
    actionIndex: number;
  }): Promise<void> {
    const title = args.actionItem.trim();
    if (!title) return;
    const sourceFingerprint = `call:${args.callSessionId}:action:${title.toLowerCase()}`;
    await this.createTask({
      userId: args.userId,
      title,
      description: "Auto-created from call recap action item.",
      status: "todo",
      source: "call",
      sourceSurface: "call",
      sourceType: "call_session",
      sourceReferenceId: args.callSessionId,
      callSessionId: args.callSessionId,
      conversationId: args.conversationId ?? null,
      sourceFingerprint,
      metadata: { actionIndex: args.actionIndex }
    });
  }
}

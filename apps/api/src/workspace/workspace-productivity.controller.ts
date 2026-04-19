import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkspaceProductivityService } from "./workspace-productivity.service";
import { WorkspaceProductivityAssistantService } from "./workspace-productivity-assistant.service";
import { WorkspaceExternalDispatchAckService } from "./workspace-external-dispatch-ack.service";
import { MalvNotificationDeliveryService } from "../execution-bridge/malv-notification-delivery.service";
import { MalvBridgeCapabilityResolverService } from "../execution-bridge/malv-bridge-capability-resolver.service";
import { MalvPushTokenRegistryService } from "../execution-bridge/malv-push-token-registry.service";
import type { GlobalRole } from "./workspace-access.service";
import type {
  WorkspaceTaskStatus,
  WorkspaceTaskPriority,
  WorkspaceTaskExecutionType,
  WorkspaceTaskExecutionState,
  WorkspaceTaskRiskLevel
} from "../db/entities/workspace-task.entity";
import type { WorkspaceApprovalStatus } from "../db/entities/workspace-approval-item.entity";

class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  description?: string | null;

  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "archived"])
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: WorkspaceTaskPriority;

  @IsOptional()
  @IsIn(["call", "chat", "manual", "studio", "voice", "inbox", "collaboration", "external", "system"])
  source?: string;

  @IsOptional()
  @IsIn(["call", "chat", "manual", "studio", "voice", "inbox", "collaboration", "external", "system"])
  sourceSurface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  sourceReferenceId?: string | null;

  @IsOptional()
  @IsIn([
    "manual",
    "automated",
    "reminder",
    "scheduled",
    "approval_gate",
    "reminder_only",
    "call_followup",
    "chat_followup",
    "external_action",
    "workflow_task",
    "manual_checklist"
  ])
  executionType?: WorkspaceTaskExecutionType;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  callSessionId?: string | null;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string | null;

  @IsOptional()
  @IsISO8601()
  reminderAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  riskLevel?: WorkspaceTaskRiskLevel;

  @IsOptional()
  tags?: string[] | null;
}

class CreateTaskFromOutputDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  description?: string | null;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  description?: string | null;

  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "archived"])
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: WorkspaceTaskPriority;

  @IsOptional()
  @IsIn([
    "idle",
    "pending",
    "scheduled",
    "due",
    "dispatched",
    "running",
    "waiting_input",
    "waiting_approval",
    "blocked",
    "completed",
    "failed",
    "cancelled"
  ])
  executionState?: WorkspaceTaskExecutionState;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string | null;

  @IsOptional()
  @IsISO8601()
  reminderAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  riskLevel?: WorkspaceTaskRiskLevel;

  @IsOptional()
  tags?: string[] | null;
}

class CreateApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  actionDescription!: string;

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  riskLevel?: "low" | "medium" | "high" | "critical";

  @IsOptional()
  @IsIn(["sandbox", "device", "other"])
  source?: "sandbox" | "device" | "other";

  @IsOptional()
  @IsString()
  sourceRefId?: string | null;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  callSessionId?: string | null;

  @IsOptional()
  @IsString()
  roomId?: string | null;
}

class DecisionDto {
  @IsIn(["approved", "rejected"])
  decision!: "approved" | "rejected";
}

class ExternalDispatchAckDto {
  @IsIn(["accepted", "completed", "rejected", "failed"])
  status!: "accepted" | "completed" | "rejected" | "failed";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detail?: string | null;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  executedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string | null;
}

class ProductivityAssistantDraftDto {
  @IsIn(["inbox_triage", "task_commentary"])
  kind!: "inbox_triage" | "task_commentary";

  @IsString()
  @IsNotEmpty()
  @MaxLength(12_000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  taskTitle?: string | null;
}

class RegisterPushTokenDto {
  @IsIn(["android", "ios"])
  platform!: "android" | "ios";

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}

@Controller("v1/workspaces")
export class WorkspaceProductivityController {
  constructor(
    private readonly productivity: WorkspaceProductivityService,
    private readonly productivityAssistant: WorkspaceProductivityAssistantService,
    private readonly externalDispatchAck: WorkspaceExternalDispatchAckService,
    private readonly malvNotifications: MalvNotificationDeliveryService,
    private readonly bridgeResolver: MalvBridgeCapabilityResolverService,
    private readonly pushTokenRegistry: MalvPushTokenRegistryService
  ) {}

  @Post("assistant/draft")
  @UseGuards(JwtAuthGuard)
  async productivityAssistantDraft(@Req() req: Request, @Body() body: ProductivityAssistantDraftDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.productivityAssistant.draft({
      userId: auth.userId,
      kind: body.kind,
      text: body.text,
      taskTitle: body.taskTitle ?? null
    });
    return out.ok ? { ok: true, draft: out.draft, meta: out.meta } : { ok: false, error: out.error };
  }

  @Get("surface")
  @UseGuards(JwtAuthGuard)
  async summary(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.productivity.workspaceSummary({ userId: auth.userId });
    return { ok: true, ...out };
  }

  @Get("tasks")
  @UseGuards(JwtAuthGuard)
  async listTasks(
    @Req() req: Request,
    @Query("status") status?: WorkspaceTaskStatus,
    @Query("limit") limitRaw?: string,
    @Query("assignedToMe") assignedToMeRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const tasks = await this.productivity.listTasks(auth.userId, {
      status: status && ["todo", "in_progress", "done", "archived"].includes(status) ? status : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      assignedToMe: assignedToMeRaw === "true"
    });
    return { ok: true, tasks };
  }

  @Post("tasks")
  @UseGuards(JwtAuthGuard)
  async createTask(@Req() req: Request, @Body() body: CreateTaskDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.createTask({ userId: auth.userId, ...body });
    return { ok: true, task: row };
  }

  @Post("tasks/from-chat-output")
  @UseGuards(JwtAuthGuard)
  async createTaskFromOutput(@Req() req: Request, @Body() body: CreateTaskFromOutputDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.createTaskFromChatOutput({
      userId: auth.userId,
      messageId: body.messageId,
      title: body.title ?? null,
      description: body.description ?? null
    });
    return { ok: true, task: row };
  }

  @Patch("tasks/:taskId")
  @UseGuards(JwtAuthGuard)
  async updateTask(@Req() req: Request, @Param("taskId") taskId: string, @Body() body: UpdateTaskDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.updateTask({ userId: auth.userId, taskId, ...body });
    return { ok: true, task: row };
  }

  @Post("tasks/:taskId/complete")
  @UseGuards(JwtAuthGuard)
  async completeTask(@Req() req: Request, @Param("taskId") taskId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.markTaskComplete({ userId: auth.userId, taskId });
    return { ok: true, task: row };
  }

  @Post("tasks/:taskId/archive")
  @UseGuards(JwtAuthGuard)
  async archiveTask(@Req() req: Request, @Param("taskId") taskId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.archiveTask({ userId: auth.userId, taskId });
    return { ok: true, task: row };
  }

  @Get("approvals")
  @UseGuards(JwtAuthGuard)
  async listApprovals(@Req() req: Request, @Query("status") status?: WorkspaceApprovalStatus, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const approvals = await this.productivity.listApprovals(auth.userId, {
      status: status && ["pending", "approved", "rejected"].includes(status) ? status : undefined,
      limit: Number.isFinite(limit) ? limit : undefined
    });
    return { ok: true, approvals };
  }

  @Post("approvals")
  @UseGuards(JwtAuthGuard)
  async createApproval(@Req() req: Request, @Body() body: CreateApprovalDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.productivity.createApproval({ userId: auth.userId, ...body });
    return { ok: true, approval: row };
  }

  @Post("approvals/:approvalId/decision")
  @UseGuards(JwtAuthGuard)
  async decideApproval(@Req() req: Request, @Param("approvalId") approvalId: string, @Body() body: DecisionDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const globalRole = (auth.role === "admin" ? "admin" : "user") as GlobalRole;
    const row = await this.productivity.decideApproval({
      userId: auth.userId,
      globalRole,
      approvalId,
      decision: body.decision
    });
    return { ok: true, approval: row };
  }

  @Get("malv/notifications")
  @UseGuards(JwtAuthGuard)
  async listMalvNotifications(@Req() req: Request, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const lim = limitRaw ? Number(limitRaw) : 50;
    const rows = await this.malvNotifications.listUnread(auth.userId, Number.isFinite(lim) ? lim : 50);
    return { ok: true, notifications: rows };
  }

  @Patch("malv/notifications/:notificationId/read")
  @UseGuards(JwtAuthGuard)
  async markMalvNotificationRead(@Req() req: Request, @Param("notificationId") notificationId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const ok = await this.malvNotifications.markRead(auth.userId, notificationId);
    return ok ? { ok: true } : { ok: false, error: "not_found" };
  }

  @Post("malv/external-dispatch/:dispatchId/ack")
  @UseGuards(JwtAuthGuard)
  async ackExternalDispatch(@Req() req: Request, @Param("dispatchId") dispatchId: string, @Body() body: ExternalDispatchAckDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.externalDispatchAck.acknowledge({
      userId: auth.userId,
      dispatchId,
      status: body.status,
      reason: body.reason ?? null,
      detail: body.detail ?? null,
      result: body.result ?? null,
      executedAt: body.executedAt ?? null,
      deviceId: body.deviceId ?? null
    });
    return out.ok ? { ok: true } : { ok: false, error: out.error };
  }

  @Get("malv/bridge-capability")
  @UseGuards(JwtAuthGuard)
  async bridgeCapability(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const report = await this.bridgeResolver.resolveForUser(auth.userId);
    return { ok: true, report };
  }

  @Post("malv/push/register")
  @UseGuards(JwtAuthGuard)
  async registerPushToken(@Req() req: Request, @Body() body: RegisterPushTokenDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    this.pushTokenRegistry.register({
      userId: auth.userId,
      platform: body.platform,
      deviceId: body.deviceId,
      token: body.token
    });
    return { ok: true };
  }

  @Post("malv/push/unregister")
  @UseGuards(JwtAuthGuard)
  async unregisterPushToken(@Req() req: Request, @Body() body: { deviceId?: string }) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId) return { ok: false, error: "deviceId_required" };
    this.pushTokenRegistry.unregister(auth.userId, deviceId);
    return { ok: true };
  }
}

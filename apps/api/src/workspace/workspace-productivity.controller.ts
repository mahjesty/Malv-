import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkspaceProductivityService } from "./workspace-productivity.service";
import type { GlobalRole } from "./workspace-access.service";
import type { WorkspaceTaskStatus } from "../db/entities/workspace-task.entity";
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
  @IsIn(["todo", "in_progress", "done"])
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsIn(["call", "chat", "manual"])
  source?: "call" | "chat" | "manual";

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
  @IsIn(["todo", "in_progress", "done"])
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;
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

@Controller("v1/workspaces")
export class WorkspaceProductivityController {
  constructor(private readonly productivity: WorkspaceProductivityService) {}

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
      status: status && ["todo", "in_progress", "done"].includes(status) ? status : undefined,
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
}

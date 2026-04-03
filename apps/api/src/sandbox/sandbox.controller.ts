import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { SandboxExecutionService } from "./sandbox-execution.service";
import { OperatorRuntimeService } from "./operator-runtime.service";

class ApproveBody {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

class DecisionActionBody {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

@Controller("v1/sandbox")
export class SandboxController {
  constructor(private readonly sandbox: SandboxExecutionService, private readonly runtime: OperatorRuntimeService) {}

  @Post(":sandboxRunId/approve")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.run.approve")
  @RateLimit({ key: "sandbox.run.approve", limit: 20, windowSeconds: 60 })
  async approve(
    @Param("sandboxRunId") sandboxRunId: string,
    @Body() body: ApproveBody,
    @Req() req: Request
  ) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };

    return this.sandbox.approveSandboxRun({
      sandboxRunId,
      actorUserId: auth.userId,
      reason: body.reason
    });
  }

  @Get("admin/approval-requests")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.approvals.read")
  @RateLimit({ key: "sandbox.approvals.read", limit: 60, windowSeconds: 60 })
  async listApprovalRequests(
    @Req() req: Request,
    @Query("sandboxRunId") sandboxRunId?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const result = await this.sandbox.listApprovalRequests({
      sandboxRunId,
      status,
      from,
      to,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20
    });
    return { ok: true, ...result };
  }

  @Get("admin/approval-requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.approvals.read")
  async getApprovalRequest(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.getApprovalRequest(id);
    if (!row) return { ok: false, error: "Not found" };
    return { ok: true, row };
  }

  @Post("admin/approval-requests/:id/approve")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.approvals.resolve")
  @RateLimit({ key: "sandbox.approvals.resolve", limit: 30, windowSeconds: 60 })
  async approveRequest(@Req() req: Request, @Param("id") id: string, @Body() body: DecisionActionBody) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.approveRequest({ approvalRequestId: id, adminUserId: auth.userId, note: body.note });
    return { ok: true, row };
  }

  @Post("admin/approval-requests/:id/reject")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.approvals.resolve")
  async rejectRequest(@Req() req: Request, @Param("id") id: string, @Body() body: DecisionActionBody) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.rejectRequest({ approvalRequestId: id, adminUserId: auth.userId, note: body.note });
    return { ok: true, row };
  }

  @Get("admin/policy-decisions")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.policy.read")
  async listPolicyDecisions(
    @Req() req: Request,
    @Query("sandboxRunId") sandboxRunId?: string,
    @Query("decision") decision?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("commandClass") commandClass?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const result = await this.sandbox.listPolicyDecisions({
      sandboxRunId,
      decision,
      riskLevel,
      commandClass,
      userId,
      from,
      to,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50
    });
    return { ok: true, ...result };
  }

  @Get("admin/policy-decisions/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.policy.read")
  async getPolicyDecision(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.getPolicyDecision(id);
    if (!row) return { ok: false, error: "Not found" };
    return { ok: true, row };
  }

  @Get("admin/patch-proposals")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.patches.read")
  async listPatches(
    @Req() req: Request,
    @Query("sandboxRunId") sandboxRunId?: string,
    @Query("status") status?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const result = await this.sandbox.listPatchProposals({
      sandboxRunId,
      status,
      userId,
      from,
      to,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20
    });
    return { ok: true, ...result };
  }

  @Get("admin/patch-proposals/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("sandbox.patches.read")
  async getPatch(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.getPatchProposal(id);
    if (!row) return { ok: false, error: "Not found" };
    return { ok: true, row };
  }

  @Post("admin/patch-proposals/:id/apply")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.patches.apply")
  @RateLimit({ key: "sandbox.patches.apply", limit: 15, windowSeconds: 60 })
  async applyPatch(@Req() req: Request, @Param("id") id: string, @Body() body: DecisionActionBody) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.applyPatchProposal({ patchProposalId: id, adminUserId: auth.userId, note: body.note });
    return { ok: true, row };
  }

  @Post("admin/patch-proposals/:id/reject")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.patches.apply")
  async rejectPatch(@Req() req: Request, @Param("id") id: string, @Body() body: DecisionActionBody) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const row = await this.sandbox.rejectPatchProposal({ patchProposalId: id, adminUserId: auth.userId, note: body.note });
    return { ok: true, row };
  }

  @Get("admin/command-audit")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("sandbox.audit.read")
  async commandAudit(@Req() req: Request, @Query("sandboxRunId") sandboxRunId?: string, @Query("userId") userId?: string, @Query("limit") limit?: string) {
    const auth = (req as any).user as { userId: string; role: "admin" | "user" } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Admin only" };
    const rows = await this.runtime.listCommandAudit({
      sandboxRunId: sandboxRunId || undefined,
      userId: userId || undefined,
      limit: limit ? Number(limit) : 100
    });
    return {
      ok: true,
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        sandboxRunId: (r.sandboxRun as any)?.id ?? null,
        userId: (r.user as any)?.id ?? null,
        stepIndex: r.stepIndex,
        commandClass: r.commandClass,
        commandText: r.commandText,
        status: r.status,
        exitCode: r.exitCode ?? null,
        createdAt: r.createdAt
      }))
    };
  }
}


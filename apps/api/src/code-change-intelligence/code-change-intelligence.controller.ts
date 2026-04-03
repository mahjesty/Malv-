import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";

@Controller("v1/change-intelligence")
export class CodeChangeIntelligenceController {
  constructor(private readonly changeIntel: CodeChangeIntelligenceService) {}

  private auth(req: Request) {
    const user = (req as any).user as { sub?: string; id?: string; role?: string } | undefined;
    return { userId: user?.sub ?? user?.id ?? null, role: user?.role ?? "user" };
  }

  @Post("requests")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("chat.send")
  async createRequest(
    @Req() req: Request,
    @Body() body: { title?: string; requestedGoal?: string; sourceMessageId?: string | null; workspaceId?: string | null }
  ) {
    const auth = this.auth(req);
    if (!auth.userId) return { ok: false, error: "Unauthorized" };
    if (!body?.title?.trim() || !body?.requestedGoal?.trim()) return { ok: false, error: "title and requestedGoal required" };
    const row = await this.changeIntel.createChangeRequest({
      userId: auth.userId,
      workspaceId: body.workspaceId ?? null,
      sourceMessageId: body.sourceMessageId ?? null,
      title: body.title,
      requestedGoal: body.requestedGoal
    });
    return { ok: true, request: row };
  }

  @Post("requests/:id/run")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("chat.send")
  async run(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body?: { filesChanged?: string[]; patchSummary?: string; sandboxRunId?: string | null }
  ) {
    const auth = this.auth(req);
    if (!auth.userId) return { ok: false, error: "Unauthorized" };
    try {
      const out = await this.changeIntel.runWorkflow({
        changeRequestId: id,
        filesChanged: body?.filesChanged ?? [],
        patchSummary: body?.patchSummary ?? "",
        sandboxRunId: body?.sandboxRunId ?? null,
        requestedBy: auth.userId
      });
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  @Post("requests/:id/approve")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("admin.dashboard.read")
  async approve(@Req() req: Request, @Param("id") id: string) {
    const auth = this.auth(req);
    if (!auth.userId) return { ok: false, error: "Unauthorized" };
    const request = await this.changeIntel.approveForExecution({ changeRequestId: id, approver: auth.userId });
    return { ok: true, request };
  }

  @Get("requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("chat.send")
  async detail(@Param("id") id: string) {
    const detail = await this.changeIntel.getRequestDetail(id);
    return { ok: true, ...detail };
  }
}

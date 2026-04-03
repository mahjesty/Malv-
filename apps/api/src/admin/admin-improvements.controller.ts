import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { ImprovementProposalService } from "../improvement/improvement-proposal.service";

@Controller("v1/admin/improvements")
export class AdminImprovementsController {
  constructor(private readonly proposals: ImprovementProposalService) {}

  private isAdmin(req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    return auth?.role === "admin";
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.improvements.list", limit: 40, windowSeconds: 60 })
  async list(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const rows = await this.proposals.listPendingAndRecent({ limit: 60 });
    return {
      ok: true,
      proposals: rows.map((p) => ({
        id: p.id,
        description: p.description,
        affectedSystem: p.affectedSystem,
        suggestion: p.suggestion,
        confidence: p.confidence,
        status: p.status,
        correlationIds: p.correlationIds ?? null,
        createdAt: p.createdAt,
        decidedAt: p.decidedAt ?? null,
        appliedAt: p.appliedAt ?? null,
        rejectionReason: p.rejectionReason ?? null
      }))
    };
  }

  @Post(":id/approve")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.improvements.approve", limit: 20, windowSeconds: 60 })
  async approve(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const user = (req as any).user as { sub?: string; id?: string };
    const adminUserId = user?.sub ?? user?.id;
    if (!adminUserId) return { ok: false, error: "Missing user" };
    try {
      const row = await this.proposals.approveAndApply(id, adminUserId);
      return { ok: true, proposal: { id: row.id, status: row.status, appliedAt: row.appliedAt } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post(":id/reject")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.improvements.reject", limit: 20, windowSeconds: 60 })
  async reject(@Req() req: Request, @Param("id") id: string, @Body() body?: { reason?: string }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const user = (req as any).user as { sub?: string; id?: string };
    const adminUserId = user?.sub ?? user?.id;
    if (!adminUserId) return { ok: false, error: "Missing user" };
    const row = await this.proposals.markRejected(id, adminUserId, body?.reason);
    if (!row) return { ok: false, error: "Proposal not found or not pending." };
    return { ok: true, proposal: { id: row.id, status: row.status } };
  }
}

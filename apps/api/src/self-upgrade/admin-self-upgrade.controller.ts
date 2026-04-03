import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { SelfUpgradeService } from "./self-upgrade.service";

/**
 * Admin-only API for the self-upgrade preview / review pipeline.
 * Apply endpoints are gated in SelfUpgradeService — production is never touched without preview + approve + apply.
 */
@Controller("v1/admin/self-upgrade")
export class AdminSelfUpgradeController {
  constructor(private readonly selfUpgrade: SelfUpgradeService) {}

  private isAdmin(req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    return auth?.role === "admin";
  }

  private adminId(req: Request) {
    const user = (req as any).user as { sub?: string; id?: string };
    return user?.sub ?? user?.id;
  }

  @Post("requests")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.write", limit: 20, windowSeconds: 60 })
  async create(@Req() req: Request, @Body() body: { title?: string; description?: string; context?: Record<string, unknown> }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    if (!body?.title?.trim() || !body?.description?.trim()) return { ok: false, error: "title and description required" };
    const row = await this.selfUpgrade.createRequest({
      adminUserId: uid,
      title: body.title,
      description: body.description,
      context: body.context
    });
    return { ok: true, request: { id: row.id, title: row.title, status: row.status, createdAt: row.createdAt } };
  }

  @Get("requests")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.list", limit: 40, windowSeconds: 60 })
  async list(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const rows = await this.selfUpgrade.listRequests(60);
    return {
      ok: true,
      requests: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }))
    };
  }

  @Get("requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.get", limit: 60, windowSeconds: 60 })
  async getOne(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    try {
      const detail = await this.selfUpgrade.getDetailForAdmin(id);
      return { ok: true, ...detail };
    } catch {
      return { ok: false, error: "Not found" };
    }
  }

  @Post("requests/:id/analyze")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.analyze", limit: 15, windowSeconds: 120 })
  async analyze(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.analyze(id, uid);
      return {
        ok: true,
        request: { id: out.request.id, status: out.request.status },
        report: { id: out.report.id, createdAt: out.report.createdAt }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post("requests/:id/generate")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.generate", limit: 10, windowSeconds: 300 })
  async generate(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.generate(id, uid);
      return {
        ok: true,
        request: { id: out.request.id, status: out.request.status },
        preview: {
          reviewSessionId: out.review.id,
          patchSetId: out.patchSet.id,
          patchProposalId: out.patchProposal.id
        }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Get("requests/:id/preview")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.preview", limit: 60, windowSeconds: 60 })
  async preview(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    try {
      const out = await this.selfUpgrade.getAdminPreview(id);
      if (!out.preview) return { ok: true, request: out.request, preview: null };
      const p = out.preview;
      return {
        ok: true,
        request: out.request,
        preview: {
          id: p.id,
          previewStatus: p.previewStatus,
          readyForApply: p.readyForApply,
          changedFiles: p.changedFiles,
          diffSummary: p.diffSummary,
          validationSummary: p.validationSummary,
          riskSummary: p.riskSummary,
          rollbackSummary: p.rollbackSummary,
          adminNotes: p.adminNotes ?? null,
          fullDiff: out.fullDiff,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  /** Re-run validation in the sandbox worktree (optional; generation already validates). */
  @Post("requests/:id/validate")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.validate", limit: 20, windowSeconds: 120 })
  async validate(@Req() req: Request, @Param("id") id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.revalidate(id, uid);
      return { ok: true, ...out };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post("requests/:id/request-revision")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.revision", limit: 20, windowSeconds: 60 })
  async requestRevision(@Req() req: Request, @Param("id") id: string, @Body() body?: { note?: string }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.requestRevision(id, uid, body?.note);
      return { ok: true, request: out.request, review: out.review };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post("requests/:id/reject")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.reject", limit: 20, windowSeconds: 60 })
  async reject(@Req() req: Request, @Param("id") id: string, @Body() body?: { note?: string }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const row = await this.selfUpgrade.reject(id, uid, body?.note);
      return { ok: true, request: row };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post("requests/:id/approve-apply")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.approve", limit: 15, windowSeconds: 120 })
  async approveApply(@Req() req: Request, @Param("id") id: string, @Body() body?: { note?: string }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.approveApply(id, uid, body?.note);
      return { ok: true, request: out.request, review: out.review };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  @Post("requests/:id/apply")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.self_upgrade.apply", limit: 10, windowSeconds: 300 })
  async apply(@Req() req: Request, @Param("id") id: string, @Body() body?: { note?: string }) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const uid = this.adminId(req);
    if (!uid) return { ok: false, error: "Missing user" };
    try {
      const out = await this.selfUpgrade.applyToProduction(id, uid, body?.note);
      return { ok: true, request: out.request, review: out.review, patch: { id: out.patch.id, status: out.patch.status } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }
}

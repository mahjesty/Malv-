import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { In } from "typeorm";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SecurityAuditEventEntity } from "../db/entities/security-audit-event.entity";
import { SecurityPostureService } from "../security/security-posture.service";
import { SecuritySignalService } from "../security/security-signal.service";
import { SecuritySummaryService } from "../security/security-summary.service";
import { SecurityIncidentService } from "../security/security-incident.service";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { ChangeRequestEntity } from "../db/entities/change-request.entity";

@Controller("v1/admin/security")
export class AdminSecurityController {
  constructor(
    private readonly posture: SecurityPostureService,
    private readonly signals: SecuritySignalService,
    private readonly securitySummary: SecuritySummaryService,
    private readonly securityIncidents: SecurityIncidentService,
    @InjectRepository(SecurityAuditEventEntity) private readonly securityAuditRepo: Repository<SecurityAuditEventEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly sandboxApprovals: Repository<SandboxApprovalRequestEntity>,
    @InjectRepository(ChangeRequestEntity) private readonly changeRequests: Repository<ChangeRequestEntity>
  ) {}

  private isAdmin(req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    return auth?.role === "admin";
  }

  @Get("summary")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.summary", limit: 20, windowSeconds: 60 })
  async getSummary(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
    return { ok: true, summary: await this.securitySummary.getAdminSummary({ isProd }) };
  }

  @Get("incidents")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.incidents", limit: 40, windowSeconds: 60 })
  async listIncidents(@Req() req: Request, @Query("limit") limitRaw?: string, @Query("activeOnly") activeOnlyRaw?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 40)));
    const activeOnly = String(activeOnlyRaw ?? "false").toLowerCase() === "true";
    const rows = activeOnly ? await this.securityIncidents.listRecentActive(limit) : await this.securityIncidents.listRecent(limit);
    return {
      ok: true,
      incidents: rows.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        dedupKey: i.dedupKey,
        correlationId: i.correlationId ?? null,
        sourceSubsystem: i.sourceSubsystem ?? null,
        summary: i.summary.slice(0, 2000),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt
      }))
    };
  }

  @Get("incidents/by-correlation")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.incidents.corr", limit: 40, windowSeconds: 60 })
  async incidentsByCorrelation(@Req() req: Request, @Query("correlation_id") correlationId?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const cid = (correlationId ?? "").trim();
    if (!cid) return { ok: false, error: "correlation_id required" };
    const incidents = await this.securityIncidents.findByCorrelationId(cid);
    return {
      ok: true,
      correlationId: cid,
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        updatedAt: i.updatedAt
      }))
    };
  }

  @Get("incidents/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.incident.detail", limit: 40, windowSeconds: 60 })
  async getIncidentDetail(@Req() req: Request, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const data = await this.securityIncidents.getIncidentWithTimeline(id);
    if (!data) return { ok: false, error: "Not found" };
    return {
      ok: true,
      incident: {
        id: data.incident.id,
        title: data.incident.title,
        severity: data.incident.severity,
        status: data.incident.status,
        dedupKey: data.incident.dedupKey,
        correlationId: data.incident.correlationId ?? null,
        sourceSubsystem: data.incident.sourceSubsystem ?? null,
        summary: data.incident.summary,
        createdAt: data.incident.createdAt,
        updatedAt: data.incident.updatedAt
      },
      timeline: data.events
    };
  }

  @Get("posture")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.posture", limit: 20, windowSeconds: 60 })
  getPosture(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
    return { ok: true, posture: this.posture.getSnapshot({ isProd }) };
  }

  @Get("events")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.events", limit: 40, windowSeconds: 60 })
  async listEvents(@Req() req: Request, @Query("limit") limitRaw?: string, @Query("severity") severity?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50)));
    const qb = this.securityAuditRepo.createQueryBuilder("e").orderBy("e.occurred_at", "DESC").take(limit);
    if (severity && ["low", "medium", "high", "critical"].includes(severity)) {
      qb.andWhere("e.severity = :sev", { sev: severity });
    }
    const events = await qb.getMany();
    return {
      ok: true,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        subsystem: e.subsystem,
        summary: e.summary,
        detailsJson: e.detailsJson ?? null,
        actorRole: e.actorRole ?? null,
        sourceIp: e.sourceIp ?? null,
        correlationId: e.correlationId ?? null,
        occurredAt: e.occurredAt
      }))
    };
  }

  @Get("events/high")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.events.high", limit: 40, windowSeconds: 60 })
  async highSeverity(@Req() req: Request, @Query("limit") limitRaw?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 30)));
    const events = await this.securityAuditRepo.find({
      where: { severity: In(["high", "critical"]) },
      order: { occurredAt: "DESC" },
      take: limit
    });
    return { ok: true, events };
  }

  @Get("signals")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.signals", limit: 30, windowSeconds: 60 })
  getSignals(@Req() req: Request) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    return { ok: true, rollingWindowSeconds: 60, signals: this.signals.snapshot() };
  }

  @Get("approvals/recent")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.security.approvals", limit: 30, windowSeconds: 60 })
  async recentApprovals(@Req() req: Request, @Query("limit") limitRaw?: string) {
    if (!this.isAdmin(req)) return { ok: false, error: "Admin only" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 25)));
    const sandbox = await this.sandboxApprovals.find({
      order: { requestedAt: "DESC" },
      take: limit
    });
    const recent = await this.changeRequests.find({
      order: { updatedAt: "DESC" },
      take: Math.min(200, limit * 3)
    });
    const changeRows = recent.filter((c) => c.approvalRequired || c.approvedAt).slice(0, limit);
    return {
      ok: true,
      sandboxApprovals: sandbox.map((a) => ({
        id: a.id,
        status: a.status,
        approvalType: a.approvalType,
        requestedAt: a.requestedAt
      })),
      changeIntelligenceApprovals: changeRows.map((c) => ({
        id: c.id,
        title: c.title,
        trustLevel: c.trustLevel,
        approvalRequired: c.approvalRequired,
        approvedAt: c.approvedAt ?? null,
        approvedBy: c.approvedBy ?? null,
        status: c.status
      }))
    };
  }
}

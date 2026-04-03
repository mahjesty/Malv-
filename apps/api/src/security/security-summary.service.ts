import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { SecurityAuditEventEntity } from "../db/entities/security-audit-event.entity";
import { SecurityEventService } from "./security-event.service";
import { SecurityPostureService } from "./security-posture.service";
import { SecuritySignalService } from "./security-signal.service";
import { SecurityIncidentService } from "./security-incident.service";

export type SecuritySummaryDto = {
  windowHours: number;
  countsBySeverity24h: Record<string, number>;
  recentHighSeverityEvents: Array<{
    id: string;
    eventType: string;
    severity: string;
    subsystem: string;
    summary: string;
    occurredAt: Date;
    correlationId: string | null;
  }>;
  activeIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    correlationId: string | null;
    sourceSubsystem: string | null;
    updatedAt: Date;
  }>;
  signals: ReturnType<SecuritySignalService["snapshot"]>;
  postureHighlights: {
    sandboxProvider: string;
    sandboxEnforcement: string;
    dockerHealth: string;
  };
  sinkHealth: ReturnType<SecurityEventService["getAuditSinkHealth"]>;
};

@Injectable()
export class SecuritySummaryService {
  constructor(
    @InjectRepository(SecurityAuditEventEntity) private readonly auditRepo: Repository<SecurityAuditEventEntity>,
    private readonly securityEvents: SecurityEventService,
    private readonly posture: SecurityPostureService,
    private readonly signals: SecuritySignalService,
    private readonly incidents: SecurityIncidentService
  ) {}

  async getAdminSummary(args: { isProd: boolean }): Promise<SecuritySummaryDto> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const rawCounts = await this.auditRepo
      .createQueryBuilder("e")
      .select("e.severity", "severity")
      .addSelect("COUNT(*)", "cnt")
      .where("e.occurredAt >= :since", { since })
      .groupBy("e.severity")
      .getRawMany<{ severity: string; cnt: string }>();

    const countsBySeverity24h: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of rawCounts) {
      const sev = row.severity as keyof typeof countsBySeverity24h;
      if (sev in countsBySeverity24h) countsBySeverity24h[sev] = Number(row.cnt);
    }

    const recentHigh = await this.auditRepo.find({
      where: { severity: In(["high", "critical"]) },
      order: { occurredAt: "DESC" },
      take: 20
    });

    const active = await this.incidents.listRecentActive(25);
    const snap = this.posture.getSnapshot({ isProd: args.isProd });

    return {
      windowHours: 24,
      countsBySeverity24h,
      recentHighSeverityEvents: recentHigh.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        subsystem: e.subsystem,
        summary: e.summary.slice(0, 500),
        occurredAt: e.occurredAt,
        correlationId: e.correlationId ?? null
      })),
      activeIncidents: active.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        correlationId: i.correlationId ?? null,
        sourceSubsystem: i.sourceSubsystem ?? null,
        updatedAt: i.updatedAt
      })),
      signals: this.signals.snapshot(),
      postureHighlights: {
        sandboxProvider: snap.sandbox.providerMode,
        sandboxEnforcement: snap.sandbox.enforcementClass,
        dockerHealth: snap.sandbox.dockerHealth
      },
      sinkHealth: this.securityEvents.getAuditSinkHealth()
    };
  }
}

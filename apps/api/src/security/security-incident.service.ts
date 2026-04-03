import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { SecurityIncidentEntity } from "../db/entities/security-incident.entity";
import { SecurityIncidentEventEntity } from "../db/entities/security-incident-event.entity";
import { SecurityAuditEventEntity, type SecurityAuditSeverity } from "../db/entities/security-audit-event.entity";
import type { NormalizedSecurityEvent } from "./security-event.types";

const SEVERITY_RANK: Record<SecurityAuditSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

function maxSeverity(a: SecurityAuditSeverity, b: SecurityAuditSeverity): SecurityAuditSeverity {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

const CORRELATION_EVENT_TYPES = new Set([
  "sandbox.provider.init_failed",
  "security.signal.spike",
  "sandbox.policy.denied",
  "rate_limit.blocked"
]);

@Injectable()
export class SecurityIncidentService {
  private readonly logger = new Logger(SecurityIncidentService.name);

  constructor(
    @InjectRepository(SecurityIncidentEntity) private readonly incidents: Repository<SecurityIncidentEntity>,
    @InjectRepository(SecurityIncidentEventEntity) private readonly links: Repository<SecurityIncidentEventEntity>,
    @InjectRepository(SecurityAuditEventEntity) private readonly audit: Repository<SecurityAuditEventEntity>
  ) {}

  /**
   * Correlate after persistence; errors are logged and must not affect the request path.
   */
  async handleEventAfterPersist(event: NormalizedSecurityEvent, auditEventId: string): Promise<void> {
    try {
      if (!this.shouldCorrelate(event)) return;
      const dedupKey = this.buildDedupKey(event);
      const open = await this.incidents.findOne({
        where: { dedupKey, status: In(["open", "investigating"]) },
        order: { updatedAt: "DESC" }
      });
      if (open) {
        await this.links.insert({ incidentId: open.id, securityAuditEventId: auditEventId });
        await this.incidents.update(open.id, {
          summary: this.mergeSummary(open.summary, event.summary),
          severity: maxSeverity(open.severity, event.severity),
          correlationId: open.correlationId ?? event.correlationId ?? null,
          updatedAt: new Date()
        });
        return;
      }
      const incident = this.incidents.create({
        title: event.summary.slice(0, 512),
        severity: event.severity,
        status: "open",
        dedupKey,
        correlationId: event.correlationId ?? null,
        sourceSubsystem: event.subsystem,
        summary: event.summary.slice(0, 8000)
      });
      const saved = await this.incidents.save(incident);
      await this.links.insert({ incidentId: saved.id, securityAuditEventId: auditEventId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`security incident correlation failed: ${msg}`);
    }
  }

  private shouldCorrelate(event: NormalizedSecurityEvent): boolean {
    if (event.severity === "high" || event.severity === "critical") return true;
    if (CORRELATION_EVENT_TYPES.has(event.eventType)) return true;
    return false;
  }

  private buildDedupKey(event: NormalizedSecurityEvent): string {
    if (event.correlationId) return `corr:${event.correlationId}`;
    return `cluster:${event.eventType}:${event.subsystem}`;
  }

  private mergeSummary(prev: string, next: string): string {
    const s = `${prev}\n—\n${next}`;
    return s.slice(0, 7900);
  }

  async listRecentActive(limit: number): Promise<SecurityIncidentEntity[]> {
    return this.incidents.find({
      where: { status: In(["open", "investigating"]) },
      order: { updatedAt: "DESC" },
      take: Math.min(100, Math.max(1, limit))
    });
  }

  async listRecent(limit: number): Promise<SecurityIncidentEntity[]> {
    return this.incidents.find({
      order: { updatedAt: "DESC" },
      take: Math.min(200, Math.max(1, limit))
    });
  }

  async getIncidentWithTimeline(incidentId: string): Promise<{
    incident: SecurityIncidentEntity;
    events: Array<{
      id: string;
      eventType: string;
      severity: SecurityAuditSeverity;
      subsystem: string;
      summary: string;
      occurredAt: Date;
      correlationId: string | null;
    }>;
  } | null> {
    const incident = await this.incidents.findOne({ where: { id: incidentId } });
    if (!incident) return null;
    const rows = await this.audit
      .createQueryBuilder("e")
      .innerJoin("security_incident_events", "ie", "ie.security_audit_event_id = e.id")
      .where("ie.incident_id = :incidentId", { incidentId })
      .orderBy("e.occurredAt", "ASC")
      .select(["e.id", "e.eventType", "e.severity", "e.subsystem", "e.summary", "e.occurredAt", "e.correlationId"])
      .getMany();
    return {
      incident,
      events: rows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        subsystem: e.subsystem,
        summary: e.summary,
        occurredAt: e.occurredAt,
        correlationId: e.correlationId ?? null
      }))
    };
  }

  async findByCorrelationId(correlationId: string): Promise<SecurityIncidentEntity[]> {
    return this.incidents.find({
      where: { correlationId },
      order: { updatedAt: "DESC" },
      take: 50
    });
  }
}

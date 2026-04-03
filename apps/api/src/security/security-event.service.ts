import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SecurityAuditEventEntity, type SecurityAuditSeverity } from "../db/entities/security-audit-event.entity";
import { SecurityEventSinkService } from "./security-event-sink.service";
import { SecurityAlertService } from "./security-alert.service";
import { SecurityIncidentService } from "./security-incident.service";
import type { EmitSecurityEventArgs } from "./security-event.types";

export type { EmitSecurityEventArgs } from "./security-event.types";

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);
  private lastSinkOkAt: Date | null = null;
  private lastSinkError: string | null = null;

  constructor(
    @InjectRepository(SecurityAuditEventEntity) private readonly repo: Repository<SecurityAuditEventEntity>,
    private readonly sinkService: SecurityEventSinkService,
    private readonly alertService: SecurityAlertService,
    private readonly incidentService: SecurityIncidentService
  ) {}

  getAuditSinkHealth(): {
    status: "healthy" | "degraded" | "unknown";
    lastWriteOkAt: string | null;
    lastError: string | null;
    externalSinks: ReturnType<SecurityEventSinkService["getSinkHealth"]>;
    alerts: ReturnType<SecurityAlertService["getAlertHealth"]>;
  } {
    return {
      status: this.lastSinkError ? "degraded" : this.lastSinkOkAt ? "healthy" : "unknown",
      lastWriteOkAt: this.lastSinkOkAt?.toISOString() ?? null,
      lastError: this.lastSinkError,
      externalSinks: this.sinkService.getSinkHealth(),
      alerts: this.alertService.getAlertHealth()
    };
  }

  /**
   * Append-only insert. Do not expose update/delete for security events.
   */
  async emit(args: EmitSecurityEventArgs): Promise<SecurityAuditEventEntity> {
    const row = this.repo.create({
      eventType: args.eventType,
      severity: args.severity,
      subsystem: args.subsystem,
      summary: args.summary.slice(0, 8000),
      detailsJson: args.details ?? null,
      actorUser: args.actorUserId ? ({ id: args.actorUserId } as any) : null,
      actorRole: args.actorRole ?? null,
      sourceIp: args.sourceIp ?? null,
      correlationId: args.correlationId ?? null
    });
    try {
      const saved = await this.repo.save(row);
      this.lastSinkOkAt = new Date();
      this.lastSinkError = null;
      const normalized = this.sinkService.toNormalized({
        internalEventId: saved.id,
        occurredAt: saved.occurredAt,
        eventType: saved.eventType,
        severity: saved.severity as SecurityAuditSeverity,
        subsystem: saved.subsystem,
        summary: saved.summary,
        details: saved.detailsJson ?? null,
        actorUserId: args.actorUserId ?? null,
        actorRole: saved.actorRole ?? null,
        sourceIp: saved.sourceIp ?? null,
        correlationId: saved.correlationId ?? null
      });
      void this.sinkService.dispatchBestEffort(normalized);
      this.alertService.maybeDispatchAfterPersist(normalized);
      void this.incidentService.handleEventAfterPersist(normalized, saved.id);
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastSinkError = msg;
      this.logger.error(`security audit sink write failed: ${msg}`);
      throw e;
    }
  }

  async emitBestEffort(args: EmitSecurityEventArgs): Promise<void> {
    try {
      await this.emit(args);
    } catch {
      /* logged in emit */
    }
  }
}

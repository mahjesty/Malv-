import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository } from "typeorm";
import { SecurityAuditEventEntity, type SecurityAuditSeverity } from "../db/entities/security-audit-event.entity";
import { SecurityEventSinkService } from "./security-event-sink.service";

export type SecurityRetentionBatchResult = {
  deletedTotal: number;
  archivedBatches: number;
  stoppedEarly: boolean;
};

@Injectable()
export class SecurityRetentionService {
  private readonly logger = new Logger(SecurityRetentionService.name);

  constructor(
    @InjectRepository(SecurityAuditEventEntity) private readonly repo: Repository<SecurityAuditEventEntity>,
    private readonly sink: SecurityEventSinkService,
    private readonly config: ConfigService
  ) {}

  /**
   * Idempotent batch retention pass: safe to run on a schedule. Deletes in small batches only.
   * When archival is enabled, deletes only after a successful archive POST for that batch (if URL is configured).
   */
  async runRetentionBatch(): Promise<SecurityRetentionBatchResult> {
    const retentionDays = this.parsePositiveInt(this.config.get<string>("SECURITY_EVENT_RETENTION_DAYS"), 90);
    const highDays = this.parsePositiveInt(this.config.get<string>("SECURITY_EVENT_HIGH_RETENTION_DAYS"), 365);
    const batchSize = this.parsePositiveInt(this.config.get<string>("SECURITY_EVENT_RETENTION_BATCH_SIZE"), 500);
    const archiveBefore = this.parseBool(this.config.get<string>("SECURITY_EVENT_ARCHIVE_BEFORE_DELETE"), false);

    const now = Date.now();
    const lowCut = new Date(now - retentionDays * 86_400_000);
    const highCut = new Date(now - highDays * 86_400_000);

    let deletedTotal = 0;
    let archivedBatches = 0;
    let stoppedEarly = false;

    const tierLow = await this.deleteTier(["low", "medium"], lowCut, batchSize, archiveBefore);
    deletedTotal += tierLow.deleted;
    archivedBatches += tierLow.archivedBatches;
    if (tierLow.stoppedEarly) stoppedEarly = true;

    if (!stoppedEarly) {
      const tierHigh = await this.deleteTier(["high", "critical"], highCut, batchSize, archiveBefore);
      deletedTotal += tierHigh.deleted;
      archivedBatches += tierHigh.archivedBatches;
      if (tierHigh.stoppedEarly) stoppedEarly = true;
    }

    return { deletedTotal, archivedBatches, stoppedEarly };
  }

  private async deleteTier(
    severities: SecurityAuditSeverity[],
    occurredBefore: Date,
    batchSize: number,
    archiveBefore: boolean
  ): Promise<{ deleted: number; archivedBatches: number; stoppedEarly: boolean }> {
    let deleted = 0;
    let archivedBatches = 0;
    let stoppedEarly = false;

    for (;;) {
      const batch = await this.repo.find({
        where: { severity: In(severities), occurredAt: LessThan(occurredBefore) },
        order: { occurredAt: "ASC" },
        take: batchSize,
        relations: ["actorUser"]
      });
      if (batch.length === 0) break;

      if (archiveBefore) {
        const normalized = batch.map((row) =>
          this.sink.toNormalized({
            internalEventId: row.id,
            occurredAt: row.occurredAt,
            eventType: row.eventType,
            severity: row.severity,
            subsystem: row.subsystem,
            summary: row.summary,
            details: row.detailsJson ?? null,
            actorUserId: row.actorUser?.id ?? null,
            actorRole: row.actorRole ?? null,
            sourceIp: row.sourceIp ?? null,
            correlationId: row.correlationId ?? null
          })
        );
        const ok = await this.sink.archiveBatchBestEffort(normalized);
        if (!ok) {
          this.logger.warn(
            "retention: archive dispatch failed or SECURITY_EVENT_ARCHIVE_WEBHOOK_URL unset; stopping tier to avoid deleting unaudited rows"
          );
          stoppedEarly = true;
          break;
        }
        archivedBatches += 1;
      }

      const ids = batch.map((b) => b.id);
      await this.repo.delete(ids);
      deleted += ids.length;

      if (batch.length < batchSize) break;
    }

    return { deleted, archivedBatches, stoppedEarly };
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(50_000, Math.floor(n));
  }

  private parseBool(raw: string | undefined, defaultVal: boolean): boolean {
    if (raw == null || raw === "") return defaultVal;
    return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  }
}

import type { SecurityAuditSeverity } from "../db/entities/security-audit-event.entity";

export type EmitSecurityEventArgs = {
  eventType: string;
  severity: SecurityAuditSeverity;
  subsystem: string;
  summary: string;
  details?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  sourceIp?: string | null;
  correlationId?: string | null;
};

/**
 * Sanitized, bounded payload for sinks, alerts, and archival. Includes snake_case mirrors for interoperability.
 */
export type NormalizedSecurityEvent = {
  internalEventId?: string;
  occurredAt: string;
  occurred_at: string;
  eventType: string;
  severity: SecurityAuditSeverity;
  subsystem: string;
  summary: string;
  details?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actor_user_id?: string | null;
  actorRole?: string | null;
  actor_role?: string | null;
  sourceIp?: string | null;
  source_ip?: string | null;
  correlationId?: string | null;
};

export type SecurityEventSink = {
  readonly sinkName: string;
  readonly isEnabled: boolean;
  send(event: NormalizedSecurityEvent): Promise<void>;
};

export type SecurityEventSinkHealth = {
  sinkName: string;
  enabled: boolean;
  status: "healthy" | "degraded" | "unknown";
  lastOkAt: string | null;
  lastError: string | null;
};

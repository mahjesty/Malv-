import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import fs from "fs/promises";
import type { NormalizedSecurityEvent, SecurityEventSink, SecurityEventSinkHealth } from "./security-event.types";

const SENSITIVE_KEY_PATTERNS = [
  "secret",
  "password",
  "token",
  "apiKey",
  "apikey",
  "private",
  "credential",
  "authorization",
  "cookie",
  "session"
];

function maybeRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((x) => lower.includes(x));
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((x) => sanitizeValue(x));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maybeRedactKey(k) ? "[REDACTED]" : sanitizeValue(v);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 4000) return `${value.slice(0, 4000)}…`;
  return value;
}

/**
 * Append-only NDJSON for external log shippers (Fluent Bit, Vector, Splunk HF, etc.).
 * Point MALV_SIEM_NDJSON_PATH at a volume path; ship off-node for immutable / WORM archives.
 */
class SiemNdjsonFileSink implements SecurityEventSink {
  readonly sinkName = "siem_ndjson_file";
  readonly isEnabled: boolean;

  constructor(private readonly filePath: string | null) {
    this.isEnabled = Boolean(filePath && filePath.length > 0);
  }

  async send(event: NormalizedSecurityEvent): Promise<void> {
    if (!this.filePath) return;
    const line = JSON.stringify({
      ...event,
      malv_siem_schema: "malv.security_event.v1",
      export_kind: "siem_ndjson_append_only"
    });
    await fs.appendFile(this.filePath, `${line}\n`, "utf8");
  }
}

class WebhookSecurityEventSink implements SecurityEventSink {
  readonly sinkName = "webhook";
  readonly isEnabled: boolean;

  constructor(private readonly url: string | null, private readonly timeoutMs: number) {
    this.isEnabled = Boolean(url);
  }

  async send(event: NormalizedSecurityEvent): Promise<void> {
    if (!this.url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

@Injectable()
export class SecurityEventSinkService {
  private readonly logger = new Logger(SecurityEventSinkService.name);
  private readonly sinks: SecurityEventSink[];
  private readonly health = new Map<string, { lastOkAt: Date | null; lastError: string | null }>();
  private readonly dispatchTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const timeoutRaw = Number(this.config.get<string>("SECURITY_EVENT_SINK_TIMEOUT_MS") ?? 1500);
    this.dispatchTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 200 ? timeoutRaw : 1500;
    const webhookUrlRaw = (this.config.get<string>("SECURITY_EVENT_WEBHOOK_URL") ?? "").trim();
    const webhookUrl = this.validateHttpUrl(webhookUrlRaw, "SECURITY_EVENT_WEBHOOK_URL");
    const siemPathRaw = (this.config.get<string>("MALV_SIEM_NDJSON_PATH") ?? "").trim();
    const siemPath = siemPathRaw.length > 0 ? siemPathRaw : null;
    this.sinks = [new WebhookSecurityEventSink(webhookUrl, this.dispatchTimeoutMs), new SiemNdjsonFileSink(siemPath)];
    for (const sink of this.sinks) this.health.set(sink.sinkName, { lastOkAt: null, lastError: null });
  }

  toNormalized(args: {
    internalEventId?: string;
    occurredAt?: Date;
    eventType: string;
    severity: "low" | "medium" | "high" | "critical";
    subsystem: string;
    summary: string;
    details?: Record<string, unknown> | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    sourceIp?: string | null;
    correlationId?: string | null;
  }): NormalizedSecurityEvent {
    const occurredIso = (args.occurredAt ?? new Date()).toISOString();
    const uid = args.actorUserId ?? null;
    const role = args.actorRole ?? null;
    const ip = args.sourceIp ?? null;
    return {
      internalEventId: args.internalEventId,
      occurredAt: occurredIso,
      occurred_at: occurredIso,
      eventType: args.eventType,
      severity: args.severity,
      subsystem: args.subsystem,
      summary: args.summary.slice(0, 1000),
      details: (sanitizeValue(args.details ?? null) as Record<string, unknown> | null) ?? null,
      actorUserId: uid,
      actor_user_id: uid,
      actorRole: role,
      actor_role: role,
      sourceIp: ip,
      source_ip: ip,
      correlationId: args.correlationId ?? null
    };
  }

  /**
   * Best-effort batch export before retention delete. Uses SECURITY_EVENT_ARCHIVE_WEBHOOK_URL when set.
   */
  async archiveBatchBestEffort(events: NormalizedSecurityEvent[]): Promise<boolean> {
    if (!events.length) return true;
    const urlRaw = (this.config.get<string>("SECURITY_EVENT_ARCHIVE_WEBHOOK_URL") ?? "").trim();
    const url = this.validateHttpUrl(urlRaw, "SECURITY_EVENT_ARCHIVE_WEBHOOK_URL");
    if (!url) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.dispatchTimeoutMs);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "malv.security_archive_batch", version: 1, events }),
        signal: controller.signal
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`security archive batch failed: ${msg}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async dispatchBestEffort(event: NormalizedSecurityEvent): Promise<void> {
    for (const sink of this.sinks) {
      if (!sink.isEnabled) continue;
      try {
        await sink.send(event);
        this.health.set(sink.sinkName, { lastOkAt: new Date(), lastError: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.health.set(sink.sinkName, {
          lastOkAt: this.health.get(sink.sinkName)?.lastOkAt ?? null,
          lastError: msg
        });
        this.logger.warn(`security event sink "${sink.sinkName}" failed: ${msg}`);
      }
    }
  }

  getSinkHealth(): SecurityEventSinkHealth[] {
    return this.sinks.map((sink) => {
      const state = this.health.get(sink.sinkName) ?? { lastOkAt: null, lastError: null };
      return {
        sinkName: sink.sinkName,
        enabled: sink.isEnabled,
        status: state.lastError ? "degraded" : state.lastOkAt ? "healthy" : "unknown",
        lastOkAt: state.lastOkAt?.toISOString() ?? null,
        lastError: state.lastError
      };
    });
  }

  private validateHttpUrl(urlRaw: string, envName: string): string | null {
    if (!urlRaw) return null;
    try {
      const u = new URL(urlRaw);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        this.logger.warn(`${envName} ignored: unsupported protocol`);
        return null;
      }
      return u.toString();
    } catch {
      this.logger.warn(`${envName} ignored: invalid URL`);
      return null;
    }
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NormalizedSecurityEvent } from "./security-event.types";
import type { SecurityAuditSeverity } from "../db/entities/security-audit-event.entity";

const SEVERITY_RANK: Record<SecurityAuditSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

/** High-value event types that route to alert channel even below min severity (e.g. policy denials, rate abuse). */
const ALERT_EVENT_TYPES = new Set([
  "sandbox.provider.init_failed",
  "security.signal.spike",
  "rate_limit.blocked",
  "sandbox.policy.denied"
]);

export type SecurityAlertSinkHealth = {
  sinkName: string;
  enabled: boolean;
  status: "healthy" | "degraded" | "unknown";
  lastOkAt: string | null;
  lastError: string | null;
};

export type SecurityAlertHealth = {
  webhook: SecurityAlertSinkHealth;
  lastDedupSuppressedAt: string | null;
  recentDedupSuppressions: number;
};

type WebhookAlertSink = {
  readonly sinkName: string;
  readonly isEnabled: boolean;
  send(payload: { alert: NormalizedSecurityEvent; dedupKey: string }): Promise<void>;
};

@Injectable()
export class SecurityAlertService {
  private readonly logger = new Logger(SecurityAlertService.name);
  private readonly minRank: number;
  private readonly dedupWindowMs: number;
  private readonly timeoutMs: number;
  private readonly webhookUrl: string | null;
  private readonly sinks: WebhookAlertSink[];
  private readonly dedupLastSent = new Map<string, number>();
  private recentDedupSuppressions = 0;
  private lastDedupSuppressedAt: Date | null = null;
  private webhookHealth: SecurityAlertSinkHealth = {
    sinkName: "webhook",
    enabled: false,
    status: "unknown",
    lastOkAt: null,
    lastError: null
  };

  constructor(private readonly config: ConfigService) {
    const minSev = (this.config.get<string>("SECURITY_ALERT_MIN_SEVERITY") ?? "high").trim().toLowerCase();
    const min: SecurityAuditSeverity =
      minSev === "critical" || minSev === "high" || minSev === "medium" || minSev === "low"
        ? (minSev as SecurityAuditSeverity)
        : "high";
    this.minRank = SEVERITY_RANK[min];
    const dedupRaw = Number(this.config.get<string>("SECURITY_ALERT_DEDUP_WINDOW_MS") ?? 120_000);
    this.dedupWindowMs = Number.isFinite(dedupRaw) && dedupRaw >= 5_000 ? dedupRaw : 120_000;
    const timeoutRaw = Number(this.config.get<string>("SECURITY_ALERT_TIMEOUT_MS") ?? 5000);
    this.timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 500 ? timeoutRaw : 5000;
    this.webhookUrl = this.validateWebhookUrl((this.config.get<string>("SECURITY_ALERT_WEBHOOK_URL") ?? "").trim());
    this.webhookHealth = { ...this.webhookHealth, enabled: Boolean(this.webhookUrl) };
    this.sinks = [
      {
        sinkName: "webhook",
        isEnabled: Boolean(this.webhookUrl),
        send: async (payload) => {
          if (!this.webhookUrl) return;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);
          try {
            await fetch(this.webhookUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "malv.security_alert",
                version: 1,
                ...payload
              }),
              signal: controller.signal
            });
          } finally {
            clearTimeout(timer);
          }
        }
      }
    ];
  }

  getAlertHealth(): SecurityAlertHealth {
    return {
      webhook: { ...this.webhookHealth },
      lastDedupSuppressedAt: this.lastDedupSuppressedAt?.toISOString() ?? null,
      recentDedupSuppressions: this.recentDedupSuppressions
    };
  }

  /**
   * Fire-and-forget after DB persistence. Never throws to callers.
   */
  maybeDispatchAfterPersist(event: NormalizedSecurityEvent): void {
    if (!this.shouldAlert(event)) return;
    const dedupKey = this.buildDedupKey(event);
    const now = Date.now();
    const last = this.dedupLastSent.get(dedupKey);
    if (last != null && now - last < this.dedupWindowMs) {
      this.recentDedupSuppressions += 1;
      this.lastDedupSuppressedAt = new Date();
      return;
    }
    this.dedupLastSent.set(dedupKey, now);
    this.pruneDedupMap(now);
    void this.dispatchToSinks(event, dedupKey).catch(() => {
      /* logged in dispatch */
    });
  }

  private shouldAlert(event: NormalizedSecurityEvent): boolean {
    if (SEVERITY_RANK[event.severity] >= this.minRank) return true;
    if (ALERT_EVENT_TYPES.has(event.eventType)) return true;
    return false;
  }

  private buildDedupKey(event: NormalizedSecurityEvent): string {
    const corr = event.correlationId ?? "";
    return `${event.eventType}|${event.severity}|${corr}`;
  }

  private pruneDedupMap(now: number) {
    if (this.dedupLastSent.size <= 2000) return;
    const cut = now - this.dedupWindowMs * 3;
    for (const [k, t] of this.dedupLastSent) {
      if (t < cut) this.dedupLastSent.delete(k);
    }
  }

  private async dispatchToSinks(event: NormalizedSecurityEvent, dedupKey: string): Promise<void> {
    const payload = { alert: event, dedupKey };
    for (const sink of this.sinks) {
      if (!sink.isEnabled) continue;
      try {
        await sink.send(payload);
        if (sink.sinkName === "webhook") {
          this.webhookHealth = {
            sinkName: "webhook",
            enabled: true,
            status: "healthy",
            lastOkAt: new Date().toISOString(),
            lastError: null
          };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`security alert sink "${sink.sinkName}" failed: ${msg}`);
        if (sink.sinkName === "webhook") {
          this.webhookHealth = {
            sinkName: "webhook",
            enabled: true,
            status: "degraded",
            lastOkAt: this.webhookHealth.lastOkAt,
            lastError: msg
          };
        }
      }
    }
  }

  private validateWebhookUrl(urlRaw: string): string | null {
    if (!urlRaw) return null;
    try {
      const u = new URL(urlRaw);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        this.logger.warn("SECURITY_ALERT_WEBHOOK_URL ignored: unsupported protocol");
        return null;
      }
      return u.toString();
    } catch {
      this.logger.warn("SECURITY_ALERT_WEBHOOK_URL ignored: invalid URL");
      return null;
    }
  }
}

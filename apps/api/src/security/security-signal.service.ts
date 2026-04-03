import { Injectable } from "@nestjs/common";
import { SecurityEventService } from "./security-event.service";

/**
 * Internal rolling counters for high-severity patterns (alert hooks; not a full SIEM).
 */
@Injectable()
export class SecuritySignalService {
  private readonly windowMs = 60_000;
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly securityEvents: SecurityEventService) {}

  private prune(key: string) {
    const now = Date.now();
    const arr = this.buckets.get(key) ?? [];
    const cut = arr.filter((t) => now - t < this.windowMs);
    this.buckets.set(key, cut);
    return cut;
  }

  record(args: { signalType: string; severity: "high" | "critical"; detail?: Record<string, unknown> }) {
    const key = args.signalType;
    const times = this.prune(key);
    times.push(Date.now());
    this.buckets.set(key, times);
    if (times.length >= 5) {
      void this.securityEvents.emitBestEffort({
        eventType: "security.signal.spike",
        severity: args.severity,
        subsystem: "signals",
        summary: `Repeated signal: ${args.signalType} (${times.length} in 60s)`,
        details: { signalType: args.signalType, count: times.length, ...(args.detail ?? {}) }
      });
    }
  }

  snapshot(): Record<string, { count60s: number }> {
    const out: Record<string, { count60s: number }> = {};
    for (const key of this.buckets.keys()) {
      out[key] = { count60s: this.prune(key).length };
    }
    return out;
  }
}

import { SecurityAlertService } from "./security-alert.service";
import type { NormalizedSecurityEvent } from "./security-event.types";

function cfg(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as any;
}

function baseEvent(over: Partial<NormalizedSecurityEvent> = {}): NormalizedSecurityEvent {
  const t = new Date().toISOString();
  return {
    eventType: "test.event",
    severity: "high",
    subsystem: "test",
    summary: "s",
    occurredAt: t,
    occurred_at: t,
    actorUserId: null,
    actor_user_id: null,
    actorRole: null,
    actor_role: null,
    sourceIp: null,
    source_ip: null,
    correlationId: null,
    details: null,
    ...over
  };
}

describe("SecurityAlertService", () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  it("fires webhook for high severity event", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
    const svc = new SecurityAlertService(
      cfg({
        SECURITY_ALERT_WEBHOOK_URL: "https://example.com/alert",
        SECURITY_ALERT_MIN_SEVERITY: "high",
        SECURITY_ALERT_DEDUP_WINDOW_MS: "60000",
        SECURITY_ALERT_TIMEOUT_MS: "5000"
      })
    );
    svc.maybeDispatchAfterPersist(baseEvent({ severity: "high", eventType: "x.y" }));
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as any).body).kind).toBe("malv.security_alert");
  });

  it("deduplicates repeated alerts in the dedup window", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
    const svc = new SecurityAlertService(
      cfg({
        SECURITY_ALERT_WEBHOOK_URL: "https://example.com/alert",
        SECURITY_ALERT_DEDUP_WINDOW_MS: "300000"
      })
    );
    const ev = baseEvent({ eventType: "dup", severity: "critical", correlationId: "c1" });
    svc.maybeDispatchAfterPersist(ev);
    svc.maybeDispatchAfterPersist(ev);
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(svc.getAlertHealth().recentDedupSuppressions).toBeGreaterThanOrEqual(1);
  });

  it("does not throw when alert webhook fails", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as any;
    const svc = new SecurityAlertService(
      cfg({
        SECURITY_ALERT_WEBHOOK_URL: "https://example.com/alert"
      })
    );
    expect(() => svc.maybeDispatchAfterPersist(baseEvent({ severity: "high" }))).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(svc.getAlertHealth().webhook.status).toBe("degraded");
    expect(svc.getAlertHealth().webhook.lastError).toContain("network");
  });

  it("routes whitelisted event types even below min severity when configured high", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
    const svc = new SecurityAlertService(
      cfg({
        SECURITY_ALERT_WEBHOOK_URL: "https://example.com/alert",
        SECURITY_ALERT_MIN_SEVERITY: "high"
      })
    );
    svc.maybeDispatchAfterPersist(
      baseEvent({ severity: "medium", eventType: "sandbox.policy.denied", correlationId: "run-1" })
    );
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalled();
  });
});

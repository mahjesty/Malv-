import { SecurityEventSinkService } from "./security-event-sink.service";

describe("SecurityEventSinkService", () => {
  function cfg(values: Record<string, string | undefined>) {
    return { get: (k: string) => values[k] } as any;
  }

  it("redacts sensitive detail keys in normalized payload", () => {
    const svc = new SecurityEventSinkService(cfg({}));
    const out = svc.toNormalized({
      eventType: "auth.test",
      severity: "high",
      subsystem: "auth",
      summary: "summary",
      details: {
        ok: true,
        accessToken: "abc123",
        nested: { password: "p", keep: "v" }
      }
    });
    expect((out.details as any).ok).toBe(true);
    expect((out.details as any).accessToken).toBe("[REDACTED]");
    expect((out.details as any).nested.password).toBe("[REDACTED]");
    expect((out.details as any).nested.keep).toBe("v");
    expect(out.occurred_at).toBe(out.occurredAt);
  });

  it("disables invalid webhook URL without throwing", () => {
    const svc = new SecurityEventSinkService(
      cfg({
        SECURITY_EVENT_WEBHOOK_URL: "not a url"
      })
    );
    const health = svc.getSinkHealth();
    expect(health.find((h) => h.sinkName === "webhook")?.enabled).toBe(false);
    expect(health.some((h) => h.sinkName === "siem_ndjson_file")).toBe(true);
    expect(health.find((h) => h.sinkName === "siem_ndjson_file")?.enabled).toBe(false);
  });
});

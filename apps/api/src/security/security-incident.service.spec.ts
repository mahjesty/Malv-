import { SecurityIncidentService } from "./security-incident.service";
import type { NormalizedSecurityEvent } from "./security-event.types";

function norm(over: Partial<NormalizedSecurityEvent> = {}): NormalizedSecurityEvent {
  const t = new Date().toISOString();
  return {
    eventType: "security.signal.spike",
    severity: "high",
    subsystem: "signals",
    summary: "spike",
    occurredAt: t,
    occurred_at: t,
    actorUserId: null,
    actor_user_id: null,
    actorRole: null,
    actor_role: null,
    sourceIp: null,
    source_ip: null,
    correlationId: "corr-1",
    details: null,
    ...over
  };
}

describe("SecurityIncidentService", () => {
  it("reuses open incident for same correlation cluster", async () => {
    const existing = {
      id: "inc-1",
      dedupKey: "corr:corr-1",
      status: "open" as const,
      summary: "old",
      severity: "high" as const,
      correlationId: "corr-1",
      updatedAt: new Date()
    };
    const incidents = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const links = { insert: jest.fn().mockResolvedValue(undefined) };
    const audit = { createQueryBuilder: jest.fn() };
    const svc = new SecurityIncidentService(incidents as any, links as any, audit as any);
    await svc.handleEventAfterPersist(norm({ correlationId: "corr-1" }), "evt-1");
    expect(links.insert).toHaveBeenCalledWith({ incidentId: "inc-1", securityAuditEventId: "evt-1" });
    expect(incidents.update).toHaveBeenCalled();
    expect(incidents.save).not.toHaveBeenCalled();
  });

  it("creates new incident when no open cluster exists", async () => {
    const incidents = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ ...x, id: "new-inc" })),
      update: jest.fn()
    };
    const links = { insert: jest.fn().mockResolvedValue(undefined) };
    const audit = { createQueryBuilder: jest.fn() };
    const svc = new SecurityIncidentService(incidents as any, links as any, audit as any);
    await svc.handleEventAfterPersist(norm({ correlationId: "new-corr" }), "evt-2");
    expect(incidents.save).toHaveBeenCalled();
    expect(links.insert).toHaveBeenCalledWith({ incidentId: "new-inc", securityAuditEventId: "evt-2" });
  });
});

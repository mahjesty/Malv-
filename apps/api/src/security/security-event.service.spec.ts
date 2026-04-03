import { SecurityEventService } from "./security-event.service";
import { SecurityAuditEventEntity } from "../db/entities/security-audit-event.entity";

describe("SecurityEventService", () => {
  function makeSinkStub() {
    return {
      dispatchBestEffort: jest.fn(async () => {}),
      toNormalized: jest.fn((x: any) => x),
      getSinkHealth: jest.fn(() => [])
    };
  }

  function makeAlertIncidentStubs() {
    return {
      alert: {
        maybeDispatchAfterPersist: jest.fn(),
        getAlertHealth: jest.fn(() => ({
          webhook: {
            sinkName: "webhook",
            enabled: false,
            status: "unknown" as const,
            lastOkAt: null,
            lastError: null
          },
          lastDedupSuppressedAt: null,
          recentDedupSuppressions: 0
        }))
      },
      incident: { handleEventAfterPersist: jest.fn(async () => {}) }
    };
  }

  it("emits structured security events for auth and sandbox paths", async () => {
    const saved: SecurityAuditEventEntity[] = [];
    const repo = {
      create: jest.fn((x: SecurityAuditEventEntity) => x),
      save: jest.fn(async (x: SecurityAuditEventEntity) => {
        const row = { ...x, id: "evt-1" } as SecurityAuditEventEntity;
        saved.push(row);
        return row;
      }),
      update: jest.fn()
    };
    const stubs = makeAlertIncidentStubs();
    const svc = new SecurityEventService(repo as any, makeSinkStub() as any, stubs.alert as any, stubs.incident as any);
    await svc.emit({
      eventType: "auth.jwt.rejected",
      severity: "low",
      subsystem: "auth",
      summary: "test",
      details: { x: 1 }
    });
    await svc.emit({
      eventType: "sandbox.policy.denied",
      severity: "medium",
      subsystem: "sandbox_policy",
      summary: "denied"
    });
    expect(saved.length).toBe(2);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("append-only: normal flow uses insert (save) not update", async () => {
    const repo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: "1", ...x })),
      update: jest.fn(),
      delete: jest.fn()
    };
    const stubs = makeAlertIncidentStubs();
    const svc = new SecurityEventService(repo as any, makeSinkStub() as any, stubs.alert as any, stubs.incident as any);
    await svc.emit({
      eventType: "rate_limit.blocked",
      severity: "medium",
      subsystem: "rate_limit",
      summary: "blocked"
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("reports audit sink health after successful write", async () => {
    const repo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x)
    };
    const stubs = makeAlertIncidentStubs();
    const svc = new SecurityEventService(repo as any, makeSinkStub() as any, stubs.alert as any, stubs.incident as any);
    await svc.emit({
      eventType: "test",
      severity: "low",
      subsystem: "test",
      summary: "x"
    });
    expect(svc.getAuditSinkHealth().status).toBe("healthy");
  });
});

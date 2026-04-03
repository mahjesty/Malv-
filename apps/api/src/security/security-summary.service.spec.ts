import { SecuritySummaryService } from "./security-summary.service";

describe("SecuritySummaryService", () => {
  it("aggregates severity counts for last 24h", async () => {
    const auditRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { severity: "high", cnt: "2" },
          { severity: "low", cnt: "5" }
        ])
      }),
      find: jest.fn().mockResolvedValue([])
    };
    const securityEvents = {
      getAuditSinkHealth: jest.fn().mockReturnValue({
        status: "healthy",
        lastWriteOkAt: null,
        lastError: null,
        externalSinks: [],
        alerts: {
          webhook: { sinkName: "webhook", enabled: false, status: "unknown", lastOkAt: null, lastError: null },
          lastDedupSuppressedAt: null,
          recentDedupSuppressions: 0
        }
      })
    };
    const posture = {
      getSnapshot: jest.fn().mockReturnValue({
        sandbox: { providerMode: "local", enforcementClass: "best_effort", dockerHealth: "not_applicable" }
      })
    };
    const signals = { snapshot: jest.fn().mockReturnValue({ x: { count60s: 1 } }) };
    const incidents = { listRecentActive: jest.fn().mockResolvedValue([]) };
    const svc = new SecuritySummaryService(
      auditRepo as any,
      securityEvents as any,
      posture as any,
      signals as any,
      incidents as any
    );
    const out = await svc.getAdminSummary({ isProd: false });
    expect(out.countsBySeverity24h.high).toBe(2);
    expect(out.countsBySeverity24h.low).toBe(5);
    expect(out.signals).toEqual({ x: { count60s: 1 } });
  });
});

import { SecurityPostureService } from "./security-posture.service";

describe("SecurityPostureService", () => {
  it("backend-generated posture includes sandbox and secrets summary shape", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "local";
    const isolation = {
      getDockerHealthSnapshot: () => "not_applicable" as const,
      getEnforcementClassSnapshot: () => "best_effort" as const
    };
    const securityEvents = {
      getAuditSinkHealth: () => ({
        status: "unknown" as const,
        lastWriteOkAt: null,
        lastError: null,
        externalSinks: [],
        alerts: {
          webhook: {
            sinkName: "webhook",
            enabled: false,
            status: "unknown" as const,
            lastOkAt: null,
            lastError: null
          },
          lastDedupSuppressedAt: null,
          recentDedupSuppressions: 0
        }
      })
    };
    const cfg = {
      get: (k: string) => process.env[k]
    };
    const svc = new SecurityPostureService(cfg as any, isolation as any, securityEvents as any);
    const snap = svc.getSnapshot({ isProd: false });
    expect(snap.sandbox.providerMode).toBe("local");
    expect(snap.sandbox.enforcementClass).toBe("best_effort");
    expect(snap.secretsSummary.groups).toHaveProperty("jwt");
    expect(snap.redactedCriticalEnv.JWT_ACCESS_SECRET).toMatch(/\*\*\*|unset/);
  });
});

import { ContinuityIntelligenceService } from "./continuity-intelligence.service";

describe("ContinuityIntelligenceService", () => {
  const svc = new ContinuityIntelligenceService();

  it("preserves continuity across chat to call to task transitions", () => {
    const out = svc.analyze({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "medium",
      evidenceLevel: "partial",
      inputMode: "voice",
      activeSurface: "mixed",
      requestedExternalExecution: true,
      activeDevice: "phone"
    });
    expect(out.continuityState).toBe("transitioning");
    expect(out.contextTransferMap).toContain("chat_to_call_continuity");
    expect(out.contextTransferMap).toContain("call_to_task_continuity");
    expect(out.contextTransferMap).toContain("task_to_device_continuity");
  });

  it("hardens vault boundary behavior during execution", () => {
    const out = svc.analyze({
      urgency: "low",
      riskTier: "medium",
      modeType: "execute",
      tone: "sensitive",
      scopeSize: "small",
      evidenceLevel: "partial",
      requestedExternalExecution: true,
      vaultScoped: true
    });
    expect(out.vaultBoundaryState).toBe("strict_isolation");
  });
});

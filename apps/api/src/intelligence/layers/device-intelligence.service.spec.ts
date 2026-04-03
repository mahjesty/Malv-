import { BridgeRoutingService } from "./bridge-routing.service";
import { DeviceIntelligenceService } from "./device-intelligence.service";
import { ExternalExecutionService } from "./external-execution.service";

describe("DeviceIntelligenceService", () => {
  const svc = new DeviceIntelligenceService(new BridgeRoutingService(), new ExternalExecutionService());

  it("handles ambiguous target with permission-aware advisory fallback", () => {
    const out = svc.analyze({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "partial",
      requestedExternalExecution: true,
      requestText: "do it on that device"
    });
    expect(out.executionTarget).toBe("none");
    expect(out.fallbackSuggested).toBe(true);
    expect(out.confidence).toBeLessThan(0.5);
    expect(out.confirmationStrategy).toBe("deny_and_explain");
    expect(out.executionPlan).toContain("provide_advisory_only_steps");
  });

  it("flags capability mismatch when bridge is unsupported", () => {
    const out = svc.analyze({
      urgency: "low",
      riskTier: "low",
      modeType: "execute",
      tone: "direct",
      scopeSize: "small",
      evidenceLevel: "strong",
      requestedExternalExecution: true,
      requestText: "turn on thermostat in home",
      bridgeAvailability: ["browser_agent"]
    });
    expect(out.executionTarget).toBe("home_device");
    expect(out.bridgeRoute).toBe("none");
    expect(out.approvalRequired).toBe(true);
    expect(out.confirmationStrategy).toBe("deny_and_explain");
  });
});

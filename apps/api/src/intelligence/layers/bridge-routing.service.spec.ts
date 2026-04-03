import { BridgeRoutingService } from "./bridge-routing.service";

describe("BridgeRoutingService", () => {
  const svc = new BridgeRoutingService();

  it("routes with fallback when primary bridge missing", () => {
    const out = svc.analyze(
      {
        urgency: "low",
        riskTier: "low",
        modeType: "execute",
        tone: "direct",
        scopeSize: "small",
        evidenceLevel: "strong",
        bridgeAvailability: ["desktop_agent"]
      },
      "phone"
    );
    expect(out).toBe("desktop_agent");
  });

  it("returns none for unsupported target with no bridge", () => {
    const out = svc.analyze(
      {
        urgency: "low",
        riskTier: "medium",
        modeType: "execute",
        tone: "neutral",
        scopeSize: "small",
        evidenceLevel: "partial",
        bridgeAvailability: []
      },
      "home_device"
    );
    expect(out).toBe("none");
  });
});

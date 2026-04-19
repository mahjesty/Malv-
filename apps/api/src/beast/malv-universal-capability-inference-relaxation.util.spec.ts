import { shouldRelaxUniversalCapabilityChatInferenceDemand } from "./malv-universal-capability-inference-relaxation.util";

describe("shouldRelaxUniversalCapabilityChatInferenceDemand", () => {
  it("returns false when no universal demand patch", () => {
    expect(
      shouldRelaxUniversalCapabilityChatInferenceDemand({
        universalDemandPatch: null,
        filteredFailoverPlanStepCount: 0
      })
    ).toBe(false);
    expect(
      shouldRelaxUniversalCapabilityChatInferenceDemand({
        universalDemandPatch: undefined,
        filteredFailoverPlanStepCount: 0
      })
    ).toBe(false);
  });

  it("returns false when steps remain", () => {
    expect(
      shouldRelaxUniversalCapabilityChatInferenceDemand({
        universalDemandPatch: { minimumCapabilityClass: "enhanced" } as any,
        filteredFailoverPlanStepCount: 2
      })
    ).toBe(false);
  });

  it("returns true when universal demand exists but failover plan is empty", () => {
    expect(
      shouldRelaxUniversalCapabilityChatInferenceDemand({
        universalDemandPatch: { minimumCapabilityClass: "enhanced" } as any,
        filteredFailoverPlanStepCount: 0
      })
    ).toBe(true);
  });
});

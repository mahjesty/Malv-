import { malvServerPhasedOrchestrationEligible } from "./malv-server-phased-eligibility.util";

describe("malvServerPhasedOrchestrationEligible (Phase 5 transport parity)", () => {
  it("is true for phased strategy with phases when module enabled and not super-fix", () => {
    expect(
      malvServerPhasedOrchestrationEligible({
        phasedModuleEnabled: true,
        executionStrategyMode: "phased",
        superFix: false,
        internalPhaseCount: 3
      })
    ).toBe(true);
  });

  it("is false when phased module disabled (env / feature flag)", () => {
    expect(
      malvServerPhasedOrchestrationEligible({
        phasedModuleEnabled: false,
        executionStrategyMode: "phased",
        superFix: false,
        internalPhaseCount: 3
      })
    ).toBe(false);
  });

  it("is false for super-fix turns regardless of strategy shape", () => {
    expect(
      malvServerPhasedOrchestrationEligible({
        phasedModuleEnabled: true,
        executionStrategyMode: "phased",
        superFix: true,
        internalPhaseCount: 3
      })
    ).toBe(false);
  });

  it("is false when no internal phases", () => {
    expect(
      malvServerPhasedOrchestrationEligible({
        phasedModuleEnabled: true,
        executionStrategyMode: "phased",
        superFix: false,
        internalPhaseCount: 0
      })
    ).toBe(false);
  });

  it("is false for single_step strategy", () => {
    expect(
      malvServerPhasedOrchestrationEligible({
        phasedModuleEnabled: true,
        executionStrategyMode: "single_step",
        superFix: false,
        internalPhaseCount: 2
      })
    ).toBe(false);
  });
});

import { IntentUnderstandingService } from "./intent-understanding.service";
import { ExecutionStrategyService } from "./execution-strategy.service";

describe("ExecutionStrategyService", () => {
  const intent = new IntentUnderstandingService();
  const strategy = new ExecutionStrategyService();

  it("phases full product builds with engineering loop + product phases", () => {
    const c = intent.classify("build me a crypto trading platform");
    const s = strategy.buildStrategy(c);
    expect(c.primaryIntent).toBe("full_product_build");
    expect(s.mode).toBe("phased");
    expect(s.preferBeastWorker).toBe(true);
    expect(s.internalPhases.length).toBeGreaterThanOrEqual(10);
    expect(s.internalPhases).toContain("architecture");
    expect(s.internalPhases).toContain("optimization");
  });

  it("uses single-step for small bug fixes", () => {
    const c = intent.classify("fix typo in error label on settings page");
    const s = strategy.buildStrategy(c);
    expect(c.primaryIntent).toBe("bug_fix");
    expect(s.mode).toBe("single_step");
    expect(s.internalPhases).toContain("audit");
    expect(s.internalPhases).toContain("review");
  });

  it("chooses phased or single-step appropriately for medium features", () => {
    const msg =
      "Add a new feature: in-app notification center with bell icon, read/unread state, and a preferences screen. " +
      "Users should be able to mute categories. Reuse existing session auth; keep changes scoped to the dashboard app. " +
      "Deliver UX copy and component structure first, then wire to existing APIs where possible.";
    const c = intent.classify(msg);
    const s = strategy.buildStrategy(c);
    expect(c.primaryIntent).toBe("feature_build");
    expect(["single_step", "phased"]).toContain(s.mode);
    expect(c.scopeSize).toBe("medium");
  });

  it("requires clarification when intent layer marks ambiguity", () => {
    const c = intent.classify("update");
    expect(c.ambiguity.isAmbiguous).toBe(true);
    const s = strategy.buildStrategy(c);
    expect(s.mode).toBe("require_clarification");
    expect(s.internalPhases.length).toBe(0);
  });
});

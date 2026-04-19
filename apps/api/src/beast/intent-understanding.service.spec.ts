import { IntentUnderstandingService } from "./intent-understanding.service";

describe("IntentUnderstandingService", () => {
  const svc = new IntentUnderstandingService();

  it("classifies a full product prompt and scopes it large", () => {
    const c = svc.classify("build me a crypto trading platform with spot and futures");
    expect(c.primaryIntent).toBe("full_product_build");
    expect(c.scopeSize).toBe("large");
    expect(c.complexity).toBe("high");
    expect(c.domains.length).toBeGreaterThan(0);
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("classifies a small bug fix with low complexity bias", () => {
    const c = svc.classify("fix: login button does nothing when session expired");
    expect(c.primaryIntent).toBe("bug_fix");
    expect(c.scopeSize).toBe("small");
    expect(["low", "medium"]).toContain(c.complexity);
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("classifies a medium feature request", () => {
    const msg =
      "Add a CSV export for the reports table with column picker and async download. Keep existing filters.";
    const c = svc.classify(msg);
    expect(c.primaryIntent).toBe("feature_build");
    expect(["medium", "large"]).toContain(c.scopeSize);
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("flags an ambiguous vague prompt for clarification", () => {
    const c = svc.classify("help");
    expect(c.ambiguity.isAmbiguous).toBe(true);
    expect(c.ambiguity.reason).toBe("message_too_vague");
  });

  it("does not force clarification for short knowledge questions (question mark)", () => {
    const c = svc.classify("whats cryptio?");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for short explain-style prompts", () => {
    const c = svc.classify("explain tides");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for broad step-by-step explain requests", () => {
    const c = svc.classify("explain something complex step by step and be detailed");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for teach-me-open-ended prompts", () => {
    const c = svc.classify("teach me something interesting");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not trap permissive replies after low-signal classification", () => {
    const c = svc.classify("anything");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("still requires clarification for bare vague help", () => {
    const c = svc.classify("help");
    expect(c.ambiguity.isAmbiguous).toBe(true);
  });

  it("does not force clarification for explicit debug/reasoning prompts", () => {
    const c = svc.classify("do a deep thinking so we can debug");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for 'debug this' style requests", () => {
    const c = svc.classify("debug the auth flow");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for 'think through' style requests", () => {
    const c = svc.classify("think through the problem with me");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("does not force clarification for 'analyze this' requests", () => {
    const c = svc.classify("analyze this and let me know");
    expect(c.ambiguity.isAmbiguous).toBe(false);
  });

  it("exposes deterministic scores for audit", () => {
    const c = svc.classify("upgrade our k8s cluster and bump node version");
    expect(c.scores.system_upgrade).toBeGreaterThanOrEqual(4);
    expect(c.primaryIntent).toBe("system_upgrade");
  });
});

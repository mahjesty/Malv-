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

  it("exposes deterministic scores for audit", () => {
    const c = svc.classify("upgrade our k8s cluster and bump node version");
    expect(c.scores.system_upgrade).toBeGreaterThanOrEqual(4);
    expect(c.primaryIntent).toBe("system_upgrade");
  });
});

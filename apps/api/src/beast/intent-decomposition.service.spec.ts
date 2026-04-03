import { IntentDecompositionService } from "./intent-decomposition.service";

describe("IntentDecompositionService", () => {
  const svc = new IntentDecompositionService();

  it("decomposes execute requests into advisory phases with approval gate", () => {
    const out = svc.decompose("open browser and execute deployment");
    expect(out.intent).toBe("execute");
    expect(out.phases.some((p) => p.type === "execution_phase")).toBe(true);
    expect(out.phases.some((p) => p.requiresApproval)).toBe(true);
    expect(out.phases.map((p) => p.order)).toEqual([1, 2, 3, 4]);
  });

  it("returns deterministic structure for debug intent", () => {
    const out = svc.decompose("debug this failing test");
    expect(out.intent).toBe("debug");
    expect(out.phases[0].type).toBe("research_phase");
    expect(out.phases[out.phases.length - 1]?.requiresApproval).toBe(true);
  });
});

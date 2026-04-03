import { StudioRuntimeEventMapper } from "./studio-runtime-event.mapper";

describe("StudioRuntimeEventMapper", () => {
  it("maps phase updates deterministically", () => {
    const mapper = new StudioRuntimeEventMapper();
    const out = mapper.mapPhaseUpdate({ sessionId: "s1", phaseId: "rebuild", status: "completed", detail: "ready" });
    expect(out.sessionId).toBe("s1");
    expect(out.type).toBe("phase_update");
    expect(out.payload.phaseId).toBe("rebuild");
    expect(out.payload.status).toBe("completed");
  });

  it("maps apply state with risk and confidence", () => {
    const mapper = new StudioRuntimeEventMapper();
    const out = mapper.mapApplyState({
      sessionId: "s1",
      state: "pending_approval",
      riskLevel: "high",
      confidence: "low"
    });
    expect(out.type).toBe("apply_state");
    expect(out.payload.riskLevel).toBe("high");
    expect(out.payload.confidence).toBe("low");
  });
});


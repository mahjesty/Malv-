import { MalvResponseShapingLayerService } from "./malv-response-shaping-layer.service";
import type { MalvResponsePlan } from "./malv-response-planning.util";

function plan(structure: MalvResponsePlan["structure"]): MalvResponsePlan {
  return {
    responseType: "explanatory",
    structure,
    steps: [{ type: "core_explanation" }],
    depth: "medium"
  };
}

describe("MalvResponseShapingLayerService", () => {
  const svc = new MalvResponseShapingLayerService();

  it("keeps step-by-step output structured as numbered steps", () => {
    const out = svc.shape({
      response: "- Check logs\n- Restart worker\n- Verify health endpoint",
      plan: plan("step_by_step")
    });
    expect(out).toContain("1. Check logs");
    expect(out).toContain("2. Restart worker");
  });

  it("keeps direct answers concise", () => {
    const out = svc.shape({
      response:
        "Yes, the service is healthy. The last deploy completed. The queue backlog is also clear. No further action needed.",
      plan: plan("direct")
    });
    expect(out).toBe("Yes, the service is healthy. The last deploy completed.");
  });

  it("removes internal/system language", () => {
    const out = svc.shape({
      response: "I will now proceed based on system pipeline in this execution phase.",
      plan: plan("adaptive")
    });
    expect(out.toLowerCase()).not.toContain("i will now");
    expect(out.toLowerCase()).not.toContain("based on system");
    expect(out.toLowerCase()).not.toContain("pipeline");
    expect(out.toLowerCase()).not.toContain("execution phase");
  });

  it("never leaks pipeline trace wording to user-visible text", () => {
    const out = svc.shape({
      response: "Internal response pipeline trace: decision=guarded, planning=step_by_step.",
      plan: plan("adaptive")
    });
    expect(out.toLowerCase()).not.toContain("response pipeline trace");
  });

  it("is deterministic across runs", () => {
    const input = {
      response: "First line.\n\nFirst line.\nSecond line.",
      plan: plan("adaptive")
    };
    const a = svc.shape(input);
    const b = svc.shape(input);
    expect(a).toBe(b);
  });

  it("preserves guarded responses unchanged", () => {
    const raw = "I cannot help with that request due to safety policy.";
    const out = svc.shape({
      response: raw,
      plan: plan("direct"),
      preserveGuarded: true
    });
    expect(out).toBe(raw);
  });

  describe("hadLiveStreamTokens — structural rewrites suppressed", () => {
    it("does NOT truncate a long direct reply when live tokens were streamed", () => {
      const response =
        "Yes, the service is healthy. The last deploy completed. The queue backlog is also clear. No further action needed.";
      const withoutFlag = svc.shape({ response, plan: plan("direct") });
      const withFlag = svc.shape({ response, plan: plan("direct"), hadLiveStreamTokens: true });
      // Without flag: direct plan truncates to two sentences.
      expect(withoutFlag).toBe("Yes, the service is healthy. The last deploy completed.");
      // With flag: full body preserved so assistant_done.finalContent matches what user read.
      expect(withFlag).toBe(response.trim());
    });

    it("does NOT convert bullet lists to numbered steps when live tokens were streamed", () => {
      const response = "- Check logs\n- Restart worker\n- Verify health endpoint";
      const withoutFlag = svc.shape({ response, plan: plan("step_by_step") });
      const withFlag = svc.shape({ response, plan: plan("step_by_step"), hadLiveStreamTokens: true });
      // Without flag: step_by_step converts bullets to numbers.
      expect(withoutFlag).toContain("1. Check logs");
      // With flag: body preserved as streamed (bullets unchanged).
      expect(withFlag).toContain("- Check logs");
      expect(withFlag).not.toContain("1. Check logs");
    });

    it("still strips internal language even when live tokens were streamed", () => {
      const response = "I will now proceed based on system pipeline in this execution phase.";
      const out = svc.shape({ response, plan: plan("adaptive"), hadLiveStreamTokens: true });
      expect(out.toLowerCase()).not.toContain("i will now");
      expect(out.toLowerCase()).not.toContain("pipeline");
    });

    it("streamed body and non-streaming body converge for adaptive plan", () => {
      const response = "Here is a summary of the results.";
      const streamed = svc.shape({ response, plan: plan("adaptive"), hadLiveStreamTokens: true });
      const nonStreamed = svc.shape({ response, plan: plan("adaptive") });
      expect(streamed).toBe(nonStreamed);
    });
  });
});

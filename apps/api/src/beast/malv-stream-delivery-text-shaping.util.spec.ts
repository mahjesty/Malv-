import { shapeMalvAssistantStreamDeltaForDelivery } from "./malv-stream-delivery-text-shaping.util";
import { shapeMalvReply } from "./response-shaper";

describe("malv-stream-delivery-text-shaping", () => {
  it("removes obvious tutorial coaching early like final shaping, without running full reply pipeline", () => {
    const raw = "You can search online for more.   Hello!!";
    const streamed = shapeMalvAssistantStreamDeltaForDelivery(raw);
    const finalized = shapeMalvReply(raw).text;
    expect(streamed.toLowerCase()).not.toMatch(/search online/);
    expect(finalized.toLowerCase()).not.toMatch(/search online/);
    expect(streamed).toMatch(/Hello!!/);
  });

  it("normalizes spacing and punctuation noise in stream deltas", () => {
    expect(shapeMalvAssistantStreamDeltaForDelivery("a    b")).toBe("a b");
    expect(shapeMalvAssistantStreamDeltaForDelivery("Really???")).toBe("Really??");
  });
});

import { describe, expect, it } from "vitest";
import { computeAssistantStreamVisibleEnd } from "./malvAssistantStreamVisibleCadence";

describe("computeAssistantStreamVisibleEnd", () => {
  it("always paints through current canonical length (rAF-coalesced truth)", () => {
    expect(
      computeAssistantStreamVisibleEnd({
        canonical: "hello world",
        visibleLen: 0
      })
    ).toBe(11);
    expect(
      computeAssistantStreamVisibleEnd({
        canonical: "hello world",
        visibleLen: 5
      })
    ).toBe(11);
  });

  it("includes whitespace-only canonical (no trim gating)", () => {
    expect(
      computeAssistantStreamVisibleEnd({
        canonical: "   ",
        visibleLen: 0
      })
    ).toBe(3);
  });
});

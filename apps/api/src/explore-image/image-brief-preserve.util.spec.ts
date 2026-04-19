import { shouldPreserveImageBriefVerbatim } from "./image-brief-preserve.util";

describe("shouldPreserveImageBriefVerbatim", () => {
  it("returns false without a source image", () => {
    expect(shouldPreserveImageBriefVerbatim("x".repeat(200), false)).toBe(false);
  });

  it("returns false for short captions with a source image", () => {
    expect(shouldPreserveImageBriefVerbatim("make it look like clouds", true)).toBe(false);
  });

  it("returns true for long in-app transform recipes with a source image", () => {
    const brief = "The subject settles into a polished caricature read—gesture and proportion stretch with playful clarity, yet the person remains unmistakable.";
    expect(shouldPreserveImageBriefVerbatim(brief, true)).toBe(true);
  });
});

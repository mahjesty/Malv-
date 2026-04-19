import { describe, expect, it } from "vitest";
import {
  optionalImproveRefinementNote,
  optionalReviewHeroNuance,
  optionalReviewRationaleElaboration,
  sanitizeExploreBoundedModelText
} from "./exploreModelEnhancement";

describe("exploreModelEnhancement", () => {
  it("sanitizeExploreBoundedModelText returns null for empty or non-strings", () => {
    expect(sanitizeExploreBoundedModelText(null)).toBeNull();
    expect(sanitizeExploreBoundedModelText(undefined)).toBeNull();
    expect(sanitizeExploreBoundedModelText("   \n\t  ")).toBeNull();
    expect(sanitizeExploreBoundedModelText(1 as unknown as string)).toBeNull();
  });

  it("sanitizeExploreBoundedModelText collapses whitespace and truncates with ellipsis", () => {
    expect(sanitizeExploreBoundedModelText("  a \n b  ", 10)).toBe("a b");
    const long = "x".repeat(20);
    expect(sanitizeExploreBoundedModelText(long, 8)).toBe("xxxxxxx…");
  });

  it("optional slot helpers return null when enhancement is absent", () => {
    expect(optionalReviewHeroNuance(undefined)).toBeNull();
    expect(optionalReviewRationaleElaboration(null)).toBeNull();
    expect(optionalImproveRefinementNote(undefined)).toBeNull();
  });

  it("optionalReviewHeroNuance passes through bounded text", () => {
    expect(optionalReviewHeroNuance({ reviewHeroNuance: "  Extra context.  " })).toBe("Extra context.");
  });
});

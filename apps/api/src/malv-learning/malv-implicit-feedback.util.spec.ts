import {
  detectClarificationFrustrationLoop,
  detectLikelyUserReask,
  detectUserCorrectionPhrase
} from "./malv-implicit-feedback.util";

describe("malv-implicit-feedback.util", () => {
  it("detectUserCorrectionPhrase matches common corrections", () => {
    expect(detectUserCorrectionPhrase("No, I meant the API layer")).toBe(true);
    expect(detectUserCorrectionPhrase("thanks")).toBe(false);
  });

  it("detectLikelyUserReask compares to previous user turn", () => {
    expect(
      detectLikelyUserReask("How do I deploy this NestJS service to production safely?", [
        "hello",
        "How do I deploy this NestJS service to production"
      ])
    ).toBe(true);
  });

  it("detectClarificationFrustrationLoop needs assistant question plus correction", () => {
    expect(detectClarificationFrustrationLoop("No, I meant the backend", "Which part should we focus on first?")).toBe(true);
    expect(detectClarificationFrustrationLoop("Sounds good", "Which part should we focus on first?")).toBe(false);
  });
});

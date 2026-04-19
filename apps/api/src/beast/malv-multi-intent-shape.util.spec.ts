import {
  analyzeMalvMultiIntent,
  buildMalvMultiIntentCompactAnswerPromptSection
} from "./malv-multi-intent-shape.util";

describe("malv-multi-intent-shape.util", () => {
  it("marks compound asks joined by and", () => {
    const a = analyzeMalvMultiIntent("bitcoin update and is it good to buy");
    expect(a.multiIntent).toBe(true);
    expect(a.segments.length).toBeGreaterThanOrEqual(1);
  });

  it("marks identity + capability compound questions", () => {
    const a = analyzeMalvMultiIntent("who made you and what can you do");
    expect(a.multiIntent).toBe(true);
    const block = buildMalvMultiIntentCompactAnswerPromptSection(a);
    expect(block).toContain("Multi-part message");
    expect(block).toMatch(/Also:/i);
    expect(block!.length).toBeLessThan(900);
  });

  it("does not flag ordinary single asks", () => {
    expect(analyzeMalvMultiIntent("what is recursion").multiIntent).toBe(false);
  });
});

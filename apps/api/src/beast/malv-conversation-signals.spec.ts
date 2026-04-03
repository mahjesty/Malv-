import { analyzeUserTone, mergeExplicitMoodHint } from "./malv-conversation-signals";

describe("mergeExplicitMoodHint", () => {
  it("passes through when neutral or undefined", () => {
    const base = analyzeUserTone("hello there");
    expect(mergeExplicitMoodHint(base, undefined)).toEqual(base);
    expect(mergeExplicitMoodHint(base, "neutral").toneReasons.some((r) => r.startsWith("explicit_mood:"))).toBe(false);
  });

  it("raises urgency for explicit urgent hint", () => {
    const base = analyzeUserTone("just checking");
    const m = mergeExplicitMoodHint(base, "urgent");
    expect(m.urgency).toBe("high");
    expect(m.toneReasons.some((r) => r === "explicit_mood:urgent")).toBe(true);
  });
});

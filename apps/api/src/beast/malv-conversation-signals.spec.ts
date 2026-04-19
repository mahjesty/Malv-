import {
  analyzeUserTone,
  detectLightSocialMessage,
  detectMalvIdentityQuestion,
  mergeExplicitMoodHint
} from "./malv-conversation-signals";

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

describe("detectMalvIdentityQuestion", () => {
  it("detects direct model identity challenges", () => {
    expect(detectMalvIdentityQuestion("are you qwen?")).toBe("comparison");
    expect(detectMalvIdentityQuestion("who are you really")).toBe("who");
    expect(detectMalvIdentityQuestion("what model are you")).toBe("model");
  });

  it("detects creator/founder/company/origin questions", () => {
    expect(detectMalvIdentityQuestion("who made you")).toBe("creator");
    expect(detectMalvIdentityQuestion("who created you?")).toBe("creator");
    expect(detectMalvIdentityQuestion("who developed you")).toBe("creator");
    expect(detectMalvIdentityQuestion("who is your creator")).toBe("creator");
    expect(detectMalvIdentityQuestion("who is your founder")).toBe("founder");
    expect(detectMalvIdentityQuestion("what company built you")).toBe("company");
    expect(detectMalvIdentityQuestion("where are you from")).toBe("origin");
  });

  it("detects powering and based-on model questions", () => {
    expect(detectMalvIdentityQuestion("what powers you")).toBe("powered_by");
    expect(detectMalvIdentityQuestion("are you based on another model")).toBe("based_on");
    expect(detectMalvIdentityQuestion("are you alibaba")).toBe("comparison");
  });

  it("does not classify unrelated prompts", () => {
    expect(detectMalvIdentityQuestion("Can you compare Qwen and Llama for coding tasks?")).toBeNull();
  });

  it("detects natural identity phrasing (fuzzy layer)", () => {
    expect(detectMalvIdentityQuestion("are you chatgpt")).toBe("comparison");
    expect(detectMalvIdentityQuestion("are you chatgpt?")).toBe("comparison");
    expect(detectMalvIdentityQuestion("who built malv")).toBe("creator");
    expect(detectMalvIdentityQuestion("what is malv")).toBe("what");
    expect(detectMalvIdentityQuestion("what company made you")).toBe("company");
  });

  it("does not treat narrative 'who made you' clauses as identity", () => {
    expect(detectMalvIdentityQuestion("the story of who made you do all the work")).toBeNull();
  });
});

describe("detectLightSocialMessage", () => {
  it("treats brief acknowledgements and laugh markers as light social", () => {
    expect(detectLightSocialMessage("lol?")).toBe("amused_ack");
    expect(detectLightSocialMessage("okay")).toBe("amused_ack");
    expect(detectLightSocialMessage("got it")).toBe("amused_ack");
  });
});

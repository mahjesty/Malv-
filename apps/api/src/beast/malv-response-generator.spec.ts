import {
  buildMalvGeneratorContext,
  composeMalvUtterance,
  detectBareCasualSmallTalk,
  detectMalvIntent,
  deriveLastAssistantStyle,
  deriveUserEnergyLevel,
  generateMalvResponse
} from "./malv-response-generator";

describe("detectBareCasualSmallTalk", () => {
  it("matches only whole-message casual probes", () => {
    expect(detectBareCasualSmallTalk("what's up")).toBe(true);
    expect(detectBareCasualSmallTalk("what's up?")).toBe(true);
    expect(detectBareCasualSmallTalk("how are you")).toBe(true);
    expect(detectBareCasualSmallTalk("how's it going")).toBe(true);
  });

  it("does not match extended questions", () => {
    expect(detectBareCasualSmallTalk("what's up with the API error")).toBe(false);
    expect(detectBareCasualSmallTalk("how are you handling auth")).toBe(false);
  });
});

describe("detectMalvIntent", () => {
  it("classifies short-circuit intents", () => {
    expect(detectMalvIntent("thanks")).toBe("light_social");
    expect(detectMalvIntent("hello")).toBe("greeting");
    expect(detectMalvIntent("who are you")).toBe("identity_question");
    expect(detectMalvIntent("what's up")).toBe("casual_small_talk");
  });

  it("classifies technical and task hints", () => {
    expect(detectMalvIntent("debug this TypeScript API 500")).toBe("technical_request");
    expect(detectMalvIntent("can you help me fix the deploy")).toBe("task_request");
  });
});

describe("deriveLastAssistantStyle", () => {
  it("collects recent assistant opener prefixes", () => {
    const s = deriveLastAssistantStyle([
      { role: "user", content: "a" },
      { role: "assistant", content: "Hey there.\nMore" },
      { role: "assistant", content: "On channel. Next?" }
    ]);
    expect(s.recentOpeningPrefixes.length).toBe(2);
    expect(s.lastLengthBucket).not.toBe("none");
  });
});

describe("deriveUserEnergyLevel", () => {
  it("maps length and tone signal", () => {
    expect(deriveUserEnergyLevel("hey", "casual:simple_greeting")).toBe("short");
    expect(deriveUserEnergyLevel("x".repeat(400), "neutral:default")).toBe("long");
  });
});

describe("composeMalvUtterance", () => {
  it("joins optional parts without forcing every slot", () => {
    expect(composeMalvUtterance({ core: "On channel." })).toBe("On channel.");
    const u = composeMalvUtterance({ opener: "Hey.", core: "With you.", followup: "What's next?" });
    expect(u).toContain("Hey.");
    expect(u).toContain("What's next?");
  });
});

describe("generateMalvResponse", () => {
  const baseHistory = [{ role: "user", content: "prior" }];

  it("never emits banned helpdesk phrasing for greetings", () => {
    for (let i = 0; i < 12; i++) {
      const ctx = buildMalvGeneratorContext({
        userMessage: "hey",
        conversationHistory: baseHistory,
        conversationId: `conv-${i}`,
        userTone: "casual",
        toneReasons: ["simple_greeting"],
        isFirstThreadTurn: false,
        isGreeting: true,
        detectedIntent: "greeting"
      });
      const r = generateMalvResponse(ctx).toLowerCase();
      expect(r).not.toMatch(/how can i help/);
      expect(r).not.toMatch(/i'm here to assist/);
      expect(r).not.toMatch(/what do you need/);
      expect(r.length).toBeGreaterThan(3);
    }
  });

  it("varies identity wording across conversation seeds", () => {
    const a = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "who are you",
        conversationHistory: [],
        conversationId: "id-a",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "who"
      })
    );
    const b = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "who are you",
        conversationHistory: [],
        conversationId: "id-b",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "who"
      })
    );
    expect(a.toLowerCase()).toContain("malv");
    expect(b.toLowerCase()).toContain("malv");
    expect(a === b).toBe(false);
  });

  it("includes MALV for name and capability identity kinds", () => {
    const name = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "your name",
        conversationHistory: [],
        conversationId: "n1",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "name"
      })
    );
    expect(name).toMatch(/MALV/i);

    const cap = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "what do you do",
        conversationHistory: [],
        conversationId: "c1",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "capabilities"
      })
    );
    expect(cap.toLowerCase()).toMatch(/work|plan|debug|scope|operator|thread/);
  });

  it("keeps light social minimal", () => {
    const r = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "thanks",
        conversationHistory: baseHistory,
        conversationId: "s1",
        userTone: "casual",
        toneReasons: ["light_social"],
        isFirstThreadTurn: false,
        isGreeting: false,
        detectedIntent: "light_social",
        lightSocialKind: "thanks"
      })
    );
    expect(r.length).toBeLessThan(48);
    expect(r.toLowerCase()).not.toContain("assist you");
  });
});

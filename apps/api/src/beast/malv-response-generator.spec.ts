import { detectMalvIdentityQuestion } from "./malv-conversation-signals";
import {
  buildMalvGeneratorContext,
  composeMalvUtterance,
  detectBareCasualSmallTalk,
  detectMalvIntent,
  detectSocialSmalltalkCheckin,
  deriveLastAssistantStyle,
  deriveUserEnergyLevel,
  generateMalvResponse
} from "./malv-response-generator";

describe("detectSocialSmalltalkCheckin", () => {
  it("matches whole-message wellbeing / casual check-ins", () => {
    expect(detectSocialSmalltalkCheckin("how are you doing?")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how are you doing")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how're you?")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how're you doing?")).toBe(true);
    expect(detectSocialSmalltalkCheckin("what's up")).toBe(true);
    expect(detectSocialSmalltalkCheckin("what's up?")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how are you")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how's it going")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how you been")).toBe(true);
    expect(detectSocialSmalltalkCheckin("how you doing?")).toBe(true);
  });

  it("does not match task-bearing or extended questions", () => {
    expect(detectSocialSmalltalkCheckin("what's up with the API error")).toBe(false);
    expect(detectSocialSmalltalkCheckin("how are you handling auth")).toBe(false);
    expect(detectSocialSmalltalkCheckin("how are you doing the deploy")).toBe(false);
  });

  it("detectBareCasualSmallTalk aliases detectSocialSmalltalkCheckin", () => {
    expect(detectBareCasualSmallTalk("how are you doing?")).toBe(true);
  });
});

describe("detectMalvIntent", () => {
  it("classifies short-circuit intents", () => {
    expect(detectMalvIntent("thanks")).toBe("light_social");
    expect(detectMalvIntent("hello")).toBe("greeting");
    expect(detectMalvIntent("who are you")).toBe("identity_question");
    expect(detectMalvIntent("what's up")).toBe("social_smalltalk_checkin");
    expect(detectMalvIntent("how are you doing?")).toBe("social_smalltalk_checkin");
  });

  it("classifies technical and task hints", () => {
    expect(detectMalvIntent("debug this TypeScript API 500")).toBe("technical_request");
    expect(detectMalvIntent("can you help me fix the deploy")).toBe("task_request");
  });
});

describe("chat prompt-shape classification (identity vs social check-in)", () => {
  it("treats identity phrasing as identity_question, not social check-in", () => {
    expect(detectMalvIdentityQuestion("what are you?")).not.toBeNull();
    expect(detectMalvIdentityQuestion("what's your name?")).not.toBeNull();
    expect(detectSocialSmalltalkCheckin("what are you?")).toBe(false);
    expect(detectSocialSmalltalkCheckin("what's your name?")).toBe(false);
  });

  it("routes common wellbeing prompts through social_smalltalk_checkin", () => {
    expect(detectMalvIntent("how are you?")).toBe("social_smalltalk_checkin");
    expect(detectMalvIntent("what's up?")).toBe("social_smalltalk_checkin");
    expect(detectMalvIntent("how are you doing?")).toBe("social_smalltalk_checkin");
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

  it("keeps identity wording canonical across conversation seeds", () => {
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
    expect(a).toBe("I'm MALV.");
    expect(b).toBe("I'm MALV.");
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
    expect(cap.toLowerCase()).toContain("malv");
  });

  it("uses canonical model/power/comparison identity wording", () => {
    const model = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "what model are you",
        conversationHistory: [],
        conversationId: "m1",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "model"
      })
    );
    expect(model).toContain("MALV");
    expect(model.toLowerCase()).toContain("underlying intelligence");

    const powered = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "what powers you",
        conversationHistory: [],
        conversationId: "p1",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "powered_by"
      })
    );
    expect(powered.toLowerCase()).toContain("malv stack");

    const comparison = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "are you qwen",
        conversationHistory: [],
        conversationId: "cmp1",
        userTone: "identity_query",
        toneReasons: ["identity_question"],
        isFirstThreadTurn: true,
        isGreeting: false,
        detectedIntent: "identity_question",
        identityKind: "comparison"
      })
    );
    expect(comparison).toContain("I'm MALV");
    expect(comparison.toLowerCase()).not.toContain("i am qwen");
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

  it("handles social_smalltalk_checkin with a short operator-native reply", () => {
    const r = generateMalvResponse(
      buildMalvGeneratorContext({
        userMessage: "how are you doing?",
        conversationHistory: baseHistory,
        conversationId: "chk-1",
        userTone: "casual",
        toneReasons: ["default"],
        isFirstThreadTurn: false,
        isGreeting: false,
        detectedIntent: "social_smalltalk_checkin"
      })
    );
    expect(r.length).toBeGreaterThan(4);
    expect(r.toLowerCase()).not.toMatch(/how can i help/);
  });
});

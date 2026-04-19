import { buildDeterministicTemplateShortCircuit } from "./beast-template-short-circuit.util";

describe("buildDeterministicTemplateShortCircuit", () => {
  it("returns a non-empty greeting reply with stable source", () => {
    const out = buildDeterministicTemplateShortCircuit({
      reflexKind: { kind: "greeting" },
      userMessage: "hi",
      priorMessages: [],
      priorAssistantTexts: [],
      conversationId: "conv-test",
      toneAnalysis: {
        userTone: "neutral",
        urgency: "low",
        depthPreference: "balanced",
        emotionalSensitivity: "low",
        toneReasons: []
      },
      isFirstThreadTurn: true
    });
    expect(out.reply.trim().length).toBeGreaterThan(0);
    expect(out.malvReplySource).toBe("malv_greeting_short_circuit");
  });

  it("uses canonical identity policy in reflex identity replies", () => {
    const out = buildDeterministicTemplateShortCircuit({
      reflexKind: { kind: "identity", identityKind: "creator" },
      userMessage: "who made you",
      priorMessages: [],
      priorAssistantTexts: [],
      conversationId: "conv-identity",
      toneAnalysis: {
        userTone: "identity_query",
        urgency: "low",
        depthPreference: "direct",
        emotionalSensitivity: "low",
        toneReasons: ["identity_question"]
      },
      isFirstThreadTurn: true
    });
    expect(out.reply).toContain("MALV");
    expect(out.reply.toLowerCase()).toContain("malv system");
    expect(out.malvReplySource).toBe("malv_identity_short_circuit");
  });
});

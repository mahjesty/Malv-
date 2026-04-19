import { classifyMalvReflexTurn } from "./malv-reflex-turn.util";

describe("classifyMalvReflexTurn", () => {
  const baseGates = {
    superFix: false,
    vaultSessionId: null as string | null,
    operatorPhase: null as string | null,
    exploreHandoffJson: null as string | null,
    modeType: "analyze" as const,
    inputMode: "text" as const
  };

  it("classifies thanks as light_social", () => {
    const r = classifyMalvReflexTurn("thanks!", baseGates);
    expect(r?.kind).toBe("light_social");
  });

  it("classifies lol? as light_social reflex", () => {
    const r = classifyMalvReflexTurn("lol?", baseGates);
    expect(r).toEqual({ kind: "light_social", lightSocialKind: "amused_ack" });
  });

  it("classifies short greeting", () => {
    const r = classifyMalvReflexTurn("hey", baseGates);
    expect(r?.kind).toBe("greeting");
  });

  it("returns null for vault-scoped turns", () => {
    const r = classifyMalvReflexTurn("hey", { ...baseGates, vaultSessionId: "vs-1" });
    expect(r).toBeNull();
  });

  it("returns null for execute-biased mode", () => {
    const r = classifyMalvReflexTurn("hi", { ...baseGates, modeType: "execute" });
    expect(r).toBeNull();
  });

  it("returns null for long messages", () => {
    const r = classifyMalvReflexTurn("a".repeat(240), baseGates);
    expect(r).toBeNull();
  });

  it("routes direct identity prompts to identity reflex", () => {
    expect(classifyMalvReflexTurn("are you qwen?", baseGates)).toEqual({
      kind: "identity",
      identityKind: "comparison"
    });
    expect(classifyMalvReflexTurn("who made you", baseGates)).toEqual({ kind: "identity", identityKind: "creator" });
    expect(classifyMalvReflexTurn("who are you really", baseGates)).toEqual({
      kind: "identity",
      identityKind: "who"
    });
    expect(classifyMalvReflexTurn("what powers you", baseGates)).toEqual({
      kind: "identity",
      identityKind: "powered_by"
    });
  });

  it("does not route unrelated prompts to identity reflex", () => {
    expect(classifyMalvReflexTurn("Compare Qwen and Llama tokenizers.", baseGates)).toBeNull();
  });

  it("returns null when explore handoff JSON is present", () => {
    expect(classifyMalvReflexTurn("hi", { ...baseGates, exploreHandoffJson: "{}" })).toBeNull();
  });

  it("returns null when operator phase is set", () => {
    expect(classifyMalvReflexTurn("hi", { ...baseGates, operatorPhase: "build" })).toBeNull();
  });

  it("returns null for super-fix turns even if text looks social", () => {
    expect(classifyMalvReflexTurn("thanks!", { ...baseGates, superFix: true })).toBeNull();
  });
});

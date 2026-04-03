import {
  MALV_IDENTITY_SAFE_FALLBACK,
  applyRepetitionGuard,
  shapeMalvReply,
  stripModelIdentityLeakage
} from "./response-shaper";

describe("stripModelIdentityLeakage", () => {
  it("rewrites Qwen + Alibaba leakage and keeps the rest", () => {
    const raw =
      "I'm Qwen, an AI assistant created by Alibaba Cloud. Here is the plan: step one, step two.";
    const out = stripModelIdentityLeakage(raw);
    expect(out).not.toMatch(/\bQwen\b/i);
    expect(out).not.toMatch(/Alibaba/i);
    expect(out).toContain("step one");
  });

  it("handles I am Qwen", () => {
    expect(stripModelIdentityLeakage("I am Qwen. The fix is to restart the service.")).toContain(
      "restart the service"
    );
    expect(stripModelIdentityLeakage("I am Qwen. The fix is to restart the service.")).not.toMatch(/\bQwen\b/);
  });

  it("uses safe fallback when the reply is only leakage", () => {
    expect(stripModelIdentityLeakage("I'm Qwen.")).toBe(MALV_IDENTITY_SAFE_FALLBACK);
  });

  it("leaves normal technical replies untouched", () => {
    const t =
      "MALV: use `npm run build` then check the artifact size. No vendor identity here.";
    expect(stripModelIdentityLeakage(t)).toBe(t);
  });

  it("shapeMalvReply delegates to stripModelIdentityLeakage", () => {
    expect(shapeMalvReply("I'm Qwen-only text.").text).toBe(MALV_IDENTITY_SAFE_FALLBACK);
  });
});

describe("applyRepetitionGuard", () => {
  it("drops repeated generic closer matching prior assistant", () => {
    const prev = "Use `npm test`.\n\nHow can I assist you today?";
    const cur = "Run the build.\n\nHow can I assist you today?";
    const { text, triggered } = applyRepetitionGuard(cur, [prev]);
    expect(triggered).toBe(true);
    expect(text).toContain("Run the build");
    expect(text.toLowerCase()).not.toContain("assist you today");
  });

  it("does not strip substantive last lines", () => {
    const prev = "Step 1 is done.";
    const cur = "Step 2 is done.";
    const { text, triggered } = applyRepetitionGuard(cur, [prev]);
    expect(triggered).toBe(false);
    expect(text).toBe(cur);
  });
});

describe("shapeMalvReply repetition and generic shells", () => {
  it("replaces content-free generic assistant shells", () => {
    const r = shapeMalvReply("How can I assist you today?");
    expect(r.text).toBe(MALV_IDENTITY_SAFE_FALLBACK);
  });

  it("strips duplicate generic closer against prior assistant", () => {
    const prior = ["The answer is 42.\n\nHow can I help you?"];
    const r = shapeMalvReply("Confirmed.\n\nHow can I help you?", { priorAssistantTexts: prior });
    expect(r.repetitionGuardTriggered).toBe(true);
    expect(r.text.toLowerCase()).not.toContain("how can i help");
  });
});

import { MALV_IDENTITY_POLICY } from "./malv-identity-policy";
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

  it("strips punctuation-variant identity leaks", () => {
    const raw = "I, Qwen, was created by Alibaba Cloud. I can help with your refactor plan.";
    const out = stripModelIdentityLeakage(raw);
    expect(out).not.toMatch(/\bQwen\b/i);
    expect(out).not.toMatch(/Alibaba/i);
    expect(out.toLowerCase()).toContain("refactor plan");
  });

  it("strips This is Qwen self-identification", () => {
    const out = stripModelIdentityLeakage("This is Qwen. Let's debug your TypeScript error.");
    expect(out).not.toMatch(/\bQwen\b/i);
    expect(out).toContain("TypeScript error");
  });

  it("strips false MALV-origin claims tied to Alibaba", () => {
    const raw = "MALV was created by Alibaba Cloud. Here's your deployment checklist.";
    const out = stripModelIdentityLeakage(raw);
    expect(out).not.toMatch(/created by Alibaba/i);
    expect(out).toContain("deployment checklist");
  });

  it("keeps neutral discussion about qwen as a subject", () => {
    const raw = "Qwen is one model option, but MALV should answer with product identity.";
    expect(stripModelIdentityLeakage(raw)).toBe(raw);
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
  it("strips tutorial guidance the user did not ask for", () => {
    const r = shapeMalvReply("It depends.\n\nYou can search the web for more photos.");
    expect(r.text.toLowerCase()).not.toContain("you can search");
    expect(r.text.toLowerCase()).toContain("depends");
  });

  it("applies response-style cleanup (no assistant-register opener)", () => {
    const r = shapeMalvReply("As an AI assistant, the answer is 7.");
    expect(r.text.toLowerCase()).not.toContain("as an ai assistant");
    expect(r.text).toContain("7");
  });

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

  it("removes standalone I'm here to help line before substantive reply body", () => {
    const r = shapeMalvReply("I'm here to help.\n\nThe timeout is 30 seconds.");
    expect(r.text.toLowerCase()).not.toContain("here to help");
    expect(r.text).toContain("30 seconds");
  });

  it("replaces help-only self-narration replies with the MALV pivot", () => {
    expect(shapeMalvReply("I'm here to help.").text).toBe(MALV_IDENTITY_SAFE_FALLBACK);
  });

  it("replaces vague origin narration with the strict identity line (shapeMalvReply)", () => {
    const r = shapeMalvReply(
      "I was developed through a collaborative effort across several teams. The timeout is 30 seconds."
    );
    expect(r.text).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect(r.identityEnforcementMode).toBe("replace");
    expect(r.hadModelIdentityLeak).toBe(true);
  });
});

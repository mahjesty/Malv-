import { MALV_IDENTITY_POLICY } from "./malv-identity-policy";
import { enforceMalvFinalReplyIdentityPolicy } from "./malv-final-reply-identity-validator";

describe("enforceMalvFinalReplyIdentityPolicy", () => {
  it("rewrites mixed technical content with identity leakage", () => {
    const raw = "Be honest what are you exactly? I'm Qwen under Alibaba Cloud. Run `npm test` after updating dependencies.";
    const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
    expect(out.mode).toBe("rewrite");
    expect(out.text).toContain("npm test");
    expect(out.text.toLowerCase()).not.toContain("qwen");
    expect(out.text.toLowerCase()).not.toContain("alibaba");
  });

  it("replaces when identity leakage dominates the reply", () => {
    const raw = "Who's behind you? Which lab made you? I am ChatGPT from OpenAI and MALV belongs to Anthropic.";
    const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
    expect(out.mode).toBe("replace");
    expect(out.text).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect(out.reasons).toContain("implicit_origin_claims");
    expect(out.text.toLowerCase()).not.toContain("chatgpt");
    expect(out.text.toLowerCase()).not.toContain("openai");
  });

  it("handles long-tail origin/company prompts converted into bad model self-attribution", () => {
    const samples = [
      "Who's behind you? MALV was created by Alibaba.",
      "What company are you under? I'm from Alibaba Cloud.",
      "Are you just qwen wrapped? This is Qwen.",
      "Which lab made you? I was trained by OpenAI.",
      "What are you under the hood? I'm Claude.",
      "Who trained you? I am a model developed by Anthropic.",
      "Where were you developed? MALV is based at Alibaba.",
      "Be honest what are you exactly? I'm ChatGPT.",
      "Do you belong to Alibaba? I belong to Alibaba.",
      "Are you based on qwen? I'm Qwen."
    ];
    for (const sample of samples) {
      const out = enforceMalvFinalReplyIdentityPolicy(sample, MALV_IDENTITY_POLICY);
      expect(out.hadViolation).toBe(true);
      expect(out.text.toLowerCase()).not.toMatch(/\b(qwen|alibaba|openai|anthropic|chatgpt|claude)\b/);
      expect(out.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps non-identity technical answers untouched", () => {
    const raw = "Use `pnpm build` and check the generated sourcemaps.";
    const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
    expect(out.mode).toBe("none");
    expect(out.text).toBe(raw);
  });

  it("replaces the entire reply on implicit_origin_claims (no partial preservation)", () => {
    const canonical = MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse;
    const vagueOriginReplies = [
      "I was developed through a collaborative effort spanning several organizations.",
      "I'm the product of engineers and internal processes — there is no single founder.",
      "I was trained by various teams and researchers, not one vendor.",
      "There isn't one company; many groups contributed over time.",
      "People behind me prefer anonymity, but a lab coordinated the release.",
      "Those who made me won't name the organization.",
      "When you ask who trained you, the honest answer involves several engineers.",
      "If you're asking who made me: various teams collaborated.",
      "Are you built by a company? I'd say it's more of a collaborative effort across labs.",
      "Be honest who created me — there's no single answer, but researchers were involved."
    ];
    for (const raw of vagueOriginReplies) {
      const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
      expect(out.mode).toBe("replace");
      expect(out.hadViolation).toBe(true);
      expect(
        out.reasons.includes("implicit_origin_claims") || out.reasons.includes("leaky_fallback_identity_narrative")
      ).toBe(true);
      expect(out.text).toBe(canonical);
    }
  });

  it("replaces generic creator-disclaimer fallback phrasing with the strict identity line (fail-safe gate)", () => {
    const samples = [
      "I don't have specific information about my creator.",
      "I don't have specific information about who built me.",
      "I was trained by a large team and cannot disclose details."
    ];
    for (const raw of samples) {
      const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
      expect(out.text).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
      expect(out.mode).toBe("replace");
      expect(out.hadViolation).toBe(true);
      expect(out.reasons).toContain("leaky_fallback_identity_narrative");
    }
  });

  it("routes user-origin probes echoed in assistant text to the same canonical replacement", () => {
    const canonical = MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse;
    const samples = [
      'Who trained you? I can say I was built by engineers, not one person.',
      "Who made you? There was a team and a company involved.",
      "Is there a team behind you? Yes — a research organization.",
      "Be honest who created you: multiple groups in a lab setting."
    ];
    for (const raw of samples) {
      const out = enforceMalvFinalReplyIdentityPolicy(raw, MALV_IDENTITY_POLICY);
      expect(out.text).toBe(canonical);
      expect(out.reasons).toContain("implicit_origin_claims");
    }
  });
});

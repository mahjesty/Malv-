import { computeAdaptiveMaxTokens } from "./malv-adaptive-max-tokens.util";

function legacyDefaultFormula(args: { userMessage: string; conversationLength: number; routeType?: string }): number {
  const message = args.userMessage.trim();
  const messageChars = message.length;
  const lineCount = message ? message.split(/\r?\n/).length : 0;
  const route = (args.routeType ?? "").trim().toLowerCase();
  const routeBonus = route.includes("phased")
    ? 384
    : route.includes("execute") || route.includes("operator")
      ? 320
      : route.includes("analysis") || route.includes("plan")
        ? 256
        : route.includes("clarification") || route.includes("social") || route.includes("smalltalk")
          ? -192
          : 0;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const conversationBonus = clamp(args.conversationLength * 28, 0, 280);
  const messageSizeBonus = clamp(Math.floor(messageChars / 3), 0, 420);
  const multilineBonus = lineCount >= 6 ? 140 : lineCount >= 3 ? 80 : 0;
  const structuredAskBonus = /\b(json|yaml|table|schema|steps|checklist|plan|migration|refactor|architecture|debug|implement)\b/i.test(
    message
  )
    ? 220
    : 0;
  const explicitBrevityPenalty = /\bbrief|short|concise|one sentence|tl;dr\b/i.test(message) ? -120 : 0;
  const candidate =
    640 +
    conversationBonus +
    messageSizeBonus +
    multilineBonus +
    structuredAskBonus +
    routeBonus +
    explicitBrevityPenalty;
  return clamp(candidate, 320, 2048);
}

describe("computeAdaptiveMaxTokens", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MALV_CHAT_MAXTOKENS_MIN;
    delete process.env.MALV_CHAT_MAXTOKENS_BASE;
    delete process.env.MALV_CHAT_MAXTOKENS_MAX;
    delete process.env.MALV_CHAT_MAXTOKENS_STRUCTURED_BOOST;
    delete process.env.MALV_CHAT_MAXTOKENS_CONVERSATION_BOOST;
    delete process.env.MALV_CHAT_MAXTOKENS_BREVITY_PENALTY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns a bounded minimum for terse chat turns", () => {
    const out = computeAdaptiveMaxTokens({
      userMessage: "hi",
      conversationLength: 0,
      routeType: "chat"
    });
    expect(out).toBeGreaterThanOrEqual(320);
  });

  it("increases budget for complex phased requests", () => {
    const out = computeAdaptiveMaxTokens({
      userMessage:
        "Please provide a step-by-step architecture plan and implementation checklist with JSON schema output.",
      conversationLength: 12,
      routeType: "phased_execute"
    });
    expect(out).toBeGreaterThan(1000);
    expect(out).toBeLessThanOrEqual(2048);
  });

  it("penalizes explicit brevity requests", () => {
    const short = computeAdaptiveMaxTokens({
      userMessage: "Brief answer only. One sentence.",
      conversationLength: 4,
      routeType: "chat"
    });
    const normal = computeAdaptiveMaxTokens({
      userMessage: "Explain this in detail.",
      conversationLength: 4,
      routeType: "chat"
    });
    expect(short).toBeLessThan(normal);
  });

  it("preserves current defaults when env is absent", () => {
    const input = {
      userMessage: "Please provide steps and JSON schema for this migration.",
      conversationLength: 10,
      routeType: "phased_execute"
    };
    const out = computeAdaptiveMaxTokens(input);
    expect(out).toBe(legacyDefaultFormula(input));
  });

  it("applies env overrides for min/base/max and boost knobs", () => {
    process.env.MALV_CHAT_MAXTOKENS_MIN = "500";
    process.env.MALV_CHAT_MAXTOKENS_BASE = "700";
    process.env.MALV_CHAT_MAXTOKENS_MAX = "1600";
    process.env.MALV_CHAT_MAXTOKENS_STRUCTURED_BOOST = "300";
    process.env.MALV_CHAT_MAXTOKENS_CONVERSATION_BOOST = "10";
    process.env.MALV_CHAT_MAXTOKENS_BREVITY_PENALTY = "50";

    const out = computeAdaptiveMaxTokens({
      userMessage: "Brief answer. JSON schema only.",
      conversationLength: 8,
      routeType: "chat"
    });
    expect(out).toBeGreaterThanOrEqual(500);
    expect(out).toBeLessThanOrEqual(1600);
  });

  it("clamps invalid env ordering safely (max < base < min)", () => {
    process.env.MALV_CHAT_MAXTOKENS_MIN = "1200";
    process.env.MALV_CHAT_MAXTOKENS_BASE = "600";
    process.env.MALV_CHAT_MAXTOKENS_MAX = "400";

    const out = computeAdaptiveMaxTokens({
      userMessage: "hi",
      conversationLength: 0,
      routeType: "chat"
    });
    // base is clamped up to min, and max is clamped to be >= min.
    expect(out).toBe(1200);
  });

  it("enforces hard upper safety bound under misconfiguration", () => {
    process.env.MALV_CHAT_MAXTOKENS_MIN = "100000";
    process.env.MALV_CHAT_MAXTOKENS_BASE = "100000";
    process.env.MALV_CHAT_MAXTOKENS_MAX = "100000";

    const out = computeAdaptiveMaxTokens({
      userMessage: "Need an architecture plan and checklist.",
      conversationLength: 100,
      routeType: "phased_execute"
    });
    expect(out).toBeLessThanOrEqual(4096);
  });
});

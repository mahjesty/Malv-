import { applyMalvResponseStyle } from "./malv-response-style.util";

describe("applyMalvResponseStyle", () => {
  it("strips leading As an AI assistant disclaimer without dropping the answer", () => {
    const before = "As an AI assistant, I can explain: use port 8080 for the dev server.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("as an ai assistant");
    expect(after).toContain("8080");
    expect(after).toMatch(/^I can explain/i);
  });

  it("removes hollow Sure / happy-to-help opener before substance", () => {
    const before = "Sure! I'd be happy to help. The fix is to restart the worker process.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("happy to help");
    expect(after).toContain("restart the worker");
  });

  it("drops a greeting-only first line when substantive content follows", () => {
    const before = "Hello!\n\nThe endpoint returns 401 when the token is expired.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("hello");
    expect(after).toContain("401");
  });

  it("removes assistant disclaimer after paragraph break", () => {
    const before = "Use `pnpm install`.\n\nAs an AI language model, I recommend pinning the lockfile.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toMatch(/as an ai language model/);
    expect(after).toContain("pnpm install");
    expect(after).toContain("pinning");
  });

  it("does not strip technical prose that mentions AI assistant in context", () => {
    const t =
      "When designing an AI assistant, separate tool calls from user-visible text. Use a queue for reliability.";
    expect(applyMalvResponseStyle(t)).toBe(t);
  });

  it("preserves meaning for multi-step instructions", () => {
    const before = `Steps:
1. Run migrations.
2. Verify the schema.

As an AI assistant, I should note: backup first.`;
    const after = applyMalvResponseStyle(before);
    expect(after).toContain("Run migrations");
    expect(after).toContain("backup first");
    expect(after.toLowerCase()).not.toContain("as an ai assistant");
  });

  it("preserves meaningful agreement (lowercase follow-up after Sure,)", () => {
    const t = "Sure, that's the right call — ship it.";
    expect(applyMalvResponseStyle(t)).toBe(t);
  });

  it("strips hollow Absolutely / Of course before a capitalized clause", () => {
    expect(applyMalvResponseStyle("Absolutely! The deadline is Friday.")).toBe("The deadline is Friday.");
    expect(applyMalvResponseStyle("Of course! Use HTTPS in production.")).toBe("Use HTTPS in production.");
  });

  it("strips generic overview / update openers before substance", () => {
    const before = "Here is an overview: the API returns 429 when rate limits trip.\n\nBackoff with jitter.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("here is an overview");
    expect(after).toContain("429");
  });

  it("drops Hi there! as a standalone greeting line", () => {
    const before = "Hi there!\n\nThe config key is `MALV_API_URL`.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("hi there");
    expect(after).toContain("MALV_API_URL");
  });

  it("strips leading In summary, when followed by substance", () => {
    const before = "In summary, Migrate first, then cut traffic.";
    expect(applyMalvResponseStyle(before)).toBe("Migrate first, then cut traffic.");
  });

  it("drops a standalone I'm here to help first line when substance follows", () => {
    const before = "I'm here to help.\n\nPin the dependency to 3.2.1.";
    const after = applyMalvResponseStyle(before);
    expect(after.toLowerCase()).not.toContain("here to help");
    expect(after).toContain("3.2.1");
  });

  it("collapses a help-only self-narration line to empty (callers may substitute a pivot)", () => {
    expect(applyMalvResponseStyle("I'm here to help.")).toBe("");
  });
});

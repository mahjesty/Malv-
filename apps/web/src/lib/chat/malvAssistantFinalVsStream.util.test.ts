import { describe, expect, it } from "vitest";
import { shouldPreferAssistantFinalContent } from "./malvAssistantFinalVsStream.util";

describe("shouldPreferAssistantFinalContent", () => {
  it("prefers longer final when streamed text is a strict prefix", () => {
    expect(
      shouldPreferAssistantFinalContent({
        streamedTrim: "abc",
        finalTrim: "abc def",
        streamedRaw: "abc",
        finalRaw: "abc def"
      })
    ).toBe(true);
  });

  it("rejects clearly divergent bodies", () => {
    expect(
      shouldPreferAssistantFinalContent({
        streamedTrim: "stream version",
        finalTrim: "totally different",
        streamedRaw: "stream version",
        finalRaw: "totally different"
      })
    ).toBe(false);
  });

  it("rejects when final is shorter", () => {
    expect(
      shouldPreferAssistantFinalContent({
        streamedTrim: "longer stream body",
        finalTrim: "short",
        streamedRaw: "longer stream body",
        finalRaw: "short"
      })
    ).toBe(false);
  });

  it("allows structural fence completion at same trimmed length", () => {
    expect(
      shouldPreferAssistantFinalContent({
        streamedTrim: "see below",
        finalTrim: "see below",
        streamedRaw: "see below\n```ts\nlet x=1;",
        finalRaw: "see below\n```ts\nlet x=1;\n```"
      })
    ).toBe(true);
  });

  it("prefers final when stream ends with ellipsis tail and final completes", () => {
    expect(
      shouldPreferAssistantFinalContent({
        streamedTrim: "Working on it ...",
        finalTrim: "Working on it ... Done.",
        streamedRaw: "Working on it ...",
        finalRaw: "Working on it ... Done."
      })
    ).toBe(true);
  });
});

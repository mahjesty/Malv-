import { describe, expect, it } from "vitest";
import {
  appendAssistantStreamCanonical,
  applyLowerUpperWordBreaksOutsideFences,
  computeStreamJoinGap,
  isBaseInsideStreamingCodeFence,
  isBaseInsideStreamingUrlTail,
  shouldInsertStreamGapBetweenChunks
} from "./malvAssistantStreamCanonical";

describe("computeStreamJoinGap", () => {
  it('joins "This" + "will" with a space', () => {
    expect(computeStreamJoinGap("This", "will")).toBe(" ");
  });

  it('joins "setting" + "up" with a space (tiny whole-delta word)', () => {
    expect(computeStreamJoinGap("setting", "up")).toBe(" ");
  });

  it('joins "end." + "Next" with a space', () => {
    expect(computeStreamJoinGap("end.", "Next")).toBe(" ");
  });

  it('does not insert before comma after a word ("minikube" + ",")', () => {
    expect(computeStreamJoinGap("minikube", ",")).toBe("");
  });

  it("does not create double spaces when base already ends with space", () => {
    expect(computeStreamJoinGap("Hello ", "world")).toBe("");
  });

  it("does not create double spaces when delta already has leading space", () => {
    expect(computeStreamJoinGap("Hello", " world")).toBe("");
  });

  it('preserves intentional "he" + "llo" join (no space)', () => {
    expect(computeStreamJoinGap("he", "llo")).toBe("");
  });

  it("does not split digit runs (12 + 34)", () => {
    expect(computeStreamJoinGap("12", "34")).toBe("");
  });

  it('keeps "3." + "14" as decimal-like join', () => {
    expect(computeStreamJoinGap("3.", "14")).toBe("");
  });

  it("inserts between digit and uppercase (300 + MHz)", () => {
    expect(computeStreamJoinGap("300", "MHz")).toBe(" ");
  });

  it("does not insert between digit and lowercase (300 + mhz)", () => {
    expect(computeStreamJoinGap("300", "mhz")).toBe("");
  });

  it("does not insert gaps inside URL tail", () => {
    expect(computeStreamJoinGap("https://example.com/foo", "bar")).toBe("");
  });

  it("does not insert gaps when base is inside an open fenced code block", () => {
    const base = "```js\nconst x=1\nconst ";
    expect(isBaseInsideStreamingCodeFence(base)).toBe(true);
    expect(computeStreamJoinGap(base, "y")).toBe("");
  });
});

describe("appendAssistantStreamCanonical", () => {
  it("uses row fallback when ref is null", () => {
    expect(appendAssistantStreamCanonical(null, "a", "", "hi")).toEqual({ messageId: "a", text: "hi" });
  });

  it("accumulates on the same message id", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "he");
    const s2 = appendAssistantStreamCanonical(s1, "a", "ignored", "llo");
    expect(s2).toEqual({ messageId: "a", text: "hello" });
  });

  it("inserts a space between title-case word chunks", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "Hello");
    const s2 = appendAssistantStreamCanonical(s1, "a", "ignored", "World");
    expect(s2).toEqual({ messageId: "a", text: "Hello World" });
  });

  it("chains lower+lower gaps for multi-chunk words", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "This");
    const s2 = appendAssistantStreamCanonical(s1, "a", "", "will");
    const s3 = appendAssistantStreamCanonical(s2, "a", "", "include");
    expect(s3.text).toBe("This will include");
  });

  it("applies lower-upper breaks outside fences after append", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "the");
    const s2 = appendAssistantStreamCanonical(s1, "a", "", "Process");
    expect(s2.text).toBe("the Process");
  });

  it("does not split lower-upper inside fenced code", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "```js\nget");
    const s2 = appendAssistantStreamCanonical(s1, "a", "", "Value");
    expect(s2.text).toBe("```js\ngetValue");
  });

  it("resets base when message id changes", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "", "x");
    const s2 = appendAssistantStreamCanonical(s1, "b", "fresh", "y");
    expect(s2).toEqual({ messageId: "b", text: "freshy" });
  });

  it("ignores empty delta", () => {
    const s1 = appendAssistantStreamCanonical(null, "a", "base", "");
    expect(s1).toEqual({ messageId: "a", text: "base" });
  });
});

describe("applyLowerUpperWordBreaksOutsideFences", () => {
  it("inserts spaces at a-z A-Z boundaries outside fences", () => {
    expect(applyLowerUpperWordBreaksOutsideFences("theProcess")).toBe("the Process");
  });

  it("leaves fenced segments unchanged", () => {
    expect(applyLowerUpperWordBreaksOutsideFences("```js\ngetValue\n```")).toBe("```js\ngetValue\n```");
  });
});

describe("shouldInsertStreamGapBetweenChunks (compat)", () => {
  it("mirrors computeStreamJoinGap === space", () => {
    expect(shouldInsertStreamGapBetweenChunks("Hello", "World")).toBe(true);
    expect(shouldInsertStreamGapBetweenChunks("he", "llo")).toBe(false);
  });
});

describe("isBaseInsideStreamingUrlTail", () => {
  it("detects trailing https URL without whitespace", () => {
    expect(isBaseInsideStreamingUrlTail("see https://a.com/x")).toBe(true);
  });

  it("returns false when URL is closed by whitespace", () => {
    expect(isBaseInsideStreamingUrlTail("see https://a.com/x ")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyStreamingAssistantLine,
  sanitizeStreamingAssistantProseForIncompleteMarkup,
  splitStreamingAssistantFenceSegments
} from "./malvStreamingAssistantPresent";

describe("classifyStreamingAssistantLine", () => {
  it("turns ATX headings into title-only heading rows", () => {
    expect(classifyStreamingAssistantLine("### Section title")).toEqual({
      kind: "heading",
      level: 3,
      title: "Section title"
    });
  });

  it("supports ATX titles immediately after hashes (no space)", () => {
    expect(classifyStreamingAssistantLine("###Step 1")).toEqual({
      kind: "heading",
      level: 3,
      title: "Step 1"
    });
  });

  it("treats incomplete heading-only lines as empty plain (no raw hash flash)", () => {
    expect(classifyStreamingAssistantLine("###")).toEqual({ kind: "plain", text: "" });
    expect(classifyStreamingAssistantLine("  ##  ")).toEqual({ kind: "plain", text: "" });
  });

  it("strips markdown bullet markers into list_item rows", () => {
    expect(classifyStreamingAssistantLine("- First item")).toEqual({ kind: "list_item", text: "First item" });
    expect(classifyStreamingAssistantLine("  * Second")).toEqual({ kind: "list_item", text: "Second" });
    expect(classifyStreamingAssistantLine("+ Third")).toEqual({ kind: "list_item", text: "Third" });
  });

  it("strips ordered-list markers", () => {
    expect(classifyStreamingAssistantLine("1. First")).toEqual({ kind: "ordered_item", index: 1, text: "First" });
    expect(classifyStreamingAssistantLine("  2) Second")).toEqual({ kind: "ordered_item", index: 2, text: "Second" });
  });

  it("detects thematic breaks without raw markers as prose", () => {
    expect(classifyStreamingAssistantLine("---")).toEqual({ kind: "divider" });
    expect(classifyStreamingAssistantLine("***")).toEqual({ kind: "divider" });
  });

  it("leaves non-structured lines as plain", () => {
    expect(classifyStreamingAssistantLine("Normal prose **bold** half")).toEqual({
      kind: "plain",
      text: "Normal prose **bold** half"
    });
    expect(classifyStreamingAssistantLine("-not a list")).toEqual({ kind: "plain", text: "-not a list" });
  });

  it("collapses incomplete list marker lines (no raw dash/number flash)", () => {
    expect(classifyStreamingAssistantLine("- ")).toEqual({ kind: "plain", text: "" });
    expect(classifyStreamingAssistantLine("*")).toEqual({ kind: "plain", text: "" });
    expect(classifyStreamingAssistantLine("1. ")).toEqual({ kind: "plain", text: "" });
    expect(classifyStreamingAssistantLine("  2)  ")).toEqual({ kind: "plain", text: "" });
  });
});

describe("sanitizeStreamingAssistantProseForIncompleteMarkup", () => {
  it("strips a trailing unmatched ** opener", () => {
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Hello **")).toBe("Hello ");
  });

  it("does not strip closed bold", () => {
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Hello **you**")).toBe("Hello **you**");
  });

  it("only sanitizes the final line so earlier paragraphs keep literal **", () => {
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Done **pair**\nNext **")).toBe("Done **pair**\nNext ");
  });

  it("strips trailing unmatched inline-code and single-emphasis markers on last line", () => {
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Use `npm run` and then `")).toBe(
      "Use `npm run` and then "
    );
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Almost done *")).toBe("Almost done ");
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Almost done _")).toBe("Almost done ");
  });

  it("does not mutate matched inline code markers", () => {
    expect(sanitizeStreamingAssistantProseForIncompleteMarkup("Use `npm run` now")).toBe("Use `npm run` now");
  });
});

describe("splitStreamingAssistantFenceSegments", () => {
  it("alternates prose and code on triple-backtick boundaries", () => {
    const segs = splitStreamingAssistantFenceSegments("Intro\n```\nconst x = 1\n```\nOutro");
    expect(segs).toEqual([
      { kind: "prose", text: "Intro\n" },
      { kind: "code", text: "\nconst x = 1\n" },
      { kind: "prose", text: "\nOutro" }
    ]);
  });

  it("returns a single prose segment when no fences", () => {
    expect(splitStreamingAssistantFenceSegments("Just prose")).toEqual([{ kind: "prose", text: "Just prose" }]);
  });
});

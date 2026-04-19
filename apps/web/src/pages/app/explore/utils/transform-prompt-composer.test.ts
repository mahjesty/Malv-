import { describe, expect, it } from "vitest";
import type { ImageModeCard } from "../components/image-generator/constants";
import { composeTransformPrompt } from "./transform-prompt-composer";

function transformMode(id: string, promptTemplate: string): Pick<ImageModeCard, "id" | "category" | "promptTemplate"> {
  return { id, promptTemplate, category: "transform" };
}

describe("composeTransformPrompt", () => {
  it("uses promptTemplate plus cohesion suffix for transform modes", () => {
    const out = composeTransformPrompt({
      mode: transformMode("crayon-illustration", "Internal crayon directive."),
      userText: null
    });
    expect(out).toContain("Internal crayon directive.");
    expect(out).toContain("Keep the image cohesive, intentional, and visually resolved.");
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(2);
  });

  it("appends optional user text before cohesion suffix for transforms", () => {
    const out = composeTransformPrompt({
      mode: transformMode("cloud-sculpture-transform", "Cloud base."),
      userText: "Slightly cooler palette."
    });
    expect(out).toContain("Cloud base.");
    expect(out).toContain("Slightly cooler palette.");
    expect(out.indexOf("Slightly cooler")).toBeLessThan(out.indexOf("Keep the image cohesive"));
  });

  it("returns prompt template only for prompt category when no user text", () => {
    const card: Pick<ImageModeCard, "id" | "promptTemplate" | "category"> = {
      id: "neon-cyberpunk-city",
      promptTemplate: "A neon city at night.",
      category: "prompt"
    };
    expect(composeTransformPrompt({ mode: card })).toBe("A neon city at night.");
  });

  it("folds user text into prompt modes", () => {
    const card: Pick<ImageModeCard, "id" | "promptTemplate" | "category"> = {
      id: "x",
      promptTemplate: "Base brief.",
      category: "prompt"
    };
    expect(composeTransformPrompt({ mode: card, userText: "More rain." })).toBe("Base brief.\n\nMore rain.");
  });

  it("returns empty string when template is blank", () => {
    expect(
      composeTransformPrompt({
        mode: transformMode("z", "   "),
        userText: null
      })
    ).toBe("");
  });
});

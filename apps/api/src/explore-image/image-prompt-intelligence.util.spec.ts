import {
  expandImagePromptIntelligence,
  resolvePromptExpansionFromContext
} from "./image-prompt-intelligence.util";

describe("resolvePromptExpansionFromContext", () => {
  it("prefers explicit API promptExpansionMode over modeId", () => {
    const r = resolvePromptExpansionFromContext({
      modeId: "cinematic-desert",
      promptExpansionMode: "anime"
    });
    expect(r.mode).toBe("anime");
    expect(r.source).toBe("api_prompt_expansion_mode");
  });

  it("maps known modeId to a preset", () => {
    const r = resolvePromptExpansionFromContext({
      modeId: "guided-product-photo",
      promptExpansionMode: null
    });
    expect(r.mode).toBe("product");
    expect(r.source).toBe("mode_id_exact");
  });

  it("falls back to balanced when no signals", () => {
    const r = resolvePromptExpansionFromContext({ modeId: null, promptExpansionMode: null });
    expect(r.mode).toBeNull();
    expect(r.source).toBe("balanced_fallback");
  });
});

describe("expandImagePromptIntelligence", () => {
  const raw = "A lone figure crossing dunes at last light";

  it("produces a longer expanded prompt that still contains the user intent", () => {
    const out = expandImagePromptIntelligence({
      rawUserPrompt: raw,
      modeId: "cinematic-desert",
      hasSourceImage: false
    });
    expect(out.displayPrompt).toBe(raw);
    expect(out.expandedPrompt.length).toBeGreaterThan(raw.length + 40);
    expect(out.expandedPrompt).toContain("lone figure");
    expect(out.expandedPrompt).toContain("Widescreen photographic language");
    expect(out.debug.resolvedMode).toBe("cinematic");
  });

  it("differs by mode: product vs luxury layers", () => {
    const product = expandImagePromptIntelligence({
      rawUserPrompt: "wireless earbuds on slate",
      modeId: "guided-product-photo",
      hasSourceImage: false
    });
    const luxury = expandImagePromptIntelligence({
      rawUserPrompt: "wireless earbuds on slate",
      modeId: "guided-brand-concept",
      hasSourceImage: false
    });
    expect(product.expandedPrompt).toContain("commercial product photography");
    expect(luxury.expandedPrompt).toContain("Editorial luxury minimalism");
    expect(product.expandedPrompt).not.toBe(luxury.expandedPrompt);
  });

  it("balanced fallback stays subtle vs cinematic", () => {
    const balanced = expandImagePromptIntelligence({
      rawUserPrompt: "coffee cup on a desk",
      modeId: undefined,
      promptExpansionMode: null,
      hasSourceImage: false
    });
    const cinematic = expandImagePromptIntelligence({
      rawUserPrompt: "coffee cup on a desk",
      modeId: "cinematic-desert",
      hasSourceImage: false
    });
    expect(balanced.debug.resolvedMode).toBeNull();
    expect(balanced.expandedPrompt).toContain("faithful");
    expect(cinematic.expandedPrompt).toContain("Widescreen photographic language");
    expect(balanced.expandedPrompt.length).toBeLessThan(cinematic.expandedPrompt.length);
  });

  it("appends a transform guard when a source image is present", () => {
    const out = expandImagePromptIntelligence({
      rawUserPrompt: "make it cinematic",
      modeId: "cinematic-desert",
      hasSourceImage: true
    });
    expect(out.expandedPrompt).toContain("Preserve the source subject");
  });

  it("does not embed user-facing mode labels as the sole creative signal", () => {
    const out = expandImagePromptIntelligence({
      rawUserPrompt: "city at dusk",
      promptExpansionMode: "futuristic",
      hasSourceImage: false
    });
    expect(out.expandedPrompt).toContain("city at dusk");
    expect(out.expandedPrompt).toContain("Advanced contemporary futurism");
    expect(out.displayPrompt).toBe("city at dusk");
  });
});

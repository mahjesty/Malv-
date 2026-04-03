import { FULL_SPECTRUM_LAYER_IDS, INTELLIGENCE_REGISTRY, TIER1_FOUNDATIONAL_LAYER_IDS } from "./intelligence-registry";

describe("intelligence registry", () => {
  it("contains full-spectrum architecture entries", () => {
    expect(FULL_SPECTRUM_LAYER_IDS.length).toBeGreaterThanOrEqual(70);
    expect(FULL_SPECTRUM_LAYER_IDS).toContain("social");
    expect(FULL_SPECTRUM_LAYER_IDS).toContain("research");
    expect(FULL_SPECTRUM_LAYER_IDS).toContain("group_dynamics");
    expect(FULL_SPECTRUM_LAYER_IDS).toContain("embodiment");
  });

  it("preserves tier1 foundational activation set", () => {
    expect(TIER1_FOUNDATIONAL_LAYER_IDS).toEqual(
      expect.arrayContaining([
        "emotional",
        "social",
        "conversational",
        "communication",
        "analytical",
        "synthesis",
        "uncertainty",
        "contextual",
        "coding",
        "debugging",
        "review_critique",
        "execution",
        "file_intelligence",
        "multimodal",
        "memory",
        "trust_safety",
        "research",
        "web"
      ])
    );
  });

  it("marks non-tier1 entries as advisory", () => {
    const item = INTELLIGENCE_REGISTRY.find((x) => x.id === "negotiation");
    expect(item?.advisoryOnly).toBe(true);
  });
});

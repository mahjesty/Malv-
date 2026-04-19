import { describe, expect, it } from "vitest";
import {
  EXPLORE_CAPABILITIES,
  exploreCapabilityPath,
  featuredExploreCapabilities,
  getExploreCapability,
  isExploreCategoryId,
  listExploreCapabilitiesForCategory,
  listHubCategoryCards,
  topExploreHubCapabilities
} from "./exploreCapabilityRegistry";

describe("exploreCapabilityRegistry", () => {
  it("resolves known routes", () => {
    const c = getExploreCapability("create", "story");
    expect(c?.title).toBe("Story generator");
    expect(exploreCapabilityPath(c!)).toBe("/app/explore/create/story");
  });

  it("rejects unknown slugs", () => {
    expect(getExploreCapability("create", "nope")).toBeNull();
    expect(isExploreCategoryId("nope")).toBe(false);
  });

  it("lists per category without duplicates across registry", () => {
    const keys = new Set<string>();
    for (const c of EXPLORE_CAPABILITIES) {
      const k = `${c.categoryId}/${c.capabilityId}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
  });

  it("featured entries are a subset", () => {
    const f = featuredExploreCapabilities();
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.featured).toBe(true);
    }
  });

  it("capsules create category", () => {
    const list = listExploreCapabilitiesForCategory("create");
    expect(list.length).toBeGreaterThanOrEqual(5);
  });

  it("hub rails show three preview cards and deprioritize top-strip duplicates", () => {
    const { primary, overflow } = listHubCategoryCards("create");
    expect(primary).toHaveLength(3);
    const top = new Set(topExploreHubCapabilities().map((c) => `${c.categoryId}/${c.capabilityId}`));
    for (const c of primary) {
      expect(top.has(`${c.categoryId}/${c.capabilityId}`)).toBe(false);
    }
    expect(overflow.map((c) => c.capabilityId)).toContain("image");
  });

  it("top hub strip lists six flagship capabilities in a stable order", () => {
    const t = topExploreHubCapabilities();
    expect(t.map((c) => `${c.categoryId}/${c.capabilityId}`)).toEqual([
      "create/image",
      "transform/text-to-voice",
      "fix/fix-anything",
      "think/explain",
      "organize/plan-day",
      "interact/talk"
    ]);
  });
});

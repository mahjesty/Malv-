import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import {
  malvRichSurfaceShouldAttachSourcePreviewTiles,
  resolveMalvRichSurfaceDisplayPolicy,
  trimMalvRichMediaDeckToBudget
} from "./malv-rich-surface-display-policy.util";

describe("resolveMalvRichSurfaceDisplayPolicy", () => {
  it("keeps finance chart-forward and disables source preview tiles", () => {
    const p = resolveMalvRichSurfaceDisplayPolicy("finance_data", { structuredSourceCount: 2 });
    expect(p.financeMediaChartOnly).toBe(true);
    expect(p.allowSourcePreviewMedia).toBe(false);
    expect(p.maxImageCardsInMediaDeck).toBe(0);
  });

  it("shows mixed visual pills only when two or more sources are present", () => {
    const one = resolveMalvRichSurfaceDisplayPolicy("mixed_text_plus_visual", { structuredSourceCount: 1 });
    expect(one.showSourcePills).toBe(false);
    const two = resolveMalvRichSurfaceDisplayPolicy("mixed_text_plus_visual", { structuredSourceCount: 2 });
    expect(two.showSourcePills).toBe(true);
    expect(two.maxStructuredSourceItems).toBe(2);
  });

  it("caps web research imagery to a single rail card", () => {
    const p = resolveMalvRichSurfaceDisplayPolicy("web_research", { structuredSourceCount: 4 });
    expect(p.maxImageCardsInMediaDeck).toBe(1);
  });
});

describe("malvRichSurfaceShouldAttachSourcePreviewTiles", () => {
  const basePolicy = resolveMalvRichSurfaceDisplayPolicy("web_research", { structuredSourceCount: 2 });

  it("enables preview tiles for research only when imagery is present", () => {
    expect(
      malvRichSurfaceShouldAttachSourcePreviewTiles({
        mode: "web_research",
        imageCardCountAfterCap: 0,
        structuredSourceCount: 2,
        policy: basePolicy
      })
    ).toBe(false);
    expect(
      malvRichSurfaceShouldAttachSourcePreviewTiles({
        mode: "web_research",
        imageCardCountAfterCap: 1,
        structuredSourceCount: 2,
        policy: basePolicy
      })
    ).toBe(true);
  });

  it("allows preview tiles for mixed sources without requiring imagery", () => {
    const p = resolveMalvRichSurfaceDisplayPolicy("mixed_text_plus_sources", { structuredSourceCount: 2 });
    expect(
      malvRichSurfaceShouldAttachSourcePreviewTiles({
        mode: "mixed_text_plus_sources",
        imageCardCountAfterCap: 0,
        structuredSourceCount: 2,
        policy: p
      })
    ).toBe(true);
  });

  it("ties mixed visual preview tiles to multi-source substantiation", () => {
    const p = resolveMalvRichSurfaceDisplayPolicy("mixed_text_plus_visual", { structuredSourceCount: 2 });
    expect(
      malvRichSurfaceShouldAttachSourcePreviewTiles({
        mode: "mixed_text_plus_visual",
        imageCardCountAfterCap: 1,
        structuredSourceCount: 1,
        policy: resolveMalvRichSurfaceDisplayPolicy("mixed_text_plus_visual", { structuredSourceCount: 1 })
      })
    ).toBe(false);
    expect(
      malvRichSurfaceShouldAttachSourcePreviewTiles({
        mode: "mixed_text_plus_visual",
        imageCardCountAfterCap: 1,
        structuredSourceCount: 2,
        policy: p
      })
    ).toBe(true);
  });
});

describe("trimMalvRichMediaDeckToBudget", () => {
  it("prefers charts, then images, then preview tiles when trimming", () => {
    const trimmed = trimMalvRichMediaDeckToBudget(
      [
        { kind: "image", url: "https://a.test/a.png" },
        { kind: "chart", title: "C", subtitle: "s", series: [{ t: "1", v: 1 }] },
        { kind: "source_preview", title: "S", url: "https://s.test" }
      ],
      2
    );
    expect(trimmed.map((c) => c.kind)).toEqual(["chart", "image"]);
  });
});

describe("route fixtures align with policy intent", () => {
  it("uses image_enrichment for photo-forward prompts without mixed-mode cues", () => {
    expect(resolveUniversalMalvCapabilityRoute("show me photos of the place").responseMode).toBe("image_enrichment");
  });
});

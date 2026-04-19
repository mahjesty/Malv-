import type { MalvUniversalResponseMode } from "./malv-universal-capability-router.util";
import type { MalvFinanceExecutionData, MalvRichImageItem, MalvRichSourceItem } from "./malv-rich-response.types";
import { curateMalvRichSurfaceStructuredContent, malvFinanceChartPresentInRichData } from "./malv-rich-surface-curation.util";

describe("malvFinanceChartPresentInRichData", () => {
  it("detects nested finance snapshot with series", () => {
    const fin: MalvFinanceExecutionData = {
      kind: "malv_finance_snapshot",
      symbol: "X",
      label: "X",
      currency: "USD",
      current: 1,
      asOf: "t",
      changeAbs: 0,
      changePct: 0,
      chartSeries: [{ t: "1", v: 1 }]
    };
    expect(malvFinanceChartPresentInRichData({ finance: fin })).toBe(true);
  });

  it("is false for empty or non-finance payloads", () => {
    expect(malvFinanceChartPresentInRichData(null)).toBe(false);
    expect(malvFinanceChartPresentInRichData({ research: { kind: "malv_web_research_bundle" } })).toBe(false);
  });
});

describe("curateMalvRichSurfaceStructuredContent", () => {
  const W = (mode: MalvUniversalResponseMode) =>
    curateMalvRichSurfaceStructuredContent({
      mode,
      sources: [],
      images: [],
      data: undefined,
      maxStructuredSources: 5,
      maxImageRail: 2
    });

  it("handles empty inputs without throwing", () => {
    expect(W("web_research")).toEqual({ sources: [], images: [] });
    expect(W("image_enrichment")).toEqual({ sources: [], images: [] });
  });

  it("dedupes same-domain evidence and prefers higher-trust outlets for web_research", () => {
    const sources: MalvRichSourceItem[] = [
      { title: "Wire notes", url: "https://www.reuters.com/world/a-story" },
      { title: "Wire duplicate host", url: "https://www.reuters.com/world/other-path" },
      { title: "Social mirror", url: "https://www.facebook.com/groups/x" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "web_research",
      sources,
      images: [],
      data: undefined,
      maxStructuredSources: 5,
      maxImageRail: 1
    });
    const hosts = out.sources.map((s) => new URL(s.url).hostname.replace(/^www\./, ""));
    expect(hosts.filter((h) => h === "reuters.com").length).toBe(1);
    expect(out.sources[0]?.url).toContain("reuters.com");
    expect(out.sources.some((s) => s.url.includes("facebook.com"))).toBe(false);
  });

  it("dedupes near-identical titles keeping the stronger URL", () => {
    const sources: MalvRichSourceItem[] = [
      { title: "Breaking: Event timeline", url: "https://www.facebook.com/posts/1" },
      { title: "Breaking: Event timeline", url: "https://www.reuters.com/world/event-timeline" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "web_research",
      sources,
      images: [],
      data: undefined,
      maxStructuredSources: 5,
      maxImageRail: 0
    });
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]?.url).toContain("reuters.com");
  });

  it("applies route-aware source caps via maxStructuredSources", () => {
    const sources: MalvRichSourceItem[] = [
      { title: "A1", url: "https://www.reuters.com/a1" },
      { title: "A2", url: "https://www.nytimes.com/a2" },
      { title: "A3", url: "https://www.ft.com/a3" },
      { title: "A4", url: "https://apnews.com/a4" },
      { title: "A5", url: "https://www.bbc.com/a5" },
      { title: "A6", url: "https://www.theguardian.com/a6" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "web_research",
      sources,
      images: [],
      data: undefined,
      maxStructuredSources: 3,
      maxImageRail: 0
    });
    expect(out.sources).toHaveLength(3);
  });

  it("suppresses extra images when a finance chart is present on mixed_text_plus_sources", () => {
    const fin: MalvFinanceExecutionData = {
      kind: "malv_finance_snapshot",
      symbol: "SPY",
      label: "S&P",
      currency: "USD",
      current: 400,
      asOf: "t",
      changeAbs: 1,
      changePct: 0.1,
      chartSeries: [{ t: "1", v: 1 }]
    };
    const images: MalvRichImageItem[] = [
      { url: "https://cdn.example.com/chart.png", alt: "Annotated price structure for the session" },
      { url: "https://picsum.photos/seed/x/600/400", alt: "Decorative stock scene" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "mixed_text_plus_sources",
      sources: [],
      images,
      data: { finance: fin },
      maxStructuredSources: 3,
      maxImageRail: 2
    });
    expect(out.images).toHaveLength(0);
  });

  it("allows more imagery for image_enrichment even when finance chart exists in unrelated data", () => {
    const fin: MalvFinanceExecutionData = {
      kind: "malv_finance_snapshot",
      symbol: "SPY",
      label: "S&P",
      currency: "USD",
      current: 400,
      asOf: "t",
      changeAbs: 1,
      changePct: 0.1,
      chartSeries: [{ t: "1", v: 1 }]
    };
    const images: MalvRichImageItem[] = [
      { url: "https://cdn.example.com/a.png", alt: "Primary subject reference with enough detail" },
      { url: "https://picsum.photos/seed/z/600/400", alt: "x" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "image_enrichment",
      sources: [],
      images,
      data: { finance: fin },
      maxStructuredSources: 0,
      maxImageRail: 2
    });
    expect(out.images.length).toBeGreaterThanOrEqual(1);
    expect(out.images[0]?.url).toContain("cdn.example.com");
  });

  it("ranks markdown-quality images above stock placeholders when trimming", () => {
    const images: MalvRichImageItem[] = [
      { url: "https://picsum.photos/seed/aa/800/500", alt: "Short" },
      { url: "https://cdn.test/wire.png", alt: "Wire photo with caption text for editors" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "web_research",
      sources: [],
      images,
      data: undefined,
      maxStructuredSources: 0,
      maxImageRail: 1
    });
    expect(out.images).toHaveLength(1);
    expect(out.images[0]?.url).toBe("https://cdn.test/wire.png");
  });

  it("drops images with no alignment to user query and source titles on web_research", () => {
    const sources: MalvRichSourceItem[] = [{ title: "Bitcoin holds tight range into the close", url: "https://www.reuters.com/x" }];
    const images: MalvRichImageItem[] = [
      { url: "https://cdn.test/btc.png", alt: "Bitcoin futures screen", source: "Trading desk" },
      { url: "https://cdn.test/cat.png", alt: "Sleeping kitten", source: "stock photo" }
    ];
    const out = curateMalvRichSurfaceStructuredContent({
      mode: "web_research",
      sources,
      images,
      data: { kind: "malv_web_research_bundle", query: "bitcoin price", keyFacts: [], shortExplanation: "" },
      maxStructuredSources: 2,
      maxImageRail: 2,
      userText: "bitcoin update with photos"
    });
    expect(out.images.map((i) => i.url)).toEqual(["https://cdn.test/btc.png"]);
  });
});

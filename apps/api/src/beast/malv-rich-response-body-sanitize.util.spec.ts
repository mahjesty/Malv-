import {
  filterMalvRenderableRichImages,
  filterMalvRenderableRichSources,
  isBlockedMalvRichStructuredUrl,
  liftMarkdownImagesFromAssistantBody,
  liftMarkdownLinksAndBareUrlsFromAssistantBody,
  malvHumanLabelFromUrl,
  mergeMalvRichImages,
  mergeMalvRichSources,
  sanitizeMalvRichProfessionalAssistantBody,
  validateMalvRichDeliveryComposition
} from "./malv-rich-response-body-sanitize.util";

describe("malvHumanLabelFromUrl", () => {
  it("prefers registrable-style host label", () => {
    expect(malvHumanLabelFromUrl("https://www.coindesk.com/markets/btc")).toMatch(/coindesk/i);
  });
});

describe("liftMarkdownLinksAndBareUrlsFromAssistantBody", () => {
  it("lifts markdown links into discovered sources and keeps readable anchor text", () => {
    const out = liftMarkdownLinksAndBareUrlsFromAssistantBody(
      "Read [CoinDesk](https://www.coindesk.com/x) for more.",
      [],
      { mergeDiscoveredIntoSources: true }
    );
    expect(out.text).toContain("CoinDesk");
    expect(out.text).not.toMatch(/coindesk\.com/);
    expect(out.discovered).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "https://www.coindesk.com/x", title: "CoinDesk" })])
    );
  });

  it("lifts bare URLs when merge is enabled", () => {
    const out = liftMarkdownLinksAndBareUrlsFromAssistantBody("See https://reuters.com/world/article for context.", [], {
      mergeDiscoveredIntoSources: true
    });
    expect(out.text).not.toMatch(/https:\/\//);
    expect(out.discovered.some((d) => /reuters\.com/i.test(d.url))).toBe(true);
  });

  it("does not add structured sources when merge is disabled (uses short host hint)", () => {
    const out = liftMarkdownLinksAndBareUrlsFromAssistantBody("Link https://nasa.gov/x and [NASA](https://nasa.gov/y).", [], {
      mergeDiscoveredIntoSources: false }
    );
    expect(out.discovered.length).toBe(0);
    expect(out.text).toContain("NASA");
    expect(out.text).not.toMatch(/https:\/\//);
  });

  it("skips transforming fenced code blocks", () => {
    const out = liftMarkdownLinksAndBareUrlsFromAssistantBody(
      "Outer https://example.com/a\n\n```\nconst u = \"https://example.com/b\"\n```",
      [],
      { mergeDiscoveredIntoSources: true }
    );
    expect(out.text).toContain("https://example.com/b");
    expect(out.text).not.toContain("https://example.com/a");
  });
});

describe("mergeMalvRichSources", () => {
  it("dedupes by host+path", () => {
    const merged = mergeMalvRichSources(
      [{ title: "A", url: "https://x.com/a" }],
      [{ title: "B", url: "https://x.com/a?utm=1" }]
    );
    expect(merged.length).toBe(1);
  });
});

describe("liftMarkdownImagesFromAssistantBody", () => {
  it("lifts markdown images into discovered items and removes syntax from text", () => {
    const out = liftMarkdownImagesFromAssistantBody("Intro\n\n![cap](https://cdn.test/a.png)\nTail", [], {
      mergeIntoImages: true
    });
    expect(out.text).not.toMatch(/cdn\.test/);
    expect(out.text).not.toMatch(/!\[/);
    expect(out.discovered).toEqual([expect.objectContaining({ url: "https://cdn.test/a.png", alt: "cap" })]);
  });

  it("does not touch fenced code blocks", () => {
    const out = liftMarkdownImagesFromAssistantBody("```\n![x](https://x.com/i.png)\n```", [], { mergeIntoImages: true });
    expect(out.text).toContain("https://x.com/i.png");
    expect(out.discovered.length).toBe(0);
  });
});

describe("mergeMalvRichImages", () => {
  it("dedupes by normalized URL", () => {
    const m = mergeMalvRichImages([{ url: "https://x.com/a.png" }], [{ url: "https://x.com/a.png", alt: "dup" }]);
    expect(m.length).toBe(1);
  });
});

describe("isBlockedMalvRichStructuredUrl", () => {
  it("blocks example.* documentation hosts", () => {
    expect(isBlockedMalvRichStructuredUrl("https://example.com/x")).toBe(true);
    expect(isBlockedMalvRichStructuredUrl("https://api.example.com/x")).toBe(true);
    expect(isBlockedMalvRichStructuredUrl("https://www.coindesk.com/x")).toBe(false);
  });
});

describe("filterMalvRenderableRichImages", () => {
  it("drops example hosts and placeholder-tagged rows", () => {
    const out = filterMalvRenderableRichImages([
      { url: "https://example.com/a.png" },
      { url: "https://cdn.test/ok.png", alt: "placeholder asset" }
    ]);
    expect(out.length).toBe(0);
  });
});

describe("filterMalvRenderableRichSources", () => {
  it("drops example hosts from structured sources", () => {
    const out = filterMalvRenderableRichSources([
      { title: "Good", url: "https://reuters.com/a" },
      { title: "Bad", url: "https://example.org/b" }
    ]);
    expect(out).toEqual([expect.objectContaining({ url: "https://reuters.com/a" })]);
  });
});

describe("sanitizeMalvRichProfessionalAssistantBody", () => {
  const baseCtx = {
    structuredSourcesCount: 0,
    structuredImagesCount: 0,
    hasRenderableChartInChrome: false,
    showSourcesInChrome: false
  };

  it("removes markdown headings, separators, and bold scaffolding", () => {
    const raw =
      "### Current Bitcoin Update\n\n---\n\n**MALV execution** is **great**.\n\n*italic* word.";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, baseCtx);
    expect(out).not.toMatch(/^#|\n#/m);
    expect(out).not.toMatch(/^\s*---\s*$/m);
    expect(out).not.toContain("**");
    expect(out).toContain("MALV execution");
    expect(out).toContain("great");
  });

  it("removes source dump lists when source chrome carries sources", () => {
    const raw = "Answer here.\n\nSources:\n- https://a.com/x\n- https://b.com/y";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, {
      ...baseCtx,
      structuredSourcesCount: 2,
      showSourcesInChrome: true
    });
    expect(out).not.toMatch(/https:\/\//);
    expect(out).toContain("Answer here");
  });

  it("removes image list prose when structured images exist", () => {
    const raw = "Summary.\n\nRelevant Images:\n1. Sunset photo\n2. City skyline";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, {
      ...baseCtx,
      structuredImagesCount: 2
    });
    expect(out).not.toMatch(/Relevant Images/i);
    expect(out).not.toMatch(/Sunset photo/);
    expect(out).toContain("Summary");
  });

  it("strips attached-image narration when no images in chrome", () => {
    const raw = "I attached 2 reference images below the reply.\n\nHello.";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, { ...baseCtx, structuredImagesCount: 0 });
    expect(out).not.toMatch(/attached\s+2/i);
    expect(out).toContain("Hello");
  });

  it("strips tutorial phrasing when source chrome is on", () => {
    const raw = "Result. You can visit these websites for more detail.";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, {
      ...baseCtx,
      structuredSourcesCount: 1,
      showSourcesInChrome: true
    });
    expect(out).not.toMatch(/visit these websites/i);
  });

  it("strips overview and below-the-fold UI phrasing even without source chrome", () => {
    const raw = "Here is an overview: Delta State blends riverine forest with savanna. Sources below list parks.";
    const out = sanitizeMalvRichProfessionalAssistantBody(raw, baseCtx);
    expect(out.toLowerCase()).not.toContain("here is an overview");
    expect(out.toLowerCase()).not.toContain("sources below");
  });
});

describe("validateMalvRichDeliveryComposition", () => {
  it("flags raw URLs in body when source pills are active", () => {
    const v = validateMalvRichDeliveryComposition({
      replyText: "See https://x.com",
      structuredSourcesCount: 1,
      structuredImagesCount: 0,
      showSourcesInChrome: true
    });
    expect(v.ok).toBe(false);
    expect(v.issues).toContain("raw_url_in_body_with_source_chrome");
  });

  it("allows prose when no raw URLs with source chrome", () => {
    const v = validateMalvRichDeliveryComposition({
      replyText: "Clean answer only.",
      structuredSourcesCount: 2,
      structuredImagesCount: 0,
      showSourcesInChrome: true
    });
    expect(v.ok).toBe(true);
  });
});

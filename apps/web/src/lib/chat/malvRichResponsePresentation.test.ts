import { describe, expect, it } from "vitest";
import {
  deriveRichSurfaceStripTargets,
  limitMalvRichQuickActions,
  malvFormatSourcePillLabel,
  malvRichResponseHasSurface,
  parseMalvRichResponse,
  shouldRenderMalvSourcePills,
  stripAssistantBodyForStructuredSurface
} from "./malvRichResponsePresentation";

describe("parseMalvRichResponse", () => {
  it("returns null when no images, sources, media, or actions", () => {
    expect(parseMalvRichResponse({ malvRichResponse: { text: "only" } })).toBeNull();
  });

  it("parses executionLeadIn alone as a structured surface", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: { executionLeadIn: "BTC last traded at 42000 USD as of snapshot." }
    });
    expect(p?.executionLeadIn?.includes("42000")).toBe(true);
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("parses images for horizontal carousel surface", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        images: [{ url: "https://cdn.test/a.png", alt: "A", source: "NASA" }]
      }
    });
    expect(p?.images.length).toBe(1);
    expect(p?.media.length).toBe(1);
    expect(p?.media[0]?.kind).toBe("image");
    expect(p?.sources.length).toBe(0);
    expect(shouldRenderMalvSourcePills(p!)).toBe(false);
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("parses explicit media deck with chart cards", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        media: [
          {
            kind: "chart",
            title: "BTC",
            subtitle: "now",
            series: [
              { t: "a", v: 1 },
              { t: "b", v: 2 }
            ]
          }
        ]
      }
    });
    expect(p?.media[0]?.kind).toBe("chart");
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("parses quick actions without requiring sources", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        images: [{ url: "https://cdn.test/a.png" }],
        actions: [
          { id: "save_turn", label: "Save" },
          { id: "send_to_task", label: "To task" }
        ]
      }
    });
    expect(p?.actions.map((a) => a.id)).toEqual(["send_to_task", "save_turn"]);
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("caps dense legacy quick actions to two with task-first ordering", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        sources: [{ title: "A", url: "https://a.com" }],
        actions: [
          { id: "save_turn", label: "Save" },
          { id: "summarize_sources", label: "Summarize" },
          { id: "send_to_task", label: "To task" },
          { id: "compare_sources", label: "Compare" }
        ]
      }
    });
    expect(p?.actions.map((a) => a.id)).toEqual(["send_to_task", "compare_sources"]);
  });

  it("treats actions-only payloads as a surface (graceful forward-compat)", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        actions: [{ id: "save_turn", label: "Save" }]
      }
    });
    expect(p?.actions.length).toBe(1);
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("does not treat open_externally-only actions as a structured surface", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        actions: [{ id: "open_externally", label: "Browser", url: "https://example.com/x" }]
      }
    });
    expect(p?.actions.length).toBe(1);
    expect(malvRichResponseHasSurface(p!)).toBe(false);
  });

  it("hides source pills when server sets showSourcesInChrome false", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        showSourcesInChrome: false,
        sources: [{ title: "Hidden", url: "https://x.com/a" }],
        media: [{ kind: "image", url: "https://cdn.test/hidden-pill-case.png" }]
      }
    });
    expect(p?.sources.length).toBe(1);
    expect(shouldRenderMalvSourcePills(p!)).toBe(false);
    expect(malvRichResponseHasSurface(p!)).toBe(true);
  });

  it("shows source pills by default when flag omitted (legacy)", () => {
    const p = parseMalvRichResponse({
      malvRichResponse: {
        sources: [{ title: "Reuters", url: "https://reuters.com/x" }]
      }
    });
    expect(shouldRenderMalvSourcePills(p!)).toBe(true);
  });
});

describe("limitMalvRichQuickActions", () => {
  it("keeps order stable when already within the cap", () => {
    const xs = [
      { id: "send_to_task" as const, label: "To task" },
      { id: "compare_sources" as const, label: "Compare" }
    ];
    expect(limitMalvRichQuickActions(xs).map((a) => a.id)).toEqual(["send_to_task", "compare_sources"]);
  });
});

describe("malvFormatSourcePillLabel", () => {
  it("prefers short prefix before em dash", () => {
    expect(
      malvFormatSourcePillLabel({
        title: "BTC — consolidated tape (mock provider)",
        url: "https://example.invalid/x"
      })
    ).toBe("BTC");
  });

  it("does not surface raw URLs as pill text", () => {
    const label = malvFormatSourcePillLabel({
      title: "https://www.coindesk.com/markets",
      url: "https://www.coindesk.com/markets"
    });
    expect(label).not.toMatch(/^https:\/\//);
  });
});

describe("deriveRichSurfaceStripTargets", () => {
  it("returns null unless structured surface flag is set", () => {
    expect(deriveRichSurfaceStripTargets({ malvRichResponse: { sources: [{ title: "A", url: "https://a.com" }] } })).toBeNull();
    expect(
      deriveRichSurfaceStripTargets({
        malvStructuredRichSurface: true,
        malvRichResponse: { sources: [{ title: "A", url: "https://a.com/x" }] }
      })?.sourceUrls
    ).toEqual(["https://a.com/x"]);
  });
});

describe("live completion metadata merge (rich handoff)", () => {
  it("exposes a renderable rich surface when allowlisted completion meta is merged like useMalvChat", () => {
    const assistantMeta = {
      malvStructuredRichSurface: true,
      malvRichResponse: {
        sources: [{ title: "Live source", url: "https://live.test/article" }],
        showSourcesInChrome: true
      }
    };
    const metadata: Record<string, unknown> = {
      streamedPreview: true,
      ...assistantMeta,
      malvTurnOutcome: "complete"
    };
    const parsed = parseMalvRichResponse(metadata);
    expect(parsed).not.toBeNull();
    expect(malvRichResponseHasSurface(parsed!)).toBe(true);
    expect(shouldRenderMalvSourcePills(parsed!)).toBe(true);
  });

  it("degrades safely when completion has no assistant rich meta (legacy transport)", () => {
    const metadata: Record<string, unknown> = {
      malvTurnOutcome: "complete"
    };
    expect(parseMalvRichResponse(metadata)).toBeNull();
  });
});

describe("stripAssistantBodyForStructuredSurface", () => {
  it("removes bare URLs that appear in structured chrome targets", () => {
    const out = stripAssistantBodyForStructuredSurface("See https://a.com/x for more.", {
      sourceUrls: ["https://a.com/x"],
      imageUrls: []
    });
    expect(out).not.toMatch(/https:\/\//);
  });

  it("does not strip fenced code that mentions the same URL", () => {
    const out = stripAssistantBodyForStructuredSurface("```\nhttps://a.com/x\n```", {
      sourceUrls: ["https://a.com/x"],
      imageUrls: []
    });
    expect(out).toContain("https://a.com/x");
  });
});

import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import type { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";
import { composeMalvCapabilityRichDelivery } from "./malv-universal-capability-response-compose.util";

const minimalFinanceExecution: MalvUniversalCapabilityExecutionResult = {
  ok: true,
  promptInjection: "x",
  rich: {
    text: "",
    sources: [{ title: "CoinGecko", url: "https://www.coingecko.com/en/coins/bitcoin" }],
    data: {
      kind: "malv_finance_snapshot",
      symbol: "BTC",
      label: "Bitcoin",
      currency: "USD",
      current: 42_000,
      asOf: "2026-01-01 00:00:00 UTC",
      changeAbs: 10,
      changePct: 0.1,
      range: { label: "7d", low: 40_000, high: 43_000 },
      chartSeries: [
        { t: "01-01", v: 41_000 },
        { t: "01-02", v: 42_000 }
      ]
    }
  }
};

describe("composeMalvCapabilityRichDelivery", () => {
  it("returns model reply when compose inner throws (contract safety)", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today till date");
    const rich: Record<string, unknown> = { text: "" };
    Object.defineProperty(rich, "images", {
      enumerable: true,
      get() {
        throw new Error("malicious_rich_payload");
      }
    });
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Here is the synthesized answer.",
      execution: {
        ok: true,
        promptInjection: "x",
        rich: rich as any
      }
    });
    expect(out.reply).toBe("Here is the synthesized answer.");
    expect(out.metaPatch.malvCapabilityRichComposeOk).toBe(false);
    expect(String(out.metaPatch.malvCapabilityRichComposeError)).toContain("malicious_rich_payload");
  });

  it("sets showSourcesInChrome for finance and strips markdown URLs from model body into sources", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Narrative with [Reuters](https://www.reuters.com/world/x).",
      execution: minimalFinanceExecution
    });
    const rich = out.metaPatch.malvRichResponse as { showSourcesInChrome?: boolean; sources?: { url: string }[] };
    expect(rich.showSourcesInChrome).toBe(true);
    expect(out.reply).not.toMatch(/reuters\.com/);
    expect(rich.sources?.some((s) => /reuters\.com/i.test(s.url))).toBe(true);
  });

  it("disables source pill chrome for image_enrichment while avoiding raw URLs in body", () => {
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        images: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/a7/Example.jpg", alt: "Sample" }]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "See https://example.com/gallery for more.",
      execution: ex
    });
    const rich = out.metaPatch.malvRichResponse as { showSourcesInChrome?: boolean; sources?: unknown[] };
    expect(rich.showSourcesInChrome).toBe(false);
    expect(Array.isArray(rich.sources) ? rich.sources.length : 0).toBe(0);
    expect(out.reply).not.toMatch(/https:\/\//);
  });

  it("attaches structured media deck without informational To task chrome by default", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Narrative.",
      execution: minimalFinanceExecution
    });
    const rich = out.metaPatch.malvRichResponse as {
      media?: { kind: string }[];
      actions?: { id: string }[];
    };
    expect(out.metaPatch.malvStructuredRichSurface).toBe(true);
    expect(rich.media?.some((c) => c.kind === "chart")).toBe(true);
    expect(rich.media?.some((c) => c.kind === "image")).toBe(false);
    expect(rich.actions?.some((a) => a.id === "send_to_task") ?? false).toBe(false);
    expect(out.metaPatch.malvDiagnosticRichActions).toMatchObject({
      sendToTaskSuppressedReason: "short_informational_surface"
    });
  });

  it("includes To task when the user explicitly asks for a task on an informational route", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Narrative.",
      execution: minimalFinanceExecution,
      userText: "create a task to track bitcoin daily"
    });
    const rich = out.metaPatch.malvRichResponse as { actions?: { id: string }[] };
    expect(rich.actions?.map((a) => a.id)).toContain("send_to_task");
  });

  it("lifts markdown images into the media rail for visual routes", () => {
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        images: [{ url: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg", alt: "Landscape" }]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Look ![shot](https://cdn.test/shot.png) here.",
      execution: ex
    });
    expect(out.reply).not.toMatch(/cdn\.test/);
    const rich = out.metaPatch.malvRichResponse as { media?: { kind: string; url?: string }[] };
    expect(rich.media?.some((c) => c.kind === "image" && c.url === "https://cdn.test/shot.png")).toBe(true);
  });

  it("adds source_preview tiles for web research when imagery is present", () => {
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        data: {
          kind: "malv_web_research_bundle",
          query: "q",
          keyFacts: ["Fact one"],
          shortExplanation: "Summary"
        },
        sources: [
          { title: "Wire", url: "https://www.reuters.com/world/a" },
          { title: "Desk", url: "https://www.theguardian.com/science/b" }
        ]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "See ![wire](https://cdn.test/wire.png) for context.",
      execution: ex
    });
    const rich = out.metaPatch.malvRichResponse as { media?: { kind: string }[] };
    expect(rich.media?.some((c) => c.kind === "source_preview")).toBe(true);
    expect(rich.media?.filter((c) => c.kind === "image").length).toBeLessThanOrEqual(1);
  });

  it("adds a capped source_preview tile on mixed_text_plus_visual when multi-sourced", () => {
    const route = resolveUniversalMalvCapabilityRoute(
      "show me photos of the landmark and latest news headlines today"
    );
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        images: [{ url: "https://upload.wikimedia.org/wikipedia/commons/1/14/Landscape_Architecture_NUS.jpg", alt: "x" }],
        data: {
          kind: "malv_web_research_bundle",
          query: "q",
          keyFacts: ["k"],
          shortExplanation: "e"
        },
        sources: [
          { title: "A", url: "https://www.reuters.com/world/a" },
          { title: "B", url: "https://www.theguardian.com/world/b" }
        ]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Answer body only.",
      execution: ex
    });
    const rich = out.metaPatch.malvRichResponse as { media?: { kind: string }[] };
    expect(rich.media?.some((c) => c.kind === "source_preview")).toBe(true);
    expect((rich.media?.length ?? 0)).toBeLessThanOrEqual(3);
  });

  it("strips markdown headings, separators, and bold from the final rich reply body", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "### Hot take\n\n---\n\n**Bold** point. Cite [Reuters](https://www.reuters.com/world/x).",
      execution: minimalFinanceExecution
    });
    expect(out.reply).not.toContain("###");
    expect(out.reply).not.toMatch(/^\s*---\s*$/m);
    expect(out.reply).not.toContain("**");
    expect(out.reply).not.toMatch(/https:\/\//);
    expect(out.metaPatch.malvRichBodyCompositionIssues).toBeUndefined();
  });

  it("does not offer compare_sources when curation collapses evidence to one domain", () => {
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Summary only.",
      execution: {
        ok: true,
        promptInjection: "x",
        rich: {
          text: "",
          data: {
            kind: "malv_web_research_bundle",
            query: "q",
            keyFacts: ["k"],
            shortExplanation: "e"
          },
          sources: [
            { title: "First wire", url: "https://www.reuters.com/world/a" },
            { title: "Second wire", url: "https://www.reuters.com/world/b" }
          ]
        }
      }
    });
    const rich = out.metaPatch.malvRichResponse as { sources?: unknown[]; actions?: { id: string }[] };
    expect(rich.sources?.length).toBe(1);
    expect(rich.actions?.some((a) => a.id === "send_to_task") ?? false).toBe(false);
    expect(rich.actions?.some((a) => a.id === "compare_sources") ?? false).toBe(false);
  });

  it("does not narrate attached images when execution yields no renderable images", () => {
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        images: [{ url: "https://example.com/bad.png", alt: "x" }]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "I attached 3 reference images below the reply.\n\nHere is the answer.",
      execution: ex
    });
    expect(out.reply).not.toMatch(/attached\s+3/i);
    expect(out.reply).toContain("Here is the answer.");
  });

  it("filters picsum URLs from structured images before building media deck", () => {
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        images: [{ url: "https://picsum.photos/seed/x/800/600", alt: "bad" }]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Caption.",
      execution: ex
    });
    const rich = out.metaPatch.malvRichResponse as { media?: { kind: string; url?: string }[] };
    expect((rich.media ?? []).some((c) => c.kind === "image")).toBe(false);
  });

  it("strips generic UI-aware phrasing from the composed rich reply body", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply:
        "Here is an overview. You can visit these websites for more.\n\nBitcoin is near session highs with tight ranges.",
      execution: minimalFinanceExecution
    });
    const t = out.reply.toLowerCase();
    expect(t).not.toContain("you can visit");
    expect(t).not.toContain("here is an overview");
  });

  it("for WS delivery keeps finance lead-in on rich metadata only (reply body matches model stream)", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Here is a short interpretation.",
      execution: minimalFinanceExecution,
      forLiveWebSocketDelivery: true
    });
    expect(out.reply.toLowerCase()).not.toContain("last traded");
    expect(out.reply).toContain("Here is a short interpretation.");
    const rich = out.metaPatch.malvRichResponse as { executionLeadIn?: string };
    expect(rich.executionLeadIn?.toLowerCase()).toContain("last traded");
  });

  it("drops off-topic images when query and evidence align with a different subject", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin update with photos");
    const ex: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      promptInjection: "x",
      rich: {
        text: "",
        data: {
          kind: "malv_web_research_bundle",
          query: "bitcoin price",
          keyFacts: ["Spot held a tight range."],
          shortExplanation: "Flows leaned cautious."
        },
        sources: [{ title: "Bitcoin holds range as flows slow", url: "https://www.reuters.com/markets/bitcoin-range" }],
        images: [
          { url: "https://cdn.test/btc.png", alt: "Bitcoin price chart", source: "Reuters" },
          { url: "https://cdn.test/kitten.png", alt: "Sleeping kitten on a blanket", source: "stock photo" }
        ]
      }
    };
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Spot bitcoin stayed range-bound; desks note thinner depth.",
      execution: ex,
      userText: "bitcoin update with photos"
    });
    const rich = out.metaPatch.malvRichResponse as { images?: { url: string }[]; media?: { kind: string; url?: string }[] };
    const urls = [...(rich.images ?? []), ...(rich.media ?? []).filter((c) => c.kind === "image")].map((x) =>
      "url" in x && typeof x.url === "string" ? x.url : ""
    );
    expect(urls.some((u) => /kitten/i.test(u))).toBe(false);
    expect(urls.some((u) => /btc/i.test(u))).toBe(true);
  });

  it("compose returns an immediate structured result (sync utility chain; no async contract)", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Narrative.",
      execution: minimalFinanceExecution
    });
    expect(typeof out.reply).toBe("string");
    expect(out.metaPatch.malvRichResponse && typeof out.metaPatch.malvRichResponse).toBe("object");
    expect(out.metaPatch.malvCapabilityRichComposeOk).not.toBe(false);
  });

  it("keeps compare_sources on substantive informational bodies with multi-host evidence", () => {
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const longModel =
      "Astronauts completed a multi-week mission profile with nominal re-entry sequencing.\n\n" +
      "Teams cited stable thermal margins and routine comms handoffs during de-orbit burns.\n\n".repeat(12);
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: longModel,
      execution: {
        ok: true,
        promptInjection: "x",
        rich: {
          text: "",
          data: {
            kind: "malv_web_research_bundle",
            query: "astronauts",
            keyFacts: ["Crew returned on schedule."],
            shortExplanation: "Agencies confirmed recovery ops."
          },
          sources: [
            { title: "Wire desk", url: "https://www.reuters.com/science/a" },
            { title: "Guardian science", url: "https://www.theguardian.com/science/b" }
          ]
        }
      }
    });
    const rich = out.metaPatch.malvRichResponse as { actions?: { id: string }[] };
    expect(rich.actions?.map((a) => a.id)).toContain("compare_sources");
  });
});

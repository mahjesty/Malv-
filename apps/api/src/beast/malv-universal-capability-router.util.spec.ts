import {
  decideUniversalMalvCapabilityRoute,
  resolveMalvUniversalCapabilityRouteForWorkerPrompt,
  resolveUniversalMalvCapabilityRoute,
  scoreUniversalMalvRequest,
  universalCapabilityDemandPatch,
  mergeUniversalDemandIntoChatDemand
} from "./malv-universal-capability-router.util";
import type { MalvTaskCapabilityDemand } from "../inference/malv-inference-tier-capability.types";

describe("malv-universal-capability-router.util", () => {
  it("routes live phrasing + crypto to finance_data (up today)", () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin up today");
    expect(route.responseMode).toBe("finance_data");
    expect(route.financeLensActive).toBe(true);
  });

  it("routes current token price phrasing to finance_data", () => {
    const route = resolveUniversalMalvCapabilityRoute("current solana price");
    expect(route.responseMode).toBe("finance_data");
    expect(route.dimensionScores.financial_data).toBeGreaterThanOrEqual(2);
  });

  it("routes dated crypto/market price asks to finance_data with freshness", () => {
    const route = resolveUniversalMalvCapabilityRoute("give me bitcoin price from last week till date");
    expect(route.responseMode).toBe("finance_data");
    expect(route.freshnessMatters).toBe(true);
    expect(route.financeLensActive).toBe(true);
    expect(route.dimensionScores.financial_data).toBeGreaterThanOrEqual(2);
  });

  it("routes recent public-events news to web_research", () => {
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    expect(route.responseMode).toBe("web_research");
    expect(route.externalRetrievalRecommended).toBe(true);
  });

  it("routes explicit photo / place asks to image_enrichment", () => {
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    expect(route.responseMode).toBe("image_enrichment");
    expect(route.imageEnrichmentRecommended).toBe(true);
  });

  it("keeps stable CS concept asks on plain_model", () => {
    const route = resolveUniversalMalvCapabilityRoute("what is recursion");
    expect(route.responseMode).toBe("plain_model");
    expect(universalCapabilityDemandPatch(route)).toBeNull();
  });

  it("keeps writing assistance on plain_model", () => {
    const route = resolveUniversalMalvCapabilityRoute("help me write an email");
    expect(route.responseMode).toBe("plain_model");
  });

  it("routes compare-latest company research to mixed_text_plus_sources", () => {
    const route = resolveUniversalMalvCapabilityRoute("compare the latest updates on two companies");
    expect(route.responseMode).toBe("mixed_text_plus_sources");
    expect(route.sourceBackedRecommended).toBe(true);
  });

  it("routes landmark visual questions to image_enrichment", () => {
    const route = resolveUniversalMalvCapabilityRoute("what does this landmark look like");
    expect(route.responseMode).toBe("image_enrichment");
  });

  it("routes verification language to mixed_text_plus_sources", () => {
    const route = resolveUniversalMalvCapabilityRoute("are you sure — verify it");
    expect(route.responseMode).toBe("mixed_text_plus_sources");
    expect(route.sourceBackedRecommended).toBe(true);
  });

  it("emits a non-trivial capability demand patch for web_research turns", () => {
    const route = resolveUniversalMalvCapabilityRoute("breaking updates today on the storm");
    const patch = universalCapabilityDemandPatch(route);
    expect(patch).not.toBeNull();
    expect(patch!.minimumCapabilityClass).toBe("enhanced");
    expect(patch!.requiresStructuredOutput).toBe(true);
  });

  it("mergeUniversalDemandIntoChatDemand strengthens baseline demand", () => {
    const base: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "edge",
      reasoningDepthRequired: "interactive",
      requiresMultimodal: false,
      requiresStructuredOutput: false,
      promptChars: 10,
      contextChars: 10,
      minimumResponsiveness: "throughput",
      concurrentInferSlotsRequired: 1
    };
    const route = resolveUniversalMalvCapabilityRoute("latest regulatory filing summary with citations");
    const merged = mergeUniversalDemandIntoChatDemand(base, route);
    expect(merged.minimumCapabilityClass).not.toBe("edge");
    expect(merged.reasoningDepthRequired).toBe("deep");
  });

  it("does not label a pure compare-without-live cue as mixed sources", () => {
    const scores = scoreUniversalMalvRequest("compare typescript and javascript for backend work");
    const route = decideUniversalMalvCapabilityRoute(scores, "compare typescript and javascript for backend work");
    expect(route.responseMode).toBe("plain_model");
  });

  it("resolveMalvUniversalCapabilityRouteForWorkerPrompt downgrades to plain when execution has no bundle", () => {
    const declared = resolveUniversalMalvCapabilityRoute("breaking news today with citations");
    expect(declared.responseMode).not.toBe("plain_model");
    const effective = resolveMalvUniversalCapabilityRouteForWorkerPrompt(declared, {
      ok: false,
      promptInjection: ""
    });
    expect(effective.responseMode).toBe("plain_model");
    expect(effective.sourceBackedRecommended).toBe(false);
  });
});

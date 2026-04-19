import {
  applyMalvReliabilityTextPolicy,
  applyMalvResponseReliabilityDeliveryPass,
  applyMalvReliabilityTierConversationalTone,
  assessMalvResponseReliability,
  clampMalvResponseConfidenceByTier,
  inferMalvBusinessPlaceVerifierDemand,
  inferMalvHardClampSituationDemand,
  inferMalvVisualVerifierDemand,
  resolveMalvVisualDescriptiveFallbackSnippet,
  stripMalvReliabilityEvasiveFallbackPhrasing
} from "./malv-response-reliability.util";
import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import type { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";

function routeFor(text: string) {
  return resolveUniversalMalvCapabilityRoute(text);
}

const skippedExecution: MalvUniversalCapabilityExecutionResult = {
  ok: true,
  skipped: true,
  promptInjection: "",
  rich: null
};

describe("malv-response-reliability", () => {
  describe("category signals", () => {
    it("treats business existence / branch asks as high verifier demand", () => {
      expect(inferMalvBusinessPlaceVerifierDemand("is there a supermarket chain in delta state?")).toBeGreaterThanOrEqual(0.45);
      expect(inferMalvBusinessPlaceVerifierDemand("where is it located?")).toBeGreaterThanOrEqual(0.25);
    });

    it("detects visual asks from phrasing", () => {
      const r = routeFor("photos of lagos beaches");
      expect(inferMalvVisualVerifierDemand(r, "photos of lagos beaches")).toBeGreaterThanOrEqual(0.42);
    });
  });

  describe("assessMalvResponseReliability", () => {
    it("plain model + business question + no bundle → weak or ungrounded", () => {
      const userText = "is there a supermarket chain in delta state?";
      const declared = routeFor(userText);
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null,
        priorAssistantSnippet: null
      });
      expect(["weakly_grounded", "ungrounded"]).toContain(a.tier);
      expect(a.forbidTutorialFallback).toBe(true);
    });

    it("simple factual style question stays less strict when stable knowledge dominates", () => {
      const userText = "is lagos expensive compared to abuja?";
      const declared = routeFor(userText);
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null
      });
      expect(a.verifierDemandScore).toBeLessThan(0.55);
    });

    it("finance snapshot execution → strongly grounded", () => {
      const userText = "bitcoin price up today?";
      const declared = routeFor(userText);
      const exec: MalvUniversalCapabilityExecutionResult = {
        ok: true,
        promptInjection: "x".repeat(400),
        rich: {
          text: "",
          data: {
            kind: "malv_finance_snapshot",
            symbol: "BTC",
            label: "Bitcoin",
            currency: "USD",
            current: 1,
            asOf: "2026-01-01",
            changeAbs: 1,
            changePct: 1
          }
        }
      };
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: exec,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: exec.rich
      });
      expect(a.tier).toBe("strongly_grounded");
    });

    it("visual route with zero images → suppress visual deck", () => {
      const userText = "photos of lagos beaches";
      const base = routeFor(userText);
      const declared = {
        ...base,
        responseMode: "image_enrichment" as const,
        imageEnrichmentRecommended: true,
        externalRetrievalRecommended: true
      };
      const exec: MalvUniversalCapabilityExecutionResult = {
        ok: true,
        promptInjection: "bundle",
        rich: { text: "ok", sources: [{ title: "A", url: "https://example.com/a" }] }
      };
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: exec,
        structuredSourceCount: 1,
        structuredImageCount: 0,
        rich: exec.rich
      });
      expect(a.suppressVisualDeck).toBe(true);
    });

    it("follow-up + weak evidence → followUpReGroundingRecommended", () => {
      const userText = "where is it located?";
      const declared = routeFor(userText);
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null,
        priorAssistantSnippet: "Some earlier answer without verification markers."
      });
      expect(a.followUpReGroundingRecommended).toBe(true);
    });
  });

  describe("stripMalvReliabilityEvasiveFallbackPhrasing", () => {
    it("removes grouped tutorial / search-coaching sentences", () => {
      const raw =
        "Delta State has varied terrain. For more information, check the official website. You can also visit their social media pages.";
      const out = stripMalvReliabilityEvasiveFallbackPhrasing(raw);
      expect(out.toLowerCase()).not.toMatch(/for more information/);
      expect(out.toLowerCase()).not.toMatch(/social media/);
      expect(out.toLowerCase()).not.toMatch(/official website/);
      expect(out).toMatch(/Delta State/i);
    });
  });

  describe("applyMalvReliabilityTextPolicy", () => {
    it("does not append duplicate local disclaimers when already hedged", () => {
      const assessment = assessMalvResponseReliability({
        userText: "is there a pharmacy near the central market?",
        declaredRoute: routeFor("is there a pharmacy near the central market?"),
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null
      });
      const reply = "Not verified: I do not have branch-level pharmacy data for that block.";
      const out = applyMalvReliabilityTextPolicy(reply, assessment);
      expect(out.split("not verified").length).toBeLessThanOrEqual(2);
    });
  });

  describe("applyMalvResponseReliabilityDeliveryPass", () => {
    it("strips evasive phrasing from final reply and records assessment on meta", () => {
      const userText = "latest ai news";
      const declared = routeFor(userText);
      const exec: MalvUniversalCapabilityExecutionResult = {
        ok: true,
        promptInjection: "",
        rich: {
          text: "",
          sources: []
        }
      };
      const res = applyMalvResponseReliabilityDeliveryPass({
        userText,
        declaredRoute: declared,
        execution: exec,
        reply: "Here is a summary. Search online for more headlines.",
        meta: { malvRichResponse: { text: "Here is a summary. Search online for more headlines.", sources: [] } }
      });
      expect(res.reply.toLowerCase()).not.toMatch(/search online/);
      expect(res.meta.malvReliabilityAssessment).toBeDefined();
    });
  });

  describe("clampMalvResponseConfidenceByTier", () => {
    it("caps confidence when ungrounded", () => {
      expect(clampMalvResponseConfidenceByTier(0.9, "ungrounded")).toBeLessThanOrEqual(0.44);
      expect(clampMalvResponseConfidenceByTier(0.9, "strongly_grounded")).toBe(0.9);
    });
  });

  describe("routing integration — representative prompts", () => {
    it("routes business existence toward retrieval-capable modes when not coding-dominant", () => {
      const r = routeFor("is there a supermarket chain in delta state?");
      expect(["web_research", "mixed_text_plus_sources", "mixed_text_plus_visual", "image_enrichment"]).toContain(
        r.responseMode
      );
    });
  });

  describe("hard clamp situation demand", () => {
    it("does not arm hard clamp for broad general-knowledge questions", () => {
      const userText = "Why is bitcoin so volatile lately?";
      const declared = routeFor(userText);
      expect(inferMalvHardClampSituationDemand(declared, userText)).toBe(false);
      const a = assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null
      });
      expect(a.hardClampSpeculativeFacts).toBe(false);
    });

    it("keeps general volatility phrasing when hard clamp is disarmed", () => {
      const userText = "Why is bitcoin so volatile lately?";
      const declared = routeFor(userText);
      void assessMalvResponseReliability({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        structuredSourceCount: 0,
        structuredImageCount: 0,
        rich: null
      });
      const reply = "Bitcoin is volatile because liquidity shifts quickly and sentiment moves the tape.";
      const out = applyMalvResponseReliabilityDeliveryPass({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        reply,
        meta: {}
      });
      expect(out.reply.toLowerCase()).toContain("bitcoin is volatile");
    });
  });

  describe("tier conversational tone", () => {
    it("does not inject fixed prefixes for partially grounded tiers (stream/final alignment)", () => {
      const body = "Water boils at 100 °C at sea level under standard pressure.";
      const out = applyMalvReliabilityTierConversationalTone(body, "partially_grounded", false);
      expect(out).toBe(body);
      expect(out.toLowerCase()).not.toMatch(/^typically, /);
    });

    it("does not inject fixed prefixes for weakly grounded tiers", () => {
      const body = "Water boils at 100 °C at sea level under standard pressure.";
      const out = applyMalvReliabilityTierConversationalTone(body, "weakly_grounded", false);
      expect(out).toBe(body);
      expect(out).not.toMatch(/in some cases/i);
    });

    it("does not inject fixed prefixes for ungrounded tiers", () => {
      const body = "Water boils at 100 °C at sea level under standard pressure.";
      const out = applyMalvReliabilityTierConversationalTone(body, "ungrounded", false);
      expect(out).toBe(body);
      expect(out.toLowerCase()).not.toMatch(/^in broad outline/);
    });

    it("strips redundant open hedges for strongly grounded tiers", () => {
      expect(applyMalvReliabilityTierConversationalTone("Typically, water boils at 100 °C at sea level.", "strongly_grounded", false)).toMatch(
        /^water boils at 100 °c at sea level\.$/i
      );
    });

    it("full delivery pass does not prepend tier openers for weak-tier business turns", () => {
      const userText = "is there a supermarket chain in delta state?";
      const declared = routeFor(userText);
      const reply = "Several large chains operate in urban centers; exact availability varies by town.";
      const out = applyMalvResponseReliabilityDeliveryPass({
        userText,
        declaredRoute: declared,
        execution: skippedExecution,
        reply,
        meta: {}
      });
      expect(["weakly_grounded", "ungrounded"]).toContain(out.assessment.tier);
      expect(out.reply).not.toMatch(/^In some cases/i);
      expect(out.reply).not.toMatch(/^Typically, /i);
      expect(out.reply).not.toMatch(/^In broad outline/i);
    });
  });

  describe("visual descriptive fallback snippet", () => {
    it("returns topic-aware prose for Delta State without mentioning photos", () => {
      const s = resolveMalvVisualDescriptiveFallbackSnippet("show me delta state");
      expect(s.toLowerCase()).toContain("mangrove");
      expect(s.toLowerCase()).not.toMatch(/photo|image|below/);
    });
  });
});

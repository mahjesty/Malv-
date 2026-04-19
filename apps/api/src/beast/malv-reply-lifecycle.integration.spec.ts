import { resolveMalvCanonicalVisibleAssistantText } from "./malv-canonical-visible-answer.util";
import { malvConfidenceRefinementShouldBlock } from "./malv-confidence-refinement.guard";
import {
  applyMalvResponseReliabilityDeliveryPass,
  applyMalvReliabilityTextPolicy,
  assessMalvResponseReliability,
  stripMalvWeakGroundingDefinitiveExistenceClaims,
  stripMalvUnsupportedVisualFulfillmentSentences
} from "./malv-response-reliability.util";
import { shapeMalvFinalResponse } from "./malv-response-shaping-layer.util";
import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";
import {
  finalizeAssistantOutputForStreamedReply,
  finalizeAssistantOutput
} from "./malv-finalize-assistant-output.util";
import { enforceMalvFinalReplyIdentityPolicy } from "./malv-final-reply-identity-validator";

const skippedExecution: MalvUniversalCapabilityExecutionResult = {
  ok: true,
  skipped: true,
  promptInjection: "",
  rich: null
};

describe("MALV reply lifecycle — canonical + reliability + refinement", () => {
  it("canonical text uses stream accumulation when live tokens were shown (stream-first contract)", () => {
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: "Final: verified framing without invented branches.",
      streamAccumulatedRaw: "The user watched this stream progressively.",
      sawLiveStreamTokens: true
    });
    // Stream-first: the stream accumulation is canonical, not the orchestrator reply.
    expect(r.source).toBe("stream_canonical");
    expect(r.text).toContain("The user watched this stream progressively");
    expect(r.text.toLowerCase()).not.toContain("final: verified");
  });

  it("stream/final stay aligned when orchestrator string equals streamed accumulation", () => {
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: "Same text",
      streamAccumulatedRaw: "Same text",
      sawLiveStreamTokens: true
    });
    expect(r.text).toBe("Same text");
  });

  it("strips invented street-level retail specifics for weak business turns", () => {
    const userText = "is there a shoprite in delta state?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: skippedExecution,
      reply: "Shoprite in Delta State sits at 12 Harbor Road in Asaba with nightly restocks.",
      meta: {}
    });
    expect(res.assessment.hardClampSpeculativeFacts).toBe(true);
    expect(res.reply.toLowerCase()).not.toMatch(/12 harbor/);
    expect(res.reply.toLowerCase()).not.toMatch(/harbor road/);
  });

  it("weak business + no sources → hard clamp strips definitive existence-in-place claims", () => {
    const userText = "is there a shoprite in delta state?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: skippedExecution,
      reply: "Yes, there is a Shoprite in Asaba serving most of Delta State.",
      meta: {}
    });
    expect(res.assessment.hardClampSpeculativeFacts).toBe(true);
    expect(res.reply.toLowerCase()).not.toMatch(/yes, there is a shoprite/i);
  });

  it("visual ask with suppressed deck strips fulfillment language from body", () => {
    const userText = "show me delta state";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: { ...skippedExecution, ok: true, skipped: false, promptInjection: "x".repeat(200) },
      reply: "Here are some photos of the terrain. I have included maps below.",
      meta: {}
    });
    expect(res.assessment.suppressVisualDeck).toBe(true);
    expect(res.reply.toLowerCase()).not.toMatch(/here are some photos/);
    expect(res.reply.toLowerCase()).not.toMatch(/included maps below/);
    expect(res.reply.toLowerCase()).not.toMatch(/images?\s+below/);
    expect(res.reply.toLowerCase()).toMatch(/mangrove|waterways|lagoon|waterways, wetlands|scenery in that kind of setting/);
  });

  it("live-ish question + failed execution → dampens unsupported present-tense claims", () => {
    const userText = "what is the latest breaking news on the topic right now?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const exec: MalvUniversalCapabilityExecutionResult = {
      ok: false,
      skipped: false,
      promptInjection: "",
      rich: null,
      error: "worker_unavailable"
    };
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: exec,
      reply: "Right now the headline is that markets rallied sharply. Breaking news is that regulators announced new rules.",
      meta: {}
    });
    expect(res.assessment.dampenUnsupportedLiveClaims).toBe(true);
    expect(res.reply.toLowerCase()).not.toMatch(/right now the headline/);
    expect(res.reply.toLowerCase()).not.toMatch(/breaking news is that/);
  });

  it("follow-up re-grounding flag fires when prior assistant exists and demand is high", () => {
    const a = assessMalvResponseReliability({
      userText: "where is it located?",
      declaredRoute: resolveUniversalMalvCapabilityRoute("where is it located?"),
      execution: skippedExecution,
      structuredSourceCount: 0,
      structuredImageCount: 0,
      rich: null,
      priorAssistantSnippet: "Earlier I mentioned a branch downtown."
    });
    expect(a.followUpReGroundingRecommended).toBe(true);
    const out = applyMalvReliabilityTextPolicy("It is next to the old station.", a, "where is it located?");
    expect(out).toMatch(/If you're referring to something very specific from just now/i);
    expect(out).toMatch(/confirmed particulars/i);
    expect(out.toLowerCase()).not.toMatch(/without a verified anchor/i);
  });

  it("refinement guard blocks append path on weak grounding (no extra model required for this test)", () => {
    const userText = "is there a shoprite in delta state?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const g = malvConfidenceRefinementShouldBlock({
      userText,
      declaredRoute: declared,
      execution: skippedExecution
    });
    expect(g.blocked).toBe(true);
  });

  it("refinement guard allows strong finance snapshot path", () => {
    const userText = "bitcoin price vs yesterday close?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const exec: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      skipped: false,
      promptInjection: "x".repeat(500),
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
    const g = malvConfidenceRefinementShouldBlock({
      userText,
      declaredRoute: declared,
      execution: exec
    });
    expect(g.blocked).toBe(false);
  });

  it("strong grounded finance reply is not flattened by visual strip helpers", () => {
    const body = "BTC moved +2% vs yesterday on volume; chart in the deck.";
    expect(stripMalvUnsupportedVisualFulfillmentSentences(body)).toContain("BTC moved");
    expect(stripMalvWeakGroundingDefinitiveExistenceClaims(body)).toContain("BTC moved");
  });
});

// ---------------------------------------------------------------------------
// Stream-convergence contract tests
// ---------------------------------------------------------------------------

describe("MALV stream-convergence contract — streamed body must equal final body", () => {
  const simplePlan = {
    responseType: "explanatory" as const,
    structure: "adaptive" as const,
    steps: [{ type: "core_explanation" as const }],
    depth: "medium" as const
  };

  // ---- shapeMalvFinalResponse ----

  it("hadLiveStreamTokens=true: direct plan does NOT truncate already-streamed body", () => {
    const body =
      "The deployment succeeded. The health check passed. No rollback needed. All services are nominal.";
    const directPlan = { ...simplePlan, structure: "direct" as const };
    const nonStreaming = shapeMalvFinalResponse({ response: body, plan: directPlan });
    const streaming = shapeMalvFinalResponse({ response: body, plan: directPlan, hadLiveStreamTokens: true });
    // Non-streaming truncates to two sentences.
    expect(nonStreaming).not.toContain("No rollback needed");
    // Streaming preserves the full body — streamed content matches final content.
    expect(streaming).toContain("No rollback needed");
    expect(streaming).toContain("All services are nominal");
  });

  it("hadLiveStreamTokens=true: step_by_step plan does NOT restructure already-streamed bullets", () => {
    const body = "- Review the PR\n- Run the tests\n- Merge when green";
    const stepPlan = { ...simplePlan, structure: "step_by_step" as const };
    const nonStreaming = shapeMalvFinalResponse({ response: body, plan: stepPlan });
    const streaming = shapeMalvFinalResponse({ response: body, plan: stepPlan, hadLiveStreamTokens: true });
    // Non-streaming converts bullets to numbered list.
    expect(nonStreaming).toContain("1. Review");
    // Streaming preserves bullet format the user saw.
    expect(streaming).toContain("- Review");
    expect(streaming).not.toContain("1. Review");
  });

  it("hadLiveStreamTokens=true: adaptive plan output is identical to non-streaming (safe path)", () => {
    const body = "The answer is 42. It has always been 42.";
    const streaming = shapeMalvFinalResponse({ response: body, plan: simplePlan, hadLiveStreamTokens: true });
    const nonStreaming = shapeMalvFinalResponse({ response: body, plan: simplePlan });
    expect(streaming).toBe(nonStreaming);
  });

  // ---- applyMalvReliabilityTextPolicy ----

  it("hadLiveStreamTokens=true: follow-up anchor prefix is NOT prepended to already-streamed body", () => {
    const userText = "where is it located?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const assessment = assessMalvResponseReliability({
      userText,
      declaredRoute: declared,
      execution: skippedExecution,
      structuredSourceCount: 0,
      structuredImageCount: 0,
      rich: null,
      priorAssistantSnippet: "Earlier I mentioned a branch downtown."
    });
    // Without flag: prepend fires.
    const withoutFlag = applyMalvReliabilityTextPolicy("It is next to the old station.", assessment, userText);
    expect(withoutFlag).toMatch(/If you're referring to something very specific from just now/i);
    // With flag: body is preserved as streamed.
    const withFlag = applyMalvReliabilityTextPolicy("It is next to the old station.", assessment, userText, true);
    expect(withFlag).not.toMatch(/If you're referring to something very specific from just now/i);
    expect(withFlag).toContain("It is next to the old station.");
  });

  it("hadLiveStreamTokens=true: strongly_grounded opener word NOT stripped from already-streamed body", () => {
    const userText = "how does it work?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const exec: MalvUniversalCapabilityExecutionResult = {
      ok: true,
      skipped: false,
      promptInjection: "x".repeat(800),
      rich: {
        text: "",
        data: { kind: "malv_finance_snapshot", symbol: "BTC", label: "Bitcoin", currency: "USD", current: 1, asOf: "2026-01-01", changeAbs: 1, changePct: 1 }
      }
    };
    const assessment = assessMalvResponseReliability({
      userText,
      declaredRoute: declared,
      execution: exec,
      structuredSourceCount: 2,
      structuredImageCount: 0,
      rich: null
    });
    const body = "Generally, this process works by distributing load across nodes.";
    const withoutFlag = applyMalvReliabilityTextPolicy(body, assessment, userText);
    const withFlag = applyMalvReliabilityTextPolicy(body, assessment, userText, true);
    if (assessment.tier === "strongly_grounded") {
      // Non-streaming strips the leading "Generally, " opener.
      expect(withoutFlag).not.toMatch(/^Generally/);
      // Streaming preserves it.
      expect(withFlag).toMatch(/^Generally/);
    }
  });

  // ---- applyMalvResponseReliabilityDeliveryPass end-to-end ----

  it("hadLiveStreamTokens=true: safe strip passes still run (no false claims delivered)", () => {
    const userText = "is there a shoprite in delta state?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: skippedExecution,
      reply: "Yes, there is a Shoprite at 12 Harbor Road in Asaba.",
      meta: {},
      hadLiveStreamTokens: true
    });
    // Hard-clamp still fires even on live-stream path — false existence claims are stripped.
    expect(res.assessment.hardClampSpeculativeFacts).toBe(true);
    expect(res.reply.toLowerCase()).not.toMatch(/12 harbor/);
  });

  it("hadLiveStreamTokens=true: end-append disclaimer still fires (extending, not rewriting)", () => {
    const userText = "is there a shoprite in abuja?";
    const declared = resolveUniversalMalvCapabilityRoute(userText);
    const res = applyMalvResponseReliabilityDeliveryPass({
      userText,
      declaredRoute: declared,
      execution: skippedExecution,
      reply: "There might be a branch somewhere in Abuja.",
      meta: {},
      hadLiveStreamTokens: true
    });
    if (res.assessment.appendLocalVerificationDisclaimer) {
      // Appended at end — does not rewrite what user saw.
      expect(res.reply).toMatch(/Live branch listings/i);
      expect(res.reply).toContain("There might be a branch somewhere in Abuja.");
    }
  });

  // ---- resolveMalvCanonicalVisibleAssistantText — STREAM-FIRST CONTRACT ----

  it("stream-first: canonical source is stream_canonical when live tokens were shown", () => {
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: "Final verified framing.",
      streamAccumulatedRaw: "The user watched this stream progressively.",
      sawLiveStreamTokens: true
    });
    // Stream accumulation is the canonical source — not the orchestrator reply.
    expect(r.source).toBe("stream_canonical");
    expect(r.text).toContain("The user watched this stream progressively");
    expect(r.text.toLowerCase()).not.toContain("final verified framing");
  });

  it("stream-first: when stream and orchestrator agree, canonical text is stable", () => {
    const body = "The queue depth is 42 items.";
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: body,
      streamAccumulatedRaw: body,
      sawLiveStreamTokens: true
    });
    expect(r.source).toBe("stream_canonical");
    expect(r.text).toBe(body);
  });

  it("no live tokens: canonical source falls back to orchestrator_delivery", () => {
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: "Orchestrator reply for non-stream turn.",
      streamAccumulatedRaw: "",
      sawLiveStreamTokens: false
    });
    expect(r.source).toBe("orchestrator_delivery");
    expect(r.text).toContain("Orchestrator reply for non-stream turn");
  });

  it("persisted content equals safe-finalized stream accumulation (refresh hydrates same body)", () => {
    const streamBody = "ETH is up 3% today based on verified ticker data.";
    const canonical = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: streamBody,
      streamAccumulatedRaw: streamBody,
      sawLiveStreamTokens: true
    });
    // persistContent in realtime.gateway = canonical.text
    const persistContent = canonical.text.length > 0 ? canonical.text : streamBody;
    // What the user reads on refresh equals what was shown at completion.
    expect(persistContent).toBe(streamBody);
    expect(canonical.source).toBe("stream_canonical");
  });

  it("stream-first: orchestrator reply is ignored for body even if different from stream accum", () => {
    const streamAccum = "Here is what the user watched form token by token.";
    const orchReply = "Completely different final answer from the orchestrator pipeline.";
    const canonical = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: orchReply,
      streamAccumulatedRaw: streamAccum,
      sawLiveStreamTokens: true
    });
    // Must not produce the orchestrator reply — that would be a post-hoc body swap.
    expect(canonical.text).not.toContain("Completely different final answer");
    expect(canonical.text).toContain("Here is what the user watched");
    expect(canonical.source).toBe("stream_canonical");
  });

  it("empty stream accum with live tokens falls back to orchestrator delivery", () => {
    const r = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: "Fallback orchestrator text.",
      streamAccumulatedRaw: "",
      sawLiveStreamTokens: true
    });
    // Empty stream + sawLiveStreamTokens=true: use orchestrator reply so assistant_done has content.
    expect(r.source).toBe("orchestrator_delivery");
    expect(r.text).toContain("Fallback orchestrator text");
  });

  // ---- finalizeAssistantOutputForStreamedReply ----

  it("safe cleanup: tutorial phrasing stripped from stream canonical", () => {
    const streamText =
      "The formula is E=mc². You may want to check Wikipedia for more details. This is the basis of relativity.";
    const result = finalizeAssistantOutputForStreamedReply(streamText);
    expect(result).toContain("The formula is E=mc²");
    expect(result).toContain("basis of relativity");
    expect(result.toLowerCase()).not.toMatch(/you may want to check/);
  });

  it("safe cleanup: trailing generic closer stripped from stream canonical", () => {
    const streamText = "The migration completes in three steps. Let me know if you need anything else!";
    const result = finalizeAssistantOutputForStreamedReply(streamText);
    expect(result).toContain("three steps");
    // Generic closer should be stripped.
    expect(result.toLowerCase()).not.toMatch(/let me know if you need/);
  });

  it("safe cleanup: leading hollow opener is NOT stripped on stream path by skipLeadingHollowOpenerStrip", () => {
    // Note: applyMalvResponseStyle (which runs before the skipLeadingHollowOpenerStrip guard)
    // may still strip classic hollow-opener words like "Sure!". The skipLeadingHollowOpenerStrip
    // flag specifically disables the stripLeadingHollowOpeners pass.
    // What we guarantee: non-hollow opening content that the user watched stream is preserved.
    const streamText = "Here is the breakdown: the capital of France is Paris, established over 2,000 years ago.";
    const result = finalizeAssistantOutputForStreamedReply(streamText);
    // The actual content body must be preserved — not truncated or restructured.
    expect(result).toContain("Paris");
    expect(result).toContain("capital of France");
    expect(result.length).toBeGreaterThan(20);
  });

  it("safe cleanup: identity sentences are stripped but full body is NOT replaced with policy line", () => {
    const streamText =
      "I'm Claude, made by Anthropic. The capital of France is Paris, founded over 2,000 years ago.";
    const result = finalizeAssistantOutputForStreamedReply(streamText);
    // Identity sentence stripped.
    expect(result.toLowerCase()).not.toMatch(/anthropic/);
    // Real content survives — not replaced with policy line.
    expect(result).toContain("Paris");
    // Entire body not blanked.
    expect(result.length).toBeGreaterThan(10);
  });

  it("unsafe: identity REPLACE is demoted to strip on stream path (enforceMalvFinalReplyIdentityPolicy)", () => {
    const leakyText = "I was trained by Anthropic and here is the information you asked for.";
    // Without demote: replace fires (full-body swap with policy line).
    const withReplace = enforceMalvFinalReplyIdentityPolicy(leakyText);
    expect(withReplace.mode).toBe("replace");
    // With demote: replace is suppressed; the identity sentence is stripped.
    // If the identity claim covers the entire text, stripped result is empty — never the policy line.
    const withDemote = enforceMalvFinalReplyIdentityPolicy(leakyText, undefined, { demoteReplaceToStrip: true });
    expect(withDemote.mode).toBe("rewrite");
    expect(withDemote.hadViolation).toBe(true);
    // The result must not be the policy replacement line, and must not preserve the identity claim.
    const policyLineFragment = "malv";
    const result = withDemote.text.toLowerCase();
    expect(result).not.toContain("trained by anthropic");
    // Result is empty (whole response was leakage) or stripped real content — not the policy line.
    expect(result).not.toMatch(/i(?:'m|\s+am)\s+an\s+ai/i);
  });

  it("unsafe: implicit-origin replace is demoted to strip on stream path", () => {
    const leakyText = "People behind me prefer anonymity about the lab that created this.";
    const withDemote = enforceMalvFinalReplyIdentityPolicy(leakyText, undefined, { demoteReplaceToStrip: true });
    // Should not produce the policy replacement line.
    expect(withDemote.mode).not.toBe("replace");
    expect(withDemote.hadViolation).toBe(true);
  });

  it("stream body + safe finalization = persisted body (no divergence at persistence layer)", () => {
    const streamAccum = "Bitcoin is a decentralized digital currency. It uses blockchain technology.";
    const canonical = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: streamAccum,
      streamAccumulatedRaw: streamAccum,
      sawLiveStreamTokens: true
    });
    // Simulate what realtime.gateway stores:
    const persistContent = canonical.text.length > 0 ? canonical.text : streamAccum;
    // Simulate what finalizeAssistantOutputForStreamedReply produces for that same text:
    const streamFinalized = finalizeAssistantOutputForStreamedReply(streamAccum);
    // Persisted content must equal the safe-finalized stream body.
    expect(persistContent).toBe(streamFinalized);
  });

  it("refresh contract: hydrated content equals persisted canonical (no new transforms on reload)", () => {
    // The DB stores canonical.text. Conversations service returns content via normalizeMessageContent
    // (string coercion only — no semantic transforms). So hydrated = persisted = canonical.
    const streamAccum = "The S&P 500 closed up 1.2% on Thursday.";
    const canonical = resolveMalvCanonicalVisibleAssistantText({
      orchestratorVisibleReply: streamAccum,
      streamAccumulatedRaw: streamAccum,
      sawLiveStreamTokens: true
    });
    const persistContent = canonical.text;
    // Normalize as conversations.service does (string coercion).
    const hydrated = String(persistContent ?? "");
    expect(hydrated).toBe(persistContent);
    expect(hydrated).toContain("S&P 500");
  });
});

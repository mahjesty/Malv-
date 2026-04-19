/**
 * Universal, deterministic response reliability / grounding control for MALV chat delivery.
 * No extra model calls — uses routing, execution outcome, retrieval bundle strength, and structured rich counts.
 */

import type { MalvUniversalCapabilityRoute } from "./malv-universal-capability-router.util";
import type { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";
import type { MalvRichMediaCard, MalvRichResponse } from "./malv-rich-response.types";
import {
  stripMalvImagePresenceMetaCommentary,
  stripMalvTutorialGuidancePhrasing
} from "./malv-reply-behavior-postprocess.util";

export type MalvGroundingTier = "strongly_grounded" | "partially_grounded" | "weakly_grounded" | "ungrounded";

export type MalvReliabilityAssessment = {
  tier: MalvGroundingTier;
  /** 0–1 synthesized evidence strength for this turn. */
  evidenceScore: number;
  /** 0–1 how strongly this question class calls for external verification. */
  verifierDemandScore: number;
  /** Compact machine-readable reasons for trace / debugging. */
  signalCodes: string[];
  suppressVisualDeck: boolean;
  suppressSourceChrome: boolean;
  stripExecutionLeadIn: boolean;
  followUpReGroundingRecommended: boolean;
  forbidTutorialFallback: boolean;
  appendLocalVerificationDisclaimer: boolean;
  /** Deterministic strip of over-definitive place/existence sentences without sources. */
  hardClampSpeculativeFacts: boolean;
  /** Short descriptive body line when visuals were expected but curated images are absent. */
  appendVisualExpectationDescriptiveFallback: boolean;
  /** Strip “live/current” factual narration when execution failed or evidence is negligible. */
  dampenUnsupportedLiveClaims: boolean;
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function dim(route: MalvUniversalCapabilityRoute, key: keyof MalvUniversalCapabilityRoute["dimensionScores"]): number {
  return clamp01((route.dimensionScores[key] ?? 0) / 4);
}

/**
 * Hard “existence / address / branch” clamps should run only when the question is **situation-specific**
 * (places, branches, streets, coordinates), not for broad general-knowledge turns.
 */
export function inferMalvHardClampSituationDemand(route: MalvUniversalCapabilityRoute, userText: string): boolean {
  const m = (userText ?? "").trim();
  if (!m) return false;
  if (inferMalvBusinessPlaceVerifierDemand(m) >= 0.38) return true;
  if (
    /\b(at\s+\d|street|st\.|avenue|ave\.|boulevard|blvd\.|road\b|highway\b|route\s+\d|coordinates?\b|latitude|longitude|exact\s+address|located\s+at\s+\d|which\s+branch|branch\s+(?:hours|location))\b/i.test(
      m
    )
  )
    return true;
  const loc = dim(route, "location_lookup");
  const ent = dim(route, "entity_lookup");
  return loc >= 0.55 && ent >= 0.35;
}

export function inferMalvBusinessPlaceVerifierDemand(userText: string): number {
  const m = (userText ?? "").toLowerCase();
  let s = 0;
  if (/\b(is there|are there|is\s+\S+\s+in|does\s+.+\s+exist|exist in|exists in|any\s+\S+\s+near|near me|closest|nearest)\b/i.test(m))
    s += 0.45;
  if (/\b(branch|branches|franchise|chain store|retailer|supermarket|mall|store hours|opening hours|open now|closed on)\b/i.test(m))
    s += 0.35;
  if (/\b(where is it|where are they|what'?s the address|located in|location of|in\s+.{2,40}\s+state)\b/i.test(m))
    s += 0.3;
  if (/\b(shop|restaurant|cafe|pharmacy|bank|hospital|airport|station)\b/i.test(m) && /\b(where|near|in|address|branch)\b/i.test(m))
    s += 0.2;
  return clamp01(s);
}

export function inferMalvVisualVerifierDemand(route: MalvUniversalCapabilityRoute, userText: string): number {
  const fromRoute = clamp01(
    (route.dimensionScores.visual_lookup ?? 0) / 4 + (route.dimensionScores.image_enrichment_helpful ?? 0) / 8
  );
  const m = (userText ?? "").toLowerCase();
  const fromText =
    /\b(show me|photos? of|pictures? of|images? of|what does .{1,50} look like|logo|appearance|visual reference)\b/i.test(m)
      ? 0.55
      : 0;
  return clamp01(Math.max(fromRoute, fromText, route.imageEnrichmentRecommended ? 0.35 : 0));
}

function inferMalvFollowUpShape(userText: string): boolean {
  const t = (userText ?? "").trim();
  if (t.length > 140) return false;
  if (/^(is there|are there)\b/i.test(t)) return false;
  if (/^(and|also|what about|how about|same for|that one|this one|there|it)\b/i.test(t)) return true;
  if (/\b(where is it|where are they|show me that|the beaches|the rivers|is it open)\b/i.test(t.toLowerCase())) return true;
  if (/\b(it|that|this|they|there)\b/i.test(t.toLowerCase()) && t.length < 72) return true;
  return false;
}

function financeSnapshotPresent(rich: MalvRichResponse | null | undefined): boolean {
  if (!rich?.data || typeof rich.data !== "object") return false;
  const d = rich.data as { finance?: { kind?: string }; kind?: string };
  if (d.kind === "malv_finance_snapshot") return true;
  return d.finance?.kind === "malv_finance_snapshot";
}

function researchBundlePresent(rich: MalvRichResponse | null | undefined): { ok: boolean; keyFactCount: number } {
  if (!rich?.data || typeof rich.data !== "object") return { ok: false, keyFactCount: 0 };
  const d = rich.data as {
    research?: { kind?: string; keyFacts?: unknown[] };
    kind?: string;
    keyFacts?: unknown[];
  };
  const bundle =
    d.kind === "malv_web_research_bundle"
      ? d
      : d.research?.kind === "malv_web_research_bundle"
        ? d.research
        : null;
  if (!bundle) return { ok: false, keyFactCount: 0 };
  const kf = Array.isArray(bundle.keyFacts) ? bundle.keyFacts.filter((x) => String(x).trim().length > 0) : [];
  return { ok: true, keyFactCount: kf.length };
}

function chartInMedia(media: MalvRichMediaCard[] | undefined): boolean {
  return Boolean(media?.some((c) => c.kind === "chart"));
}

function computeEvidenceScore(args: {
  execution: MalvUniversalCapabilityExecutionResult;
  injectionChars: number;
  structuredSourceCount: number;
  structuredImageCount: number;
  researchKeyFactCount: number;
  financePresent: boolean;
  chartPresent: boolean;
}): number {
  const { execution, injectionChars, structuredSourceCount, structuredImageCount, researchKeyFactCount, financePresent, chartPresent } =
    args;
  if (execution.skipped || !execution.ok) return execution.skipped ? 0.12 : 0.04;

  let score = 0;
  score += clamp01(injectionChars / 1400) * 0.38;
  score += clamp01(structuredSourceCount / 4) * 0.34;
  score += clamp01(structuredImageCount / 3) * 0.22;
  score += clamp01(researchKeyFactCount / 5) * 0.2;
  if (financePresent) score += 0.42;
  if (chartPresent) score += 0.18;
  return clamp01(score);
}

function computeVerifierDemandScore(route: MalvUniversalCapabilityRoute, userText: string): number {
  const live = dim(route, "live_information");
  const recent = dim(route, "recent_information");
  const sources = dim(route, "source_required");
  const loc = dim(route, "location_lookup");
  const entity = dim(route, "entity_lookup");
  const finance = dim(route, "financial_data");
  const visual = inferMalvVisualVerifierDemand(route, userText);
  const business = inferMalvBusinessPlaceVerifierDemand(userText);

  const base = Math.max(live * 0.95 + recent * 0.9, sources * 0.85, loc * 0.88 + entity * 0.35, business, finance * 0.55, visual * 0.75);
  return clamp01(base);
}

function mapTier(evidence: number, demand: number): MalvGroundingTier {
  const margin = evidence - demand;
  if (evidence >= 0.58 && margin >= -0.02) return "strongly_grounded";
  if (evidence >= 0.34 && margin >= -0.28) return "partially_grounded";
  if (evidence >= 0.14 || margin >= -0.55) return "weakly_grounded";
  return "ungrounded";
}

/**
 * Deterministic grounding tier and delivery flags from execution + structured payload + question shape.
 */
export function assessMalvResponseReliability(args: {
  userText: string;
  declaredRoute: MalvUniversalCapabilityRoute;
  execution: MalvUniversalCapabilityExecutionResult;
  structuredSourceCount: number;
  structuredImageCount: number;
  rich: MalvRichResponse | null | undefined;
  priorUserText?: string | null;
  priorAssistantSnippet?: string | null;
}): MalvReliabilityAssessment {
  const signalCodes: string[] = [];
  const userText = args.userText ?? "";
  const { declaredRoute: route, execution } = args;
  const inj = (execution.promptInjection ?? "").trim();
  const research = researchBundlePresent(args.rich);
  const financeOk = financeSnapshotPresent(args.rich);
  const finData = args.rich?.data as { finance?: { chartSeries?: unknown[] } } | undefined;
  const chartOk =
    chartInMedia(args.rich?.media) ||
    Boolean(finData?.finance && Array.isArray(finData.finance.chartSeries) && finData.finance.chartSeries.length > 0);

  const evidenceScore = computeEvidenceScore({
    execution,
    injectionChars: inj.length,
    structuredSourceCount: args.structuredSourceCount,
    structuredImageCount: args.structuredImageCount,
    researchKeyFactCount: research.keyFactCount,
    financePresent: financeOk,
    chartPresent: chartOk
  });

  const verifierDemandScore = computeVerifierDemandScore(route, userText);
  let tier = mapTier(evidenceScore, verifierDemandScore);

  if (route.responseMode === "finance_data" && financeOk && execution.ok && !execution.skipped) {
    tier = "strongly_grounded";
    signalCodes.push("finance_snapshot_lock");
  }
  if (route.responseMode === "plain_model" && inj.length === 0 && verifierDemandScore >= 0.55) {
    signalCodes.push("plain_high_demand");
  }
  if (inj.length > 0) signalCodes.push("has_prompt_injection");
  if (args.structuredSourceCount > 0) signalCodes.push("has_structured_sources");
  if (args.structuredImageCount > 0) signalCodes.push("has_structured_images");

  const visualDemand = inferMalvVisualVerifierDemand(route, userText);
  const suppressVisualDeck =
    visualDemand >= 0.42 &&
    args.structuredImageCount < 1 &&
    !chartOk &&
    (route.responseMode === "image_enrichment" || route.responseMode === "mixed_text_plus_visual" || visualDemand >= 0.55);

  const appendVisualExpectationDescriptiveFallback =
    suppressVisualDeck && args.structuredImageCount < 1 && visualDemand >= 0.42 && !chartOk;
  if (appendVisualExpectationDescriptiveFallback) signalCodes.push("visual_descriptive_fallback_candidate");

  const suppressSourceChrome =
    tier === "ungrounded" ||
    (tier === "weakly_grounded" && args.structuredSourceCount < 1 && verifierDemandScore >= 0.45);

  const stripExecutionLeadIn =
    tier === "weakly_grounded" || tier === "ungrounded" || (tier === "partially_grounded" && args.structuredSourceCount < 1 && inj.length < 200);

  const followUp = inferMalvFollowUpShape(userText);
  const hasPrior = Boolean((args.priorAssistantSnippet ?? "").trim().length);
  const followUpReGroundingRecommended =
    followUp &&
    hasPrior &&
    verifierDemandScore >= 0.42 &&
    (tier === "weakly_grounded" || tier === "ungrounded" || (tier === "partially_grounded" && args.structuredSourceCount < 1));

  if (followUpReGroundingRecommended) signalCodes.push("follow_up_weak_anchor");

  const forbidTutorialFallback = tier === "weakly_grounded" || tier === "ungrounded" || verifierDemandScore >= 0.5;

  const businessDemand = inferMalvBusinessPlaceVerifierDemand(userText);
  const appendLocalVerificationDisclaimer =
    businessDemand >= 0.45 &&
    (tier === "weakly_grounded" || tier === "ungrounded") &&
    !(route.responseMode === "web_research" && args.structuredSourceCount >= 1);

  if (appendLocalVerificationDisclaimer) signalCodes.push("local_disclaimer_candidate");

  const liveDim = dim(route, "live_information");
  const hardClampSpeculativeFacts =
    (tier === "ungrounded" || tier === "weakly_grounded") && inferMalvHardClampSituationDemand(route, userText);
  if (hardClampSpeculativeFacts) signalCodes.push("hard_clamp_speculative_facts");

  const dampenUnsupportedLiveClaims =
    (tier === "ungrounded" || tier === "weakly_grounded") &&
    (execution.skipped || !execution.ok || evidenceScore < 0.14) &&
    (liveDim >= 0.42 || /\b(currently|latest|right now|today|breaking|this minute|as we speak)\b/i.test(userText));
  if (dampenUnsupportedLiveClaims) signalCodes.push("dampen_live_present_claims");

  return {
    tier,
    evidenceScore,
    verifierDemandScore,
    signalCodes,
    suppressVisualDeck,
    suppressSourceChrome,
    stripExecutionLeadIn,
    followUpReGroundingRecommended,
    forbidTutorialFallback,
    appendLocalVerificationDisclaimer,
    hardClampSpeculativeFacts,
    appendVisualExpectationDescriptiveFallback,
    dampenUnsupportedLiveClaims
  };
}

/**
 * Single-pass removal of low-signal “go look elsewhere” coaching (grouped patterns, not per-phrase hacks).
 */
export function stripMalvReliabilityEvasiveFallbackPhrasing(text: string): string {
  let out = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n");
  const blocks: RegExp[] = [
    /\bfor more information\b[^.!?\n]*[.!?]?/gi,
    /\bfor further details\b[^.!?\n]*[.!?]?/gi,
    /\bcheck (?:the |their |its )?(?:official )?website\b[^.!?\n]*[.!?]?/gi,
    /\bvisit (?:the |their |its )?(?:official )?website\b[^.!?\n]*[.!?]?/gi,
    /\bvisit (?:their|the|its)\s+social\b[^.!?\n]*[.!?]?/gi,
    /\bsocial media (?:pages|accounts|profiles)\b[^.!?\n]*[.!?]?/gi,
    /\byou can (?:also )?check\b[^.!?\n]*(?:online|on\s+the\s+web|the\s+website|social)[^.!?\n]*[.!?]?/gi,
    /\byou may (?:also )?wish to (?:check|visit|review)\b[^.!?\n]*[.!?]?/gi,
    /\bsearch online (?:for)?\b[^.!?\n]*[.!?]?/gi,
    /\blook (?:it )?up online\b[^.!?\n]*[.!?]?/gi,
    /\bdo a (?:quick )?search\b[^.!?\n]*[.!?]?/gi,
    /\bgoogle (?:it|this|that)\b[^.!?\n]*[.!?]?/gi
  ];
  for (const re of blocks) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

function replyAlreadyAcknowledgesVerificationGap(text: string): boolean {
  return /\b(not verified|haven'?t verified|cannot verify|can'?t verify|without a verified|no verified|not sourced|unsourced|don'?t have (?:reliable\s+)?information|confirmed details|confirmed particulars|hasn'?t been clearly established)\b/i.test(
    text
  );
}

function maybeAppendLocalDisclaimer(reply: string, assessment: MalvReliabilityAssessment): string {
  if (!assessment.appendLocalVerificationDisclaimer) return reply;
  if (replyAlreadyAcknowledgesVerificationGap(reply)) return reply;
  const note =
    "Live branch listings, exact addresses, and hours are not verified from an authoritative directory on this turn.";
  const trimmed = reply.trim();
  if (!trimmed) return note;
  if (trimmed.toLowerCase().includes(note.slice(0, 24).toLowerCase())) return reply;
  return `${trimmed}\n\n${note}`;
}

function maybePrefixFollowUpAnchor(reply: string, assessment: MalvReliabilityAssessment): string {
  if (!assessment.followUpReGroundingRecommended) return reply;
  if (replyAlreadyAcknowledgesVerificationGap(reply)) return reply;
  const t = reply.trim();
  if (!t) return reply;
  const prefix = "If you're referring to something very specific from just now, I don't have confirmed particulars on that—";
  if (/\bif you'?re referring to something very specific from just now\b/i.test(t)) return reply;
  return `${prefix}${t}`;
}

/**
 * Remove prose that implies images/maps were delivered when the visual deck is suppressed.
 */
export function stripMalvUnsupportedVisualFulfillmentSentences(text: string): string {
  let out = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n");
  const hunks: RegExp[] = [
    /\bI(?:'ve| have)\s+(?:included|attached|added|prepared)\s+(?:some\s+)?(?:the\s+)?(?:photos?|images?|pictures?|maps?|visuals?)\b[^.!?\n]*[.!?]?/gi,
    /\bhere\s+(?:are|is)\s+(?:some\s+)?(?:photos?|images?|pictures?|maps?|visuals?)\b[^.!?\n]*[.!?]?/gi,
    /\bbelow\s+(?:you(?:'ll)?\s+)?(?:can\s+)?see\s+(?:the\s+)?(?:map|image|photo|chart|visual)\b[^.!?\n]*[.!?]?/gi,
    /\bthe\s+(?:following\s+)?(?:images?|photos?|maps?)\s+(?:show|illustrate|depict)\b[^.!?\n]*[.!?]?/gi
  ];
  for (const re of hunks) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Strip common over-definitive “existence in geography” claims when the turn is not sourced.
 */
export function stripMalvWeakGroundingDefinitiveExistenceClaims(text: string): string {
  let out = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n");
  const genericGeoOrMassNoun =
    "rivers?|lakes?|forests?|beaches?|coasts?|coastal|waterways?|waterway|mangroves?|wetlands?|wetland|mountains?|valleys?|deltas?|terrain|landscapes?|scenery|vegetation|climate|population|economy|wildlife|bayous?|swamps?|plains?|plateaus?|creeks?|streams?|gulfs?|seas?|oceans?|markets?|towns?|cities?|villages?|settlements?|farmland|agriculture|highways?|bridges?|parks?|schools?|universities?|hospitals?|stations?|airports?|ports?|harbors?|piers?|docks?|locals?|residents?|communities?|neighborhoods?|districts?|regions?|provinces?|states?|counties?|municipalities?";
  const hunks: RegExp[] = [
    new RegExp(
      `\\b(?:yes[,!]?\\s+)?there\\s+is\\s+(?:a|an|the)\\s+(?!${genericGeoOrMassNoun}\\b)([\\w' &-]{2,55})\\s+(?:in|at|inside|near)\\s+[A-Za-z0-9,' .-]{3,90}\\b[^.!?\\n]*[.!?]?`,
      "gi"
    ),
    /\bthe\s+(?:shop|store|branch|mall|location)\s+is\s+(?:located|situated)\s+(?:at|in)\b[^.!?\n]*[.!?]?/gi,
    /\bexact\s+address\s+is\b[^.!?\n]*[.!?]?/gi,
    /\bshoprite\b[^.!?\n]{0,220}\b(?:at|on)\s+\d[^.!?\n]{0,120}\b(?:street|st\.|road|rd\.|avenue|ave\.)\b[^.!?\n]*[.!?]?/gi
  ];
  for (const re of hunks) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * When live-ish questions hit a failed/skipped execution path, strip “present tense news” fabrications.
 */
export function stripMalvUnsupportedLivePresentClaims(text: string, userText: string): string {
  const ut = (userText ?? "").toLowerCase();
  const asksLiveish =
    /\b(currently|latest|right now|today|breaking|this minute|as we speak|what'?s happening)\b/i.test(ut);
  if (!asksLiveish) return text;
  let out = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n");
  const hunks: RegExp[] = [
    /\b(?:right now|as of this moment|at this hour|just announced)\b[^.!?\n]*[.!?]?/gi,
    /\b(?:breaking news is that|the latest report says that)\b[^.!?\n]*[.!?]?/gi
  ];
  for (const re of hunks) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function malvReplyOpensWithConversationalHedge(text: string): boolean {
  const t = (text ?? "").trimStart();
  return /^(?:generally|typically|usually|often|broadly|in\s+broad\s+outline|in\s+many\s+cases|in\s+some\s+cases|it\s+may|for\s+many\s+people)\b/i.test(
    t
  );
}

/**
 * Tier-aware conversational shaping (no new facts).
 *
 * Strongly grounded: strip a few redundant leading openers so answers read crisply.
 * Other tiers: **do not** inject fixed sentence prefixes — that harmed tone, and it broke
 * prefix alignment between streamed tokens and `assistant_done.finalContent` (reliability
 * pass runs after streaming). Softer hygiene remains in {@link applyMalvReliabilityTextPolicy}
 * (strips, clamps, optional disclaimer). When the model already opens with a hedge, leave
 * the reply unchanged so we do not double-edit.
 */
export function applyMalvReliabilityTierConversationalTone(reply: string, tier: MalvGroundingTier, skipTone: boolean): string {
  const t = (reply ?? "").trim();
  if (!t || skipTone) return reply;
  if (tier === "strongly_grounded") {
    return t.replace(/^(?:Generally|Typically|Usually|Often),?\s+/i, "").trim();
  }
  if (malvReplyOpensWithConversationalHedge(t)) return reply;
  if (tier === "partially_grounded" || tier === "weakly_grounded" || tier === "ungrounded") {
    return t;
  }
  return reply;
}

const VISUAL_FALLBACK_SNIPPETS: Array<{ re: RegExp; text: string }> = [
  {
    re: /\bdelta\s+state\b/i,
    text: "Delta State features dense mangrove forests, wide waterways, and coastal landscapes typical of the Niger Delta."
  },
  {
    re: /\blagos\b/i,
    text: "Lagos mixes dense island cityscapes, long sand beaches, and busy port and lagoon corridors along the Atlantic coast."
  }
];

/**
 * Deterministic, non-visual descriptive line when imagery was expected but unavailable.
 * No references to photos, decks, or “below”.
 */
export function resolveMalvVisualDescriptiveFallbackSnippet(userText: string): string {
  const m = (userText ?? "").trim();
  if (m) {
    for (const row of VISUAL_FALLBACK_SNIPPETS) {
      if (row.re.test(m)) return row.text;
    }
  }
  return "Scenery in that kind of setting often mixes waterways, wetlands, towns, and open countryside, so the feel changes quickly from one stretch to the next.";
}

function maybeAppendVisualExpectationDescriptiveFallback(
  reply: string,
  userText: string,
  assessment: MalvReliabilityAssessment
): string {
  if (!assessment.appendVisualExpectationDescriptiveFallback) return reply;
  const trimmed = reply.trim();
  if (trimmed.length >= 240) return reply;
  const fb = resolveMalvVisualDescriptiveFallbackSnippet(userText);
  const fbLow = fb.slice(0, 28).toLowerCase();
  if (trimmed.toLowerCase().includes(fbLow)) return reply;
  if (!trimmed) return fb;
  return `${trimmed}\n\n${fb}`.trim();
}

/**
 * Apply universal text hygiene for reliability (runs after model shaping / rich lift).
 *
 * **Order:** tutorial + evasive + image meta → clamps → visual fulfillment strip → live dampen → visual
 * descriptive fallback → follow-up anchor → tier tone → disclaimer.
 *
 * When `hadLiveStreamTokens` is `true`, any pass that **prepends or structurally rewrites**
 * already-visible text is skipped so finalized content stays on the same trajectory as the
 * streamed tokens (stream-convergence contract). Strip-only passes and end-appends remain active
 * because they remove false claims or extend the reply without changing what was already read.
 */
export function applyMalvReliabilityTextPolicy(
  reply: string,
  assessment: MalvReliabilityAssessment,
  userText: string = "",
  hadLiveStreamTokens = false
): string {
  let out = stripMalvTutorialGuidancePhrasing(reply);
  out = stripMalvReliabilityEvasiveFallbackPhrasing(out);
  out = stripMalvImagePresenceMetaCommentary(out);
  if (assessment.hardClampSpeculativeFacts) {
    out = stripMalvWeakGroundingDefinitiveExistenceClaims(out);
  }
  if (assessment.suppressVisualDeck) {
    out = stripMalvUnsupportedVisualFulfillmentSentences(out);
  }
  if (assessment.dampenUnsupportedLiveClaims) {
    out = stripMalvUnsupportedLivePresentClaims(out, userText);
  }
  out = maybeAppendVisualExpectationDescriptiveFallback(out, userText, assessment);
  if (!hadLiveStreamTokens) {
    // Prepends a sentence the user never saw during streaming — skip when live tokens were sent.
    out = maybePrefixFollowUpAnchor(out, assessment);
  }
  const skipTierTone =
    assessment.followUpReGroundingRecommended && assessment.tier !== "strongly_grounded";
  if (!hadLiveStreamTokens) {
    // For strongly_grounded this strips a leading word ("Generally, …") — visible rewrite if already streamed.
    out = applyMalvReliabilityTierConversationalTone(out, assessment.tier, skipTierTone);
  }
  out = maybeAppendLocalDisclaimer(out, assessment);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function stripImageCardsFromMediaDeck(media: MalvRichMediaCard[] | undefined): MalvRichMediaCard[] | undefined {
  if (!media?.length) return undefined;
  const next = media.filter((c) => c.kind !== "image");
  return next.length ? next : undefined;
}

/**
 * Align structured rich payload with grounding tier (suppress chrome that over-claims evidence).
 */
export function alignMalvRichResponseWithReliability(
  rich: MalvRichResponse | undefined,
  assessment: MalvReliabilityAssessment
): MalvRichResponse | undefined {
  if (!rich) return undefined;
  let next: MalvRichResponse = { ...rich };

  if (assessment.stripExecutionLeadIn && next.executionLeadIn) {
    const { executionLeadIn: _e, ...rest } = next;
    next = rest;
  }

  if (assessment.suppressSourceChrome) {
    next = { ...next, showSourcesInChrome: false };
  }

  if (assessment.suppressVisualDeck) {
    next = {
      ...next,
      images: undefined,
      media: stripImageCardsFromMediaDeck(next.media)
    };
    if (!next.media?.length) {
      const { media: _m, ...r2 } = next;
      next = r2;
    }
  }

  if (assessment.tier === "ungrounded" || assessment.tier === "weakly_grounded") {
    if (assessment.suppressSourceChrome && (next.sources?.length ?? 0) > 0) {
      next = { ...next, showSourcesInChrome: false };
    }
  }

  return next;
}

export function clampMalvResponseConfidenceByReliability(
  responseConfidence: number,
  assessment: MalvReliabilityAssessment
): number {
  return clampMalvResponseConfidenceByTier(responseConfidence, assessment.tier);
}

export function clampMalvResponseConfidenceByTier(
  responseConfidence: number,
  tier: MalvGroundingTier | undefined | null
): number {
  const caps: Record<MalvGroundingTier, number> = {
    strongly_grounded: 1,
    partially_grounded: 0.86,
    weakly_grounded: 0.62,
    ungrounded: 0.44
  };
  const t = tier ?? "strongly_grounded";
  return clamp01(Math.min(responseConfidence, caps[t]));
}

export type MalvReliabilityDeliveryPassResult = {
  reply: string;
  meta: Record<string, unknown>;
  assessment: MalvReliabilityAssessment;
};

function readRichFromMeta(meta: Record<string, unknown>): MalvRichResponse | null {
  const r = meta.malvRichResponse;
  if (r && typeof r === "object") return r as MalvRichResponse;
  return null;
}

function countImagesRich(r: MalvRichResponse | null | undefined): number {
  if (!r?.images?.length) return 0;
  return r.images.filter((im) => typeof im.url === "string" && im.url.trim().length > 0).length;
}

/**
 * Last-mile pass: grounding assessment, text policy, rich alignment, trace on `meta`.
 */
export function applyMalvResponseReliabilityDeliveryPass(args: {
  userText: string;
  declaredRoute: MalvUniversalCapabilityRoute;
  execution: MalvUniversalCapabilityExecutionResult;
  reply: string;
  meta: Record<string, unknown>;
  priorUserText?: string | null;
  priorAssistantSnippet?: string | null;
  /**
   * Set to `true` when the model's tokens were already forwarded to the client via streaming.
   * Passes the flag through to {@link applyMalvReliabilityTextPolicy} so that prepend-only
   * rewrites that would contradict already-visible content are skipped.
   */
  hadLiveStreamTokens?: boolean;
}): MalvReliabilityDeliveryPassResult {
  const meta = { ...args.meta };
  const rich = readRichFromMeta(meta);
  const structuredSourceCount = rich?.sources?.length ?? 0;
  const structuredImageCount = countImagesRich(rich);

  const assessment = assessMalvResponseReliability({
    userText: args.userText,
    declaredRoute: args.declaredRoute,
    execution: args.execution,
    structuredSourceCount,
    structuredImageCount,
    rich,
    priorUserText: args.priorUserText ?? null,
    priorAssistantSnippet: args.priorAssistantSnippet ?? null
  });

  let reply = applyMalvReliabilityTextPolicy(args.reply ?? "", assessment, args.userText, args.hadLiveStreamTokens ?? false);

  const aligned = alignMalvRichResponseWithReliability(rich ?? undefined, assessment);
  if (aligned) {
    aligned.text = reply;
    meta.malvRichResponse = aligned;
  }

  meta.malvReliabilityAssessment = {
    tier: assessment.tier,
    evidenceScore: assessment.evidenceScore,
    verifierDemandScore: assessment.verifierDemandScore,
    signalCodes: assessment.signalCodes,
    suppressVisualDeck: assessment.suppressVisualDeck,
    suppressSourceChrome: assessment.suppressSourceChrome,
    stripExecutionLeadIn: assessment.stripExecutionLeadIn,
    followUpReGroundingRecommended: assessment.followUpReGroundingRecommended,
    hardClampSpeculativeFacts: assessment.hardClampSpeculativeFacts,
    appendVisualExpectationDescriptiveFallback: assessment.appendVisualExpectationDescriptiveFallback,
    dampenUnsupportedLiveClaims: assessment.dampenUnsupportedLiveClaims
  };

  return { reply, meta, assessment };
}

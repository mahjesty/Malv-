/**
 * Universal request → capability routing for MALV chat (topic-agnostic).
 * Rule-based scoring only — no LLM calls.
 */

import type { MalvTaskCapabilityDemand } from "../inference/malv-inference-tier-capability.types";
import { mergeCapabilityDemands } from "../inference/malv-inference-task-demand.util";

export type MalvUniversalRequestDimension =
  | "stable_knowledge"
  | "reasoning"
  | "writing"
  | "coding"
  | "live_information"
  | "recent_information"
  | "source_required"
  | "financial_data"
  | "visual_lookup"
  | "image_enrichment_helpful"
  | "location_lookup"
  | "entity_lookup"
  | "comparison_research"
  /** Derived in {@link decideUniversalMalvCapabilityRoute} — not keyword-scored. */
  | "mixed_mode";

export const MALV_UNIVERSAL_DIMENSION_ORDER: MalvUniversalRequestDimension[] = [
  "stable_knowledge",
  "reasoning",
  "writing",
  "coding",
  "live_information",
  "recent_information",
  "source_required",
  "financial_data",
  "visual_lookup",
  "image_enrichment_helpful",
  "location_lookup",
  "entity_lookup",
  "comparison_research",
  "mixed_mode"
];

export type MalvUniversalResponseMode =
  | "plain_model"
  | "web_research"
  | "finance_data"
  | "image_enrichment"
  | "mixed_text_plus_visual"
  | "mixed_text_plus_sources";

export type MalvUniversalCapabilityRoute = {
  responseMode: MalvUniversalResponseMode;
  freshnessMatters: boolean;
  externalRetrievalRecommended: boolean;
  imageEnrichmentRecommended: boolean;
  financeLensActive: boolean;
  sourceBackedRecommended: boolean;
  mixedMode: boolean;
  /** Compact trace for telemetry */
  topSignals: string[];
  dimensionScores: Record<MalvUniversalRequestDimension, number>;
};

/** Minimal execution facts for aligning worker prompts with real bundle presence (no extra imports). */
export type MalvCapabilityExecutionPromptSignals = {
  ok: boolean;
  skipped?: boolean;
  promptInjection: string;
};

/**
 * When a non-plain route is selected but capability execution produced no verified bundle,
 * downgrade the **prompt contract** to plain-model honesty so the worker is not pressured
 * to sound retrieval-grounded. Declared route + telemetry stay unchanged upstream.
 */
export function resolveMalvUniversalCapabilityRouteForWorkerPrompt(
  declared: MalvUniversalCapabilityRoute,
  execution: MalvCapabilityExecutionPromptSignals
): MalvUniversalCapabilityRoute {
  if (declared.responseMode === "plain_model") return declared;
  if (execution.skipped) return declared;
  const hasBundle = typeof execution.promptInjection === "string" && execution.promptInjection.trim().length > 0;
  if (!execution.ok || !hasBundle) {
    return {
      ...declared,
      responseMode: "plain_model",
      freshnessMatters: false,
      externalRetrievalRecommended: false,
      imageEnrichmentRecommended: false,
      financeLensActive: false,
      sourceBackedRecommended: false,
      mixedMode: false
    };
  }
  return declared;
}

function zeroScores(): Record<MalvUniversalRequestDimension, number> {
  return Object.fromEntries(MALV_UNIVERSAL_DIMENSION_ORDER.map((d) => [d, 0])) as Record<
    MalvUniversalRequestDimension,
    number
  >;
}

/** Real-time market phrasing — paired with financial entity / lexemes in {@link applyLiveFinancialMarketBoost}. */
const LIVE_MARKET_STATE_PHRASING =
  /\b(?:up\s+today|down\s+today|price\s+now|current\s+price|latest\s+price|market\s+today)\b/i;

const TICKER_NOISE_UPPER = new Set([
  "THE",
  "AND",
  "FOR",
  "YTD",
  "OHLC",
  "NYSE",
  "NASDAQ",
  "STOCK",
  "STOCKS",
  "PRICE",
  "NEWS",
  "LAST",
  "WEEK",
  "THIS",
  "THAT",
  "WHAT",
  "WHEN",
  "WHERE",
  "WHO",
  "HOW",
  "ARE",
  "YOU",
  "NOT",
  "BUT",
  "TODAY",
  "NOW",
  "DOWN",
  "SOON",
  "HERE",
  "THERE",
  "BEEN",
  "HAVE",
  "THEN",
  "EVEN",
  "BACK",
  "OVER",
  "JUST",
  "ONLY",
  "INTO",
  "ALSO",
  "SOME",
  "MUCH",
  "VERY",
  "GOOD",
  "BEST",
  "WELL",
  "CAME",
  "MADE",
  "LIKE",
  "UP"
]);

function hasLikelyListedTicker(userText: string): boolean {
  const upper = userText.toUpperCase();
  const hits = upper.match(/\b([A-Z]{2,5})\b/g);
  if (!hits) return false;
  for (const raw of hits) {
    const sym = raw.trim();
    if (TICKER_NOISE_UPPER.has(sym)) continue;
    return true;
  }
  return false;
}

function hasFinancialEntityOrLexeme(lower: string, original: string): boolean {
  if (
    /\b(bitcoin|btc|ethereum|eth\b|solana|\bsol\b|altcoin|crypto|token|stock|stocks|equity|etf|forex|nasdaq|nyse|s&p|index|indices)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  if (
    /\b(price|prices|chart|charts|candle|ohlc|ticker|tickers|market cap|dividend yield|volatility|performance|ytd|52[- ]week)\b/i.test(lower)
  ) {
    return true;
  }
  return hasLikelyListedTicker(original);
}

/**
 * Small additive boost when the user implies **current** market state for a **financial** entity.
 * Skipped when coding / writing already dominates so coding/writing guards stay authoritative.
 */
function applyLiveFinancialMarketBoost(
  s: Record<MalvUniversalRequestDimension, number>,
  userText: string
): void {
  if (s.coding >= 3 || s.writing >= 3) return;
  const m = userText.toLowerCase();
  if (!LIVE_MARKET_STATE_PHRASING.test(m)) return;
  if (!hasFinancialEntityOrLexeme(m, userText)) return;

  s.financial_data += 2;
  s.live_information += 2;
  s.recent_information = Math.max(s.recent_information, 2);
}

/**
 * Score the user message across universal dimensions (0–4 per dimension, higher = stronger).
 */
export function scoreUniversalMalvRequest(userText: string): Record<MalvUniversalRequestDimension, number> {
  const s = zeroScores();
  const m = userText.toLowerCase();

  if (/\b(what is|what are|define|definition of|meaning of|explain (?:what|how)|how does .{1,40} work)\b/i.test(m)) {
    s.stable_knowledge += 3;
  } else if (/\b(why does|why do|why is|why are)\b/i.test(m)) {
    s.stable_knowledge += 2;
  }

  if (/\b(prove|formal proof|lemma|theorem|contradiction|inductive)\b/i.test(m)) s.reasoning += 3;
  if (/\b(reason through|step[- ]by[- ]step logic)\b/i.test(m)) s.reasoning += 2;

  if (/\b(write|draft|compose|polish|tone|email|letter|cover letter|linkedin post|subject line)\b/i.test(m)) s.writing += 3;

  if (/\b(code|typescript|javascript|python|rust|go\b|react|debug|stack trace|implement|refactor|patch|npm|pnpm)\b/i.test(m)) {
    s.coding += 3;
  }

  if (/\b(right now|currently live|live\b|real[- ]?time|as of now|at this moment)\b/i.test(m)) s.live_information += 3;
  if (/\b(now|today'?s|current\b)\b/i.test(m)) s.live_information += 1;

  if (
    /\b(latest|recent|this week|last week|yesterday|today|till date|to date|so far|breaking|new developments|what happened|since then|as of)\b/i.test(
      m
    )
  ) {
    s.recent_information += 3;
  }
  if (/\b(update|updates|news|headline|announcement|press release)\b/i.test(m)) s.recent_information += 1;

  if (
    /\b(cite|citations?|sources?|references?|verify|fact[- ]?check|look it up|browse the|search the web|official statement)\b/i.test(
      m
    )
  ) {
    s.source_required += 3;
  }
  if (/\b(are you sure|double[- ]check|confirm from|evidence for|prove it with)\b/i.test(m)) s.source_required += 2;

  if (
    /\b(price|prices|chart|charts|candle|ohlc|ticker|tickers|stock|stocks|crypto|token|equity|etf|market cap|index|indices|nasdaq|nyse|s&p|forex|commodit|futures|volatility|performance|ytd|52[- ]week|dividend yield)\b/i.test(
      m
    )
  ) {
    s.financial_data += 3;
  }
  if (/\b(bitcoin|btc|ethereum|eth\b|solana|altcoin)\b/i.test(m)) s.financial_data += 1;

  if (/\b(show me|picture|pictures|photo|photos|image|images|screenshot|diagram of|render of)\b/i.test(m)) {
    s.visual_lookup += 2;
    s.image_enrichment_helpful += 2;
  }
  if (/\b(what does .{1,40} look like|how does .{1,40} look)\b/i.test(m)) {
    s.visual_lookup += 3;
    s.image_enrichment_helpful += 3;
  }
  if (/\b(landmark|skyline|facade|map view|satellite view)\b/i.test(m)) {
    s.visual_lookup += 2;
    s.image_enrichment_helpful += 2;
  }
  if (/\b(animal|species|bird|mammal|insect|plant)\b/i.test(m) && /\b(what|show|identify|look like)\b/i.test(m)) {
    s.image_enrichment_helpful += 2;
  }

  if (/\b(where is|where are|location of|coordinates|map of|country|city|capital|region)\b/i.test(m)) s.location_lookup += 2;
  if (
    /\b(is there|are there|does .{1,48} exist|exist in|exists in|any branches?|branch near|nearest|closest|store in|stores in)\b/i.test(
      m
    )
  ) {
    s.location_lookup += 2;
    s.entity_lookup += 2;
    s.recent_information += 1;
  }
  if (/\b(is there|are there)\b/i.test(m) && /\b(in|inside|within)\b/i.test(m)) {
    s.location_lookup += 2;
    s.entity_lookup += 1;
    s.recent_information += 1;
  }
  if (/\b(place|places|venue|address)\b/i.test(m) && /\b(photo|image|show|look)\b/i.test(m)) {
    s.location_lookup += 2;
    s.image_enrichment_helpful += 2;
  }

  if (/\b(who is|who was|who are|tell me about)\b/i.test(m)) s.entity_lookup += 2;

  if (/\b(compare|versus|vs\.| vs |between .{2,60} and .{2,60})\b/i.test(m)) s.comparison_research += 3;
  if (/\bcompare\b/i.test(m) && s.recent_information >= 1) s.comparison_research += 2;

  if (/\bcompare\b/i.test(m) && /\b(latest|recent|updates?)\b/i.test(m)) {
    s.source_required += 2;
    s.comparison_research += 1;
  }

  applyLiveFinancialMarketBoost(s, userText);

  return s;
}

function topDimensions(scores: Record<MalvUniversalRequestDimension, number>, n: number): string[] {
  return [...MALV_UNIVERSAL_DIMENSION_ORDER]
    .map((d) => ({ d, v: scores[d] }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => `${x.d}:${x.v}`);
}

/**
 * Decide response mode and routing flags from dimension scores.
 */
export function decideUniversalMalvCapabilityRoute(
  scores: Record<MalvUniversalRequestDimension, number>,
  userText: string
): MalvUniversalCapabilityRoute {
  const m = userText.toLowerCase();

  const freshnessMatters = scores.live_information >= 2 || scores.recent_information >= 2;
  const financeLensActive = scores.financial_data >= 2;
  const sourceBackedRecommended = scores.source_required >= 2;
  const imageCue =
    scores.image_enrichment_helpful >= 2 ||
    scores.visual_lookup >= 2 ||
    /\b(show me (?:a |an |the )?(?:photo|picture|image)|photos of|pictures of)\b/i.test(m);
  const locationCue = scores.location_lookup >= 2 || /\b(the place|this place|that place)\b/i.test(m);
  const imageEnrichmentRecommended =
    imageCue && (locationCue || scores.visual_lookup >= 2 || /\b(landmark|look like|animal|person|event)\b/i.test(m));

  const publicFactsOrNews =
    freshnessMatters ||
    /\b(news|headlines?|developments|returned from|mission|launch|election|policy update)\b/i.test(m);
  const externalRetrievalRecommended =
    (publicFactsOrNews && (scores.recent_information >= 1 || scores.live_information >= 1)) ||
    sourceBackedRecommended ||
    (financeLensActive && (freshnessMatters || /\b(price|chart|performance|movement)\b/i.test(m)));

  const comparisonLatest = scores.comparison_research >= 2 && scores.recent_information >= 1;

  let responseMode: MalvUniversalResponseMode = "plain_model";

  const wantsFinanceAnswer =
    financeLensActive &&
    (freshnessMatters || /\b(price|chart|performance|movement|return|volatility|till date|to date)\b/i.test(m));

  const wantsSourceHeavy = sourceBackedRecommended || comparisonLatest;

  if (imageEnrichmentRecommended && (wantsSourceHeavy || publicFactsOrNews) && !wantsFinanceAnswer) {
    responseMode = "mixed_text_plus_visual";
  } else if (imageEnrichmentRecommended && !wantsFinanceAnswer) {
    responseMode = "image_enrichment";
  } else if (wantsFinanceAnswer) {
    responseMode = wantsSourceHeavy ? "mixed_text_plus_sources" : "finance_data";
  } else if (wantsSourceHeavy && !imageEnrichmentRecommended) {
    /** Explicit verify / cite / compare-latest → structured, source-oriented layout even without a dated news cue. */
    responseMode = "mixed_text_plus_sources";
  } else if (externalRetrievalRecommended) {
    responseMode = "web_research";
  } else {
    responseMode = "plain_model";
  }

  if (scores.coding >= 3 && scores.financial_data === 0 && scores.recent_information <= 1 && scores.source_required <= 1) {
    responseMode = "plain_model";
    /* Coding tasks default to model reasoning unless finance/live/source clearly dominates. */
  }

  if (scores.writing >= 3 && scores.financial_data === 0 && scores.recent_information <= 1 && scores.source_required <= 1) {
    responseMode = "plain_model";
  }

  if (scores.stable_knowledge >= 3 && !freshnessMatters && scores.financial_data <= 1 && scores.source_required <= 1) {
    responseMode = "plain_model";
  }

  /**
   * Rescue: live market phrasing + financial entity scores high, but earlier branches still landed on plain_model.
   * Keeps short crypto/market "up today" style asks off plain_model without weakening coding/writing/stable paths.
   */
  if (
    LIVE_MARKET_STATE_PHRASING.test(m) &&
    scores.financial_data >= 2 &&
    responseMode === "plain_model" &&
    scores.coding < 3 &&
    scores.writing < 3
  ) {
    responseMode = wantsSourceHeavy ? "mixed_text_plus_sources" : "finance_data";
  }

  const mixedMode =
    responseMode === "mixed_text_plus_visual" ||
    responseMode === "mixed_text_plus_sources" ||
    (imageEnrichmentRecommended && wantsSourceHeavy);

  const dimensionScores: Record<MalvUniversalRequestDimension, number> = {
    ...scores,
    mixed_mode: mixedMode ? 2 : 0
  };

  const route: MalvUniversalCapabilityRoute = {
    responseMode,
    freshnessMatters,
    externalRetrievalRecommended: responseMode !== "plain_model" && responseMode !== "image_enrichment",
    imageEnrichmentRecommended,
    financeLensActive: wantsFinanceAnswer || (financeLensActive && responseMode === "finance_data"),
    sourceBackedRecommended: wantsSourceHeavy || responseMode === "mixed_text_plus_sources",
    mixedMode,
    topSignals: topDimensions(dimensionScores, 6),
    dimensionScores
  };

  if (responseMode === "image_enrichment") {
    route.externalRetrievalRecommended = true;
  }

  return route;
}

export function resolveUniversalMalvCapabilityRoute(userText: string): MalvUniversalCapabilityRoute {
  const scores = scoreUniversalMalvRequest(userText);
  return decideUniversalMalvCapabilityRoute(scores, userText);
}

/**
 * Maps a universal route to extra {@link MalvTaskCapabilityDemand} merged into chat routing
 * so lightweight CPU paths are skipped when live, sourced, finance, or visual grounding is needed.
 */
export function universalCapabilityDemandPatch(route: MalvUniversalCapabilityRoute): MalvTaskCapabilityDemand | null {
  if (route.responseMode === "plain_model") return null;

  let minimumCapabilityClass: MalvTaskCapabilityDemand["minimumCapabilityClass"] = "standard";
  let reasoningDepthRequired: MalvTaskCapabilityDemand["reasoningDepthRequired"] = "standard";
  let requiresStructuredOutput = false;
  let requiresMultimodal = false;
  let minimumResponsiveness: MalvTaskCapabilityDemand["minimumResponsiveness"] = "balanced";
  let concurrentInferSlotsRequired = 1;

  if (route.responseMode === "finance_data" || route.responseMode === "web_research") {
    minimumCapabilityClass = "enhanced";
    reasoningDepthRequired = "deep";
    requiresStructuredOutput = true;
    minimumResponsiveness = "interactive";
  }

  if (route.responseMode === "mixed_text_plus_sources") {
    minimumCapabilityClass = "enhanced";
    reasoningDepthRequired = "deep";
    requiresStructuredOutput = true;
    minimumResponsiveness = "interactive";
    concurrentInferSlotsRequired = 2;
  }

  if (route.responseMode === "image_enrichment" || route.responseMode === "mixed_text_plus_visual") {
    minimumCapabilityClass = "enhanced";
    reasoningDepthRequired = "deep";
    requiresMultimodal = route.responseMode === "mixed_text_plus_visual" ? true : route.imageEnrichmentRecommended;
    requiresStructuredOutput = route.responseMode === "mixed_text_plus_visual";
    minimumResponsiveness = "interactive";
  }

  return {
    minimumCapabilityClass,
    reasoningDepthRequired,
    requiresMultimodal,
    requiresStructuredOutput,
    promptChars: 0,
    contextChars: 0,
    minimumResponsiveness,
    concurrentInferSlotsRequired
  };
}

export function mergeUniversalDemandIntoChatDemand(
  base: MalvTaskCapabilityDemand,
  route: MalvUniversalCapabilityRoute
): MalvTaskCapabilityDemand {
  const patch = universalCapabilityDemandPatch(route);
  if (!patch) return base;
  return mergeCapabilityDemands(base, patch);
}

/**
 * Prompt / context block instructing the worker how to behave for this turn (capability posture).
 */
export function formatUniversalCapabilityRoutingContextBlock(route: MalvUniversalCapabilityRoute): string {
  const lines: string[] = ["### MALV universal capability route (internal)"];
  lines.push(`- Declared response mode: ${route.responseMode}`);
  lines.push(`- Freshness matters: ${route.freshnessMatters ? "yes" : "no"}`);
  lines.push(`- Source-backed answer: ${route.sourceBackedRecommended ? "yes" : "no"}`);
  lines.push(`- Finance / market lens: ${route.financeLensActive ? "yes" : "no"}`);
  lines.push(`- Image / visual enrichment: ${route.imageEnrichmentRecommended ? "yes" : "no"}`);
  if (route.topSignals.length) lines.push(`- Top dimension signals: ${route.topSignals.join(", ")}`);

  const directives: string[] = [];
  if (route.responseMode === "plain_model") {
    directives.push(
      "Answer from general reasoning and session context. Do not imply you verified live web pages, images, or prices unless a ### MALV verified execution bundle section is present above; if it is absent, answer directly and avoid research-tour or search-coaching prose."
    );
  } else {
    directives.push("Do not answer as a static offline snapshot when freshness matters — synthesize using any retrieval or tool output present in context, and clearly separate verified facts from inference.");
    directives.push(
      "When a ### MALV verified execution bundle section appears in context, treat its JSON and bullets as authoritative for numbers, links, and image URLs — do not substitute free‑web search instructions for the user."
    );
  }

  if (route.responseMode === "finance_data" || route.financeLensActive) {
    directives.push(
      "For market or price questions: cite numeric levels, currency, timezone/session, and the implied date range; prefer structured summaries (bullet levels + short interpretation)."
    );
  }

  if (route.responseMode === "web_research" || route.responseMode === "mixed_text_plus_sources") {
    directives.push(
      "Source-backed: ground claims in the verified execution bundle and any excerpts in context; name outlets or document types when that evidence names them. Prefer concrete facts (who, what, when, numbers) over hedged summaries."
    );
    directives.push(
      "Do not narrate product UI: never ask the user to open links, scroll to images, or read 'sources below' — citations render in structured chrome; your answer text should read as a standalone brief."
    );
    directives.push(
      "Avoid filler openers ('Here is an overview', 'You can visit these sites', 'Relevant images'); start with the most useful fact."
    );
  }

  if (route.responseMode === "image_enrichment" || route.responseMode === "mixed_text_plus_visual") {
    directives.push(
      "Include visual grounding only when it materially clarifies the answer (landmark, place, product, public figure, species). Do not describe where images appear in the UI; skip decorative or stock-only filler."
    );
  }

  if (route.mixedMode) {
    directives.push("Mixed-mode: combine narrative with the modalities implied by the route (data and/or sources and/or visuals) without redundancy.");
  }

  if (route.responseMode !== "plain_model") {
    directives.push(
      "Never refuse on the grounds that you lack browsing or real-time access when this deployment routes you through MALV capability paths — instead produce the best grounded answer available from context and tools."
    );
  }

  lines.push("");
  lines.push(directives.join("\n"));
  return lines.join("\n");
}

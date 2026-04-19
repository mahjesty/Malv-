/**
 * Portable Explore → Studio / handoff context shapes (no catalog search helpers).
 * Kept separate so Studio improve flows do not depend on legacy Explore ranking code.
 */

export type ExploreIntent = "keyword_search" | "assisted_search" | "broad_idea" | "create_request";

/** Portable intent label for Explore search / seed handoff (same union as {@link ExploreIntent}). */
export type ExploreSearchIntent =
  | "keyword_search"
  | "assisted_search"
  | "broad_idea"
  | "create_request";

export type ExploreExplanationMode = "strict" | "expanded" | "catalog";

export type ExploreActionContext = {
  rawQuery: string;
  normalizedQuery: string;
  strippedIdea?: string;
  intent: ExploreSearchIntent;
  matchQuality: "strong" | "weak" | "empty";
  suggestedCategories?: string[];
  sourceTab?: string;
  selectedCategory?: string | null;
  selectedType?: string | null;
  explanationMode?: ExploreExplanationMode;
  /**
   * Deterministic “why these results?” line when present.
   * Not a model-enhancement slot — keep match explanations rule-based (see exploreModelEnhancement.ts).
   */
  resultsExplanation?: string;
};

export function buildMinimalExploreActionContext(args: {
  rawQuery: string;
  intent?: ExploreSearchIntent;
  matchQuality?: ExploreActionContext["matchQuality"];
  strippedIdea?: string;
}): ExploreActionContext {
  const rawQuery = args.rawQuery.trim();
  return {
    rawQuery,
    normalizedQuery: rawQuery.toLowerCase(),
    strippedIdea: args.strippedIdea?.trim() || undefined,
    intent: args.intent ?? "keyword_search",
    matchQuality: args.matchQuality ?? "strong"
  };
}

import type { MalvUniversalResponseMode } from "./malv-universal-capability-router.util";
import type { MalvRichMediaCard } from "./malv-rich-response.types";

/**
 * Route-aware rules for MALV structured rich surface density (pills, media rail, preview tiles, actions).
 * Keeps answer-first hierarchy; all tuning happens after execution payloads are merged.
 */
export type MalvRichSurfaceDisplayPolicy = {
  mergeDiscoveredLinksIntoSources: boolean;
  /** When false, URLs may be softened to host hints unless merged into sources for stripping. */
  showSourcePills: boolean;
  maxStructuredSourceItems: number;
  maxImageCardsInMediaDeck: number;
  /** Hard cap on swipe rail density (charts preserved first, then images, then preview tiles). */
  maxMediaDeckCards: number;
  /** Strip non-chart image cards from the media deck (finance is chart-forward). */
  financeMediaChartOnly: boolean;
  allowSourcePreviewMedia: boolean;
  maxSourcePreviewMedia: number;
  maxQuickActions: number;
};

export type MalvRichSurfacePolicyContext = {
  /** After merge, before route caps. */
  structuredSourceCount: number;
};

export function resolveMalvRichSurfaceDisplayPolicy(
  mode: MalvUniversalResponseMode,
  ctx: MalvRichSurfacePolicyContext
): MalvRichSurfaceDisplayPolicy {
  if (mode === "plain_model") {
    return {
      mergeDiscoveredLinksIntoSources: false,
      showSourcePills: false,
      maxStructuredSourceItems: 0,
      maxImageCardsInMediaDeck: 0,
      maxMediaDeckCards: 0,
      financeMediaChartOnly: false,
      allowSourcePreviewMedia: false,
      maxSourcePreviewMedia: 0,
      maxQuickActions: 2
    };
  }

  if (mode === "web_research") {
    return {
      mergeDiscoveredLinksIntoSources: true,
      showSourcePills: true,
      maxStructuredSourceItems: 5,
      maxImageCardsInMediaDeck: 1,
      maxMediaDeckCards: 3,
      financeMediaChartOnly: false,
      allowSourcePreviewMedia: true,
      maxSourcePreviewMedia: 2,
      maxQuickActions: 2
    };
  }

  if (mode === "finance_data") {
    return {
      mergeDiscoveredLinksIntoSources: true,
      showSourcePills: true,
      maxStructuredSourceItems: 3,
      maxImageCardsInMediaDeck: 0,
      maxMediaDeckCards: 1,
      financeMediaChartOnly: true,
      allowSourcePreviewMedia: false,
      maxSourcePreviewMedia: 0,
      maxQuickActions: 2
    };
  }

  if (mode === "image_enrichment") {
    return {
      mergeDiscoveredLinksIntoSources: false,
      showSourcePills: false,
      maxStructuredSourceItems: 0,
      maxImageCardsInMediaDeck: 6,
      maxMediaDeckCards: 6,
      financeMediaChartOnly: false,
      allowSourcePreviewMedia: false,
      maxSourcePreviewMedia: 0,
      maxQuickActions: 2
    };
  }

  if (mode === "mixed_text_plus_sources") {
    return {
      mergeDiscoveredLinksIntoSources: true,
      showSourcePills: true,
      maxStructuredSourceItems: 3,
      maxImageCardsInMediaDeck: 2,
      maxMediaDeckCards: 3,
      financeMediaChartOnly: false,
      allowSourcePreviewMedia: true,
      maxSourcePreviewMedia: 2,
      maxQuickActions: 2
    };
  }

  // mixed_text_plus_visual — visual-first; evidence pills only when multi-source substantiation helps.
  const multiSource = ctx.structuredSourceCount >= 2;
  return {
    mergeDiscoveredLinksIntoSources: true,
    showSourcePills: multiSource,
    maxStructuredSourceItems: multiSource ? 2 : 6,
    maxImageCardsInMediaDeck: 2,
    maxMediaDeckCards: 3,
    financeMediaChartOnly: false,
    allowSourcePreviewMedia: true,
    maxSourcePreviewMedia: multiSource ? 1 : 0,
    maxQuickActions: 2
  };
}

/**
 * Keeps charts, then images, then `source_preview` tiles — drops tail categories first when over budget.
 */
export function trimMalvRichMediaDeckToBudget(cards: MalvRichMediaCard[], maxCards: number): MalvRichMediaCard[] {
  if (maxCards <= 0) return [];
  if (cards.length <= maxCards) return cards;
  const charts = cards.filter((c) => c.kind === "chart");
  const images = cards.filter((c) => c.kind === "image");
  const previews = cards.filter((c) => c.kind === "source_preview");
  const out: MalvRichMediaCard[] = [];
  for (const c of charts) {
    if (out.length >= maxCards) return out;
    out.push(c);
  }
  for (const c of images) {
    if (out.length >= maxCards) return out;
    out.push(c);
  }
  for (const c of previews) {
    if (out.length >= maxCards) return out;
    out.push(c);
  }
  return out;
}

/** Whether `source_preview` media cards should be composed for this route and visual context. */
export function malvRichSurfaceShouldAttachSourcePreviewTiles(args: {
  mode: MalvUniversalResponseMode;
  imageCardCountAfterCap: number;
  structuredSourceCount: number;
  policy: MalvRichSurfaceDisplayPolicy;
}): boolean {
  if (!args.policy.allowSourcePreviewMedia || args.policy.maxSourcePreviewMedia < 1) return false;
  if (args.structuredSourceCount < 1) return false;
  if (args.mode === "web_research") {
    return args.imageCardCountAfterCap >= 1;
  }
  if (args.mode === "mixed_text_plus_sources") {
    return true;
  }
  if (args.mode === "mixed_text_plus_visual") {
    return args.structuredSourceCount >= 2;
  }
  return false;
}

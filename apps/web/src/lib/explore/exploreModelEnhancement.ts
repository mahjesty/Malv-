/**
 * Explore — bounded optional model text (readiness only; no inference here).
 *
 * Truth boundaries (future model integration MUST respect these):
 * - Deterministic backend payloads, policy, feasibility, preview state, and publish gates are canonical.
 * - Optional model text may: summarize, rephrase, suggest, or annotate — only in addition to deterministic copy.
 * - Optional model text may NOT: change review decision, preview feasibility, preview availability, publish
 *   permission, or any structured boolean/enum from the server; invent capabilities; or assert certainty
 *   beyond returned signals.
 *
 * Approved insertion slots (see helpers and view-model optional fields):
 * - Review hero nuance (alongside {@link getCuratedReviewHero} — never replaces summary / previewHint).
 * - Review rationale elaboration (inside evidence / technical details — never replaces policy record).
 * - Technical snapshot interpretation hint (alongside heuristic summary — never replaces chip values).
 * - Preview feasibility descriptive hint (after server reasonLabel — never replaces feasibility flags).
 * - Improve → Studio refinement note (alongside deterministic framing — never replaces reviewFactsLine).
 * - Optional user-facing suggestion strings (explicitly labeled when rendered).
 *
 * Intentionally NOT model slots (stay deterministic only):
 * - Search / catalog match explanations (deterministic ranking copy only — no model slot).
 * - Capability chips (preview policy vs artifact vs publish), checklist states, finding rows.
 * - Preview mode headlines derived from `ApiPreviewFeasibility.previewMode` and delivery truth.
 * - Any permission line from {@link sourceReviewPolicyCopy} tied to booleans from the server.
 */

/** Optional bounded text keyed by Explore surface; all fields are additive display-only. */
export type ExploreOptionalModelTextEnhancement = {
  /** Short nuance below hero summary — does not replace deterministic headline copy. */
  reviewHeroNuance?: string;
  /** Extra paragraph in technical / evidence disclosure — does not replace policy rationale strings. */
  reviewRationaleElaboration?: string;
  /** Hint next to heuristic technical read — does not replace chip values or feasibility rows. */
  technicalReadInterpretation?: string;
  /** Hint after server feasibility reason — does not replace `reasonLabel` or blocking issues list. */
  previewDescriptiveHint?: string;
  /** Extra line in Studio Improve framing — does not replace intake/feasibility facts line. */
  improveRefinementNote?: string;
  /** Short optional suggestion (render with an explicit “suggestion” label when shown). */
  optionalUserSuggestion?: string;
};

const DEFAULT_MAX = 1_800;

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes and caps optional model text. Returns null when empty after trim — callers must not render
 * placeholders so UI matches the no-model path.
 */
export function sanitizeExploreBoundedModelText(raw: unknown, maxLen: number = DEFAULT_MAX): string | null {
  if (typeof raw !== "string") return null;
  const t = collapseWs(raw);
  if (!t) return null;
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export function optionalReviewHeroNuance(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.reviewHeroNuance ?? null, 520);
}

export function optionalReviewRationaleElaboration(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.reviewRationaleElaboration ?? null, 1_200);
}

export function optionalTechnicalReadInterpretation(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.technicalReadInterpretation ?? null, 640);
}

export function optionalPreviewDescriptiveHint(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.previewDescriptiveHint ?? null, 520);
}

export function optionalImproveRefinementNote(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.improveRefinementNote ?? null, 520);
}

export function optionalUserFacingSuggestion(enhancement?: ExploreOptionalModelTextEnhancement | null): string | null {
  return sanitizeExploreBoundedModelText(enhancement?.optionalUserSuggestion ?? null, 400);
}

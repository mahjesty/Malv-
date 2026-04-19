import type { ExploreActionContext, ExploreExplanationMode, ExploreSearchIntent } from "./exploreActionContext.types";
import { normalizeExploreHandoffPayload, type ExploreActionHandoffContext } from "./exploreActionHandoff.types";

const STUDIO_EXPLORE_SEED_JSON_VERSION = 1 as const;

/**
 * Structured handoff from Explore → Studio (serialized in `?exploreSeed=`).
 * Plain-text legacy seeds still parse as legacy strings.
 */
export type StudioExploreSeed = {
  /** Schema version for forward-compatible parsing. */
  v?: number;
  source: "explore";
  query: string;
  strippedIdea?: string;
  intent: ExploreSearchIntent;
  matchQuality: "strong" | "weak" | "empty";
  explanationMode?: ExploreExplanationMode;
  /** Optional canonical handoff when starting from a catalog / grid idea flow. */
  exploreHandoff?: ExploreActionHandoffContext;
};

export const STUDIO_EXPLORE_SEED_STORAGE_KEY = "malv_studio_explore_seed_v1";

export function buildStudioExploreSeedFromActionContext(ctx: ExploreActionContext): StudioExploreSeed {
  return {
    v: STUDIO_EXPLORE_SEED_JSON_VERSION,
    source: "explore",
    query: ctx.rawQuery.trim(),
    strippedIdea: ctx.strippedIdea?.trim() || undefined,
    intent: ctx.intent,
    matchQuality: ctx.matchQuality,
    explanationMode: ctx.explanationMode
  };
}

/** URL param value (caller wraps with encodeURIComponent). */
export function serializeStudioExploreSeedForUrl(ctx: ExploreActionContext, maxLen = 8000): string {
  const seed = buildStudioExploreSeedFromActionContext(ctx);
  let json = JSON.stringify(seed);
  if (json.length <= maxLen) return json;
  const trimmed: StudioExploreSeed = {
    ...seed,
    query: seed.query.slice(0, Math.max(500, Math.floor(maxLen * 0.55))),
    strippedIdea: seed.strippedIdea?.slice(0, Math.floor(maxLen * 0.25))
  };
  json = JSON.stringify(trimmed);
  if (json.length <= maxLen) return json;
  return JSON.stringify({
    v: STUDIO_EXPLORE_SEED_JSON_VERSION,
    source: "explore" as const,
    query: trimmed.query.slice(0, 2000),
    intent: trimmed.intent,
    matchQuality: trimmed.matchQuality
  });
}

export type ParsedStudioExploreSeed =
  | { kind: "structured"; seed: StudioExploreSeed }
  | { kind: "legacy"; text: string };

function isExploreSearchIntent(x: unknown): x is ExploreSearchIntent {
  return (
    x === "keyword_search" ||
    x === "assisted_search" ||
    x === "broad_idea" ||
    x === "create_request"
  );
}

function isMatchQuality(x: unknown): x is StudioExploreSeed["matchQuality"] {
  return x === "strong" || x === "weak" || x === "empty";
}

function isExplanationMode(x: unknown): x is ExploreExplanationMode {
  return x === "strict" || x === "expanded" || x === "catalog";
}

/**
 * Parse `exploreSeed` query value (already decoded by URLSearchParams).
 */
export function parseStudioExploreSeed(raw: string): ParsedStudioExploreSeed {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { kind: "legacy", text: trimmed };
  }
  try {
    const o = JSON.parse(trimmed) as unknown;
    if (!o || typeof o !== "object") return { kind: "legacy", text: trimmed };
    const r = o as Record<string, unknown>;
    if (r.source !== "explore") return { kind: "legacy", text: trimmed };
    if (typeof r.query !== "string" || !r.query.trim()) return { kind: "legacy", text: trimmed };
    if (!isExploreSearchIntent(r.intent)) return { kind: "legacy", text: trimmed };
    if (!isMatchQuality(r.matchQuality)) return { kind: "legacy", text: trimmed };

    const seed: StudioExploreSeed = {
      v: typeof r.v === "number" ? r.v : STUDIO_EXPLORE_SEED_JSON_VERSION,
      source: "explore",
      query: r.query.trim(),
      strippedIdea: typeof r.strippedIdea === "string" && r.strippedIdea.trim() ? r.strippedIdea.trim() : undefined,
      intent: r.intent,
      matchQuality: r.matchQuality
    };
    if (r.explanationMode !== undefined && r.explanationMode !== null) {
      if (isExplanationMode(r.explanationMode)) seed.explanationMode = r.explanationMode;
    }
    const eh = r.exploreHandoff;
    if (eh && typeof eh === "object") {
      const normalized = normalizeExploreHandoffPayload(eh);
      if (normalized) seed.exploreHandoff = normalized;
    }
    return { kind: "structured", seed };
  } catch {
    return { kind: "legacy", text: trimmed };
  }
}

/** Text seeded into the Studio composer when it is still empty. */
export function studioExploreSeedToComposerPrompt(parsed: ParsedStudioExploreSeed): string {
  const idea =
    parsed.kind === "structured"
      ? (parsed.seed.strippedIdea?.trim() || parsed.seed.query.trim())
      : parsed.text.trim();
  return `From Explore — starting idea:\n${idea}\n\nDescribe how you want MALV Studio to shape this, or open a unit from Explore for concrete context.`;
}

export function persistStudioExploreSeedContext(parsed: ParsedStudioExploreSeed): void {
  try {
    if (parsed.kind === "structured") {
      sessionStorage.setItem(STUDIO_EXPLORE_SEED_STORAGE_KEY, JSON.stringify(parsed.seed));
    } else {
      const legacy: StudioExploreSeed = {
        source: "explore",
        query: parsed.text,
        intent: "keyword_search",
        matchQuality: "strong"
      };
      sessionStorage.setItem(STUDIO_EXPLORE_SEED_STORAGE_KEY, JSON.stringify(legacy));
    }
  } catch {
    /* private mode / quota */
  }
}

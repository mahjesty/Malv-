/**
 * Canonical Explore → Studio / Chat handoff contract (shared web + API).
 * Internal fields must never appear in end-user-visible chat chrome.
 */

export const EXPLORE_HANDOFF_SCHEMA_VERSION = 2 as const;
export const EXPLORE_HANDOFF_SCHEMA_VERSION_LEGACY = 1 as const;

/** Normalized action intents — use these constants instead of string literals at call sites. */
export const ExploreActionIntent = {
  OpenStudio: "open_studio",
  Improve: "improve",
  AskMalv: "ask_malv",
  ContinueInChat: "continue_in_chat",
  OptimizeMobile: "optimize_mobile",
  TightenSpacingTypography: "tighten_spacing_typography",
  EnhanceVisualHierarchy: "enhance_visual_hierarchy",
  DebugPreviewIssue: "debug_preview_issue",
  ExplainReviewOutcome: "explain_review_outcome"
} as const;

export type ExploreActionIntent = (typeof ExploreActionIntent)[keyof typeof ExploreActionIntent];

export type ExploreHandoffSourceSubsurface = "grid" | "detail" | "fullscreen_preview" | "compare_mode";

export type ExploreActionHandoffActionType =
  | typeof ExploreActionIntent.OpenStudio
  | typeof ExploreActionIntent.Improve
  | typeof ExploreActionIntent.AskMalv
  | typeof ExploreActionIntent.ContinueInChat
  | typeof ExploreActionIntent.OptimizeMobile
  | typeof ExploreActionIntent.TightenSpacingTypography
  | typeof ExploreActionIntent.EnhanceVisualHierarchy
  | typeof ExploreActionIntent.DebugPreviewIssue
  | typeof ExploreActionIntent.ExplainReviewOutcome;

export type ExploreHandoffPreviewMode = "live" | "static" | "structured_fallback" | "technical_fallback";

export type ExploreHandoffPreviewConfidence = "high" | "medium" | "low";

export type ExploreHandoffPresentationViewport = "fit" | "mobile" | "tablet" | "desktop";

export type ExploreHandoffImprovementIntent =
  | "generic_improve"
  | "optimize_mobile"
  | "tighten_spacing_typography"
  | "enhance_visual_hierarchy";

/**
 * Single canonical contract for Explore-originated cross-surface actions.
 * @see EXPLORE_HANDOFF_SCHEMA_VERSION
 */
export type ExploreActionHandoffContext = {
  v: typeof EXPLORE_HANDOFF_SCHEMA_VERSION;
  sourceSurface: "explore";
  sourceSubsurface: ExploreHandoffSourceSubsurface;
  actionType: ExploreActionHandoffActionType;
  unitId: string;
  /** Stable client correlation id for this Explore inspection session (per unit). */
  unitSessionId: string;
  previewContext: {
    mode: ExploreHandoffPreviewMode;
    confidence: ExploreHandoffPreviewConfidence;
    reasonCode?: string;
    reasonLabel?: string;
  };
  reviewContext: {
    decision: string;
    previewAllowed: boolean;
    publishAllowed: boolean;
  };
  presentationContext: {
    viewport: ExploreHandoffPresentationViewport;
    compareMode: boolean;
    fullscreen: boolean;
  };
  improvementContext?: {
    intent: ExploreHandoffImprovementIntent;
    userPromptSeed: string;
  };
  continuityContext: {
    returnSurface: "explore_detail";
    restoreUnitId: string;
    restoreViewport: string;
    restoreCompareMode: boolean;
  };
};

/** @deprecated Use {@link ExploreActionHandoffContext}. */
export type ExploreHandoffContext = ExploreActionHandoffContext;

const MAX_JSON_CHARS = 20_000;

function isViewport(x: string): x is ExploreHandoffPresentationViewport {
  return x === "fit" || x === "mobile" || x === "tablet" || x === "desktop";
}

function isPreviewMode(x: string): x is ExploreHandoffPreviewMode {
  return x === "live" || x === "static" || x === "structured_fallback" || x === "technical_fallback";
}

function isConfidence(x: string): x is ExploreHandoffPreviewConfidence {
  return x === "high" || x === "medium" || x === "low";
}

function isSubsurface(x: string): x is ExploreHandoffSourceSubsurface {
  return x === "grid" || x === "detail" || x === "fullscreen_preview" || x === "compare_mode";
}

const V2_ACTIONS = new Set<string>(Object.values(ExploreActionIntent));

function normalizeActionTypeV1(raw: string | undefined): ExploreActionHandoffActionType | null {
  if (!raw) return null;
  switch (raw) {
    case "generic_improve":
    case "improve":
      return ExploreActionIntent.Improve;
    case "debug_preview":
      return ExploreActionIntent.DebugPreviewIssue;
    case "explain_review":
      return ExploreActionIntent.ExplainReviewOutcome;
    default:
      if (V2_ACTIONS.has(raw)) return raw as ExploreActionHandoffActionType;
      return null;
  }
}

function mapExplicitIntentToImprovementIntent(raw: string | undefined): ExploreHandoffImprovementIntent {
  switch (raw) {
    case "optimize_mobile":
      return "optimize_mobile";
    case "tighten_spacing_typography":
      return "tighten_spacing_typography";
    case "enhance_visual_hierarchy":
      return "enhance_visual_hierarchy";
    default:
      return "generic_improve";
  }
}

function migrateV1ToV2(r: Record<string, unknown>): ExploreActionHandoffContext | null {
  if (r.sourceSurface !== "explore") return null;
  const unitId = typeof r.unitId === "string" ? r.unitId.trim() : "";
  const unitSessionId = typeof r.unitSessionId === "string" ? r.unitSessionId.trim() : "";
  if (!unitId || !unitSessionId) return null;

  const actionType =
    normalizeActionTypeV1(typeof r.actionType === "string" ? r.actionType : undefined) ?? ExploreActionIntent.OpenStudio;
  const sourceSubsurfaceRaw = typeof r.sourceSubsurface === "string" ? r.sourceSubsurface : "detail";
  const sourceSubsurface = isSubsurface(sourceSubsurfaceRaw) ? sourceSubsurfaceRaw : "detail";

  const prev = r.previewContext as Record<string, unknown> | undefined;
  let mode: ExploreHandoffPreviewMode = "technical_fallback";
  let confidence: ExploreHandoffPreviewConfidence = "low";
  let reasonCode: string | undefined;
  let reasonLabel: string | undefined;
  if (prev && typeof prev === "object") {
    const pm = typeof prev.previewMode === "string" ? prev.previewMode : typeof prev.mode === "string" ? prev.mode : "";
    if (isPreviewMode(pm)) mode = pm;
    const cf =
      typeof prev.previewConfidence === "string"
        ? prev.previewConfidence
        : typeof prev.confidence === "string"
          ? prev.confidence
          : "";
    if (isConfidence(cf)) confidence = cf;
    if (typeof prev.reasonCode === "string" && prev.reasonCode.trim()) reasonCode = prev.reasonCode.trim();
    if (typeof prev.reasonLabel === "string" && prev.reasonLabel.trim()) reasonLabel = prev.reasonLabel.trim();
  }

  const rev = r.reviewContext as Record<string, unknown> | undefined;
  let decision = "";
  let previewAllowed = false;
  let publishAllowed = false;
  if (rev && typeof rev === "object") {
    if (typeof rev.decision === "string") decision = rev.decision;
    if (rev.previewAllowed === true) previewAllowed = true;
    if (rev.publishAllowed === true) publishAllowed = true;
  }

  const pres = r.presentationContext as Record<string, unknown> | undefined;
  let viewport: ExploreHandoffPresentationViewport = "fit";
  let compareMode = false;
  let fullscreen = false;
  if (pres && typeof pres === "object") {
    const vm =
      typeof pres.currentViewportMode === "string"
        ? pres.currentViewportMode
        : typeof pres.viewport === "string"
          ? pres.viewport
          : "";
    if (isViewport(vm)) viewport = vm;
    if (pres.compareModeEnabled === true || pres.compareMode === true) compareMode = true;
    if (pres.fullscreen === true) fullscreen = true;
  }

  const imp = r.improvementContext as Record<string, unknown> | undefined;
  let improvementContext: ExploreActionHandoffContext["improvementContext"];
  if (imp && typeof imp === "object") {
    const explicit = typeof imp.explicitIntent === "string" ? imp.explicitIntent : typeof imp.intent === "string" ? imp.intent : "";
    const intent = mapExplicitIntentToImprovementIntent(explicit);
    const seed =
      typeof imp.userVisiblePromptSeed === "string"
        ? imp.userVisiblePromptSeed
        : typeof imp.userPromptSeed === "string"
          ? imp.userPromptSeed
          : "";
    if (seed.trim()) {
      improvementContext = { intent, userPromptSeed: seed };
    }
  }

  const cont = r.continuityContext as Record<string, unknown> | undefined;
  let restoreUnitId = unitId;
  let restoreViewport: string = viewport;
  let restoreCompareMode = compareMode;
  if (cont && typeof cont === "object") {
    if (typeof cont.restoreUnitId === "string" && cont.restoreUnitId.trim()) restoreUnitId = cont.restoreUnitId.trim();
    const rv =
      typeof cont.restoreViewMode === "string"
        ? cont.restoreViewMode
        : typeof cont.restoreViewport === "string"
          ? cont.restoreViewport
          : "";
    if (rv.trim()) restoreViewport = rv.trim();
    if (cont.restoreCompareMode === true) restoreCompareMode = true;
    else if (cont.restoreCompareMode === false) restoreCompareMode = false;
  }

  const base: ExploreActionHandoffContext = {
    v: EXPLORE_HANDOFF_SCHEMA_VERSION,
    sourceSurface: "explore",
    sourceSubsurface,
    actionType,
    unitId,
    unitSessionId,
    previewContext: { mode, confidence, reasonCode, reasonLabel },
    reviewContext: { decision, previewAllowed, publishAllowed },
    presentationContext: { viewport, compareMode, fullscreen },
    continuityContext: {
      returnSurface: "explore_detail",
      restoreUnitId,
      restoreViewport,
      restoreCompareMode
    }
  };
  if (improvementContext) return { ...base, improvementContext };
  return base;
}

/**
 * Normalize a parsed JSON object into the current handoff contract (v2), including legacy v1 migration.
 */
export function normalizeExploreHandoffPayload(input: unknown): ExploreActionHandoffContext | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const v = r.v;
  if (v === EXPLORE_HANDOFF_SCHEMA_VERSION_LEGACY) {
    return migrateV1ToV2(r);
  }
  if (v !== EXPLORE_HANDOFF_SCHEMA_VERSION) return null;
  if (r.sourceSurface !== "explore") return null;
  const unitId = typeof r.unitId === "string" ? r.unitId.trim() : "";
  const unitSessionId = typeof r.unitSessionId === "string" ? r.unitSessionId.trim() : "";
  if (!unitId || !unitSessionId) return null;
  const actionRaw = typeof r.actionType === "string" ? r.actionType : "";
  if (!V2_ACTIONS.has(actionRaw)) return null;
  const actionType = actionRaw as ExploreActionHandoffActionType;
  const subRaw = typeof r.sourceSubsurface === "string" ? r.sourceSubsurface : "";
  if (!isSubsurface(subRaw)) return null;

  const pc = r.previewContext;
  if (!pc || typeof pc !== "object") return null;
  const pco = pc as Record<string, unknown>;
  const mode = typeof pco.mode === "string" && isPreviewMode(pco.mode) ? pco.mode : null;
  const confidence = typeof pco.confidence === "string" && isConfidence(pco.confidence) ? pco.confidence : null;
  if (!mode || !confidence) return null;

  const rc = r.reviewContext;
  if (!rc || typeof rc !== "object") return null;
  const rco = rc as Record<string, unknown>;
  const decision = typeof rco.decision === "string" ? rco.decision : "";
  const previewAllowed = rco.previewAllowed === true;
  const publishAllowed = rco.publishAllowed === true;

  const pr = r.presentationContext;
  if (!pr || typeof pr !== "object") return null;
  const pro = pr as Record<string, unknown>;
  const viewport = typeof pro.viewport === "string" && isViewport(pro.viewport) ? pro.viewport : null;
  if (!viewport) return null;
  const compareMode = pro.compareMode === true;
  const fullscreen = pro.fullscreen === true;

  const cc = r.continuityContext;
  if (!cc || typeof cc !== "object") return null;
  const cco = cc as Record<string, unknown>;
  if (cco.returnSurface !== "explore_detail") return null;
  const restoreUnitId = typeof cco.restoreUnitId === "string" ? cco.restoreUnitId.trim() : "";
  const restoreViewport = typeof cco.restoreViewport === "string" ? cco.restoreViewport : "";
  if (!restoreUnitId || !restoreViewport) return null;
  const restoreCompareMode = cco.restoreCompareMode === true;

  const out: ExploreActionHandoffContext = {
    v: EXPLORE_HANDOFF_SCHEMA_VERSION,
    sourceSurface: "explore",
    sourceSubsurface: subRaw,
    actionType,
    unitId,
    unitSessionId,
    previewContext: {
      mode,
      confidence,
      reasonCode: typeof pco.reasonCode === "string" && pco.reasonCode.trim() ? pco.reasonCode.trim() : undefined,
      reasonLabel: typeof pco.reasonLabel === "string" && pco.reasonLabel.trim() ? pco.reasonLabel.trim() : undefined
    },
    reviewContext: { decision, previewAllowed, publishAllowed },
    presentationContext: { viewport, compareMode, fullscreen },
    continuityContext: {
      returnSurface: "explore_detail",
      restoreUnitId,
      restoreViewport,
      restoreCompareMode
    }
  };

  const ic = r.improvementContext;
  if (ic && typeof ic === "object") {
    const ico = ic as Record<string, unknown>;
    const intentRaw = typeof ico.intent === "string" ? ico.intent : "";
    const allowed: ExploreHandoffImprovementIntent[] = [
      "generic_improve",
      "optimize_mobile",
      "tighten_spacing_typography",
      "enhance_visual_hierarchy"
    ];
    const userPromptSeed = typeof ico.userPromptSeed === "string" ? ico.userPromptSeed : "";
    if (allowed.includes(intentRaw as ExploreHandoffImprovementIntent) && userPromptSeed.trim()) {
      return {
        ...out,
        improvementContext: { intent: intentRaw as ExploreHandoffImprovementIntent, userPromptSeed }
      };
    }
  }

  return out;
}

export function parseExploreHandoffJson(raw: string | null | undefined): ExploreActionHandoffContext | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > MAX_JSON_CHARS) return null;
  try {
    const o = JSON.parse(t) as unknown;
    return normalizeExploreHandoffPayload(o);
  } catch {
    return null;
  }
}

export function serializeExploreHandoffForMalvTransport(h: ExploreActionHandoffContext): string {
  return JSON.stringify(h);
}

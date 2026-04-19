import type { ApiBuildUnit } from "../api/dataPlane";
import { optionalImproveRefinementNote, type ExploreOptionalModelTextEnhancement } from "./exploreModelEnhancement";
import { normalizeExploreHandoffPayload, type ExploreActionHandoffContext } from "./exploreActionHandoff.types";
import type { ExploreActionContext } from "./exploreActionContext.types";

/** Subset of Explore preview persist used for improve handoff (avoids circular imports). */
export type ImproveHandoffReviewSnapshot = {
  inlineMode: "fit" | "mobile" | "tablet" | "desktop";
  fullscreen: boolean;
  compareEngaged?: boolean;
};

/** Intake + feasibility snapshot carried into Studio (no extra API). */
export type ImproveReviewSummary = {
  intakeDecision?: string;
  previewFeasible?: boolean;
  feasibilityLabel?: string;
  limitations?: string[];
};

export function buildImproveReviewSummaryFromUnit(
  unit: Pick<ApiBuildUnit, "intakeAuditDecision" | "previewFeasibility">
): ImproveReviewSummary | undefined {
  const pf = unit.previewFeasibility;
  const intake = unit.intakeAuditDecision?.trim();
  const hasPf = Boolean(pf);
  if (!intake && !hasPf) return undefined;
  const feasibilityLabel = pf?.reasonLabel?.trim() || undefined;
  const limitations =
    pf?.blockingIssues?.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4) ?? [];
  return {
    intakeDecision: intake || undefined,
    previewFeasible: pf ? pf.previewFeasible : undefined,
    feasibilityLabel,
    limitations: limitations.length ? limitations : undefined
  };
}

export const STUDIO_IMPROVE_SEED_VERSION = 1 as const;
export const STUDIO_IMPROVE_SEED_STORAGE_KEY = "malv_studio_improve_seed_v1";

/** Outcome-aware improve intent for Explore → Studio handoff and review continuity. */
export type ImproveIntent =
  | "generic_improve"
  | "optimize_mobile"
  | "tighten_spacing_typography"
  | "enhance_visual_hierarchy"
  | "increase_conversion_focus"
  | "modernize_ui"
  | "accessibility_improve";

/** @deprecated Prefer {@link ImproveIntent}; kept for existing imports. */
export type ExploreImproveIntent = ImproveIntent;

export const IMPROVE_INTENTS: readonly ImproveIntent[] = [
  "generic_improve",
  "optimize_mobile",
  "tighten_spacing_typography",
  "enhance_visual_hierarchy",
  "increase_conversion_focus",
  "modernize_ui",
  "accessibility_improve"
] as const;

/** Simplified Explore improve focus — maps to {@link ImproveIntent} for API + Studio. */
export type ImproveFlowIntent = "generic" | "mobile" | "layout" | "typography";

export const EXPLORE_IMPROVE_FLOW_OPTIONS: ReadonlyArray<{
  flow: ImproveFlowIntent;
  intent: ImproveIntent;
  label: string;
  hint?: string;
}> = [
  { flow: "generic", intent: "generic_improve", label: "General polish", hint: "Holistic refinement" },
  { flow: "mobile", intent: "optimize_mobile", label: "Mobile layout", hint: "Narrow viewports & touch" },
  { flow: "layout", intent: "enhance_visual_hierarchy", label: "Layout & structure", hint: "Sections and flow" },
  { flow: "typography", intent: "tighten_spacing_typography", label: "Typography", hint: "Type rhythm & spacing" }
];

export function mapExploreFlowIntentToImproveIntent(flow: ImproveFlowIntent): ImproveIntent {
  const row = EXPLORE_IMPROVE_FLOW_OPTIONS.find((o) => o.flow === flow);
  return row?.intent ?? "generic_improve";
}

/** API accepts only a subset; map unknown intents to generic for truthful server improve. */
export type ApiImproveIntent = "generic_improve" | "optimize_mobile" | "tighten_spacing_typography";

export function mapImproveIntentToApiIntent(intent: ImproveIntent): ApiImproveIntent {
  if (intent === "optimize_mobile") return "optimize_mobile";
  if (intent === "tighten_spacing_typography") return "tighten_spacing_typography";
  return "generic_improve";
}

/** True when Explore’s chosen focus is not mirrored by a distinct server improve intent today. */
export function improveIntentUsesGenericApiPath(intent: ImproveIntent): boolean {
  return mapImproveIntentToApiIntent(intent) === "generic_improve";
}

export type ImproveStudioDeviceMode = "mobile" | "tablet" | "desktop";

export type ImproveContextPayload = {
  v?: number;
  source: "explore_improve";
  unitId: string;
  intent: ImproveIntent;
  deviceMode: ImproveStudioDeviceMode;
  compareMode?: boolean;
  reviewContext?: {
    scrollPosition?: number;
    focusedSection?: string;
  };
  previewFeasibility?: {
    mode?: "live" | "code" | "static" | "none";
    framework?: string;
  };
  exploreActionContext?: ExploreActionContext;
  /** Intake audit + feasibility/limitations from Explore detail. */
  reviewSummary?: ImproveReviewSummary;
  /** When true, Studio runs the existing client improve API once after handoff. */
  autoRunServerImprove?: boolean;
  /** Canonical Explore cross-surface handoff (internal — never show raw fields in UI). */
  exploreHandoff?: ExploreActionHandoffContext;
};

export type ImproveReturnCue = {
  intent: ImproveIntent;
  label: string;
  subtleHighlight?: boolean;
};

/** Derived Studio UX posture from Improve intent — device bar + framing only; no auto-edits. */
export type StudioImprovePosture =
  | "mobile"
  | "visual_polish"
  | "hierarchy"
  | "conversion"
  | "accessibility"
  | "modernization"
  | "general";

/** Lightweight framing for Improve handoff — deterministic from {@link ImproveContextPayload}. */
export type StudioImproveFraming = {
  headline: string;
  sublabel?: string;
  intentLabel: string;
  posture?: StudioImprovePosture;
  /** When Explore recorded a section label/id for the preview focus. */
  focusHint?: string;
  /** Carried for future scroll restoration; not rendered until source data is wired. */
  reviewScrollPosition?: number;
  /** Truthful note when compare was engaged in the handoff payload. */
  compareHandoffNote?: string;
  /** One line from intake / feasibility / limitations. */
  reviewFactsLine?: string;
  /**
   * Bounded optional phrasing for Improve handoff — additive; deterministic `headline` / `reviewFactsLine` stay canonical.
   * @see exploreModelEnhancement
   */
  optionalModelRefinementNote?: string | null;
};

export type ParsedStudioImproveSeed =
  | { kind: "improve"; payload: ImproveContextPayload }
  | { kind: "invalid" };

/** Picker labels — calm, operational copy. */
export const IMPROVE_INTENT_STUDIO_OPTIONS: ReadonlyArray<{ intent: ImproveIntent; label: string; hint?: string }> = [
  { intent: "generic_improve", label: "Improve overall", hint: "General refinement in Studio" },
  { intent: "optimize_mobile", label: "Optimize for mobile", hint: "Narrow viewports & touch" },
  { intent: "tighten_spacing_typography", label: "Tighten spacing & typography", hint: "Rhythm and type scale" },
  { intent: "enhance_visual_hierarchy", label: "Enhance visual hierarchy", hint: "Emphasis and structure" },
  { intent: "increase_conversion_focus", label: "Increase conversion focus", hint: "CTA clarity and flow" },
  { intent: "modernize_ui", label: "Modernize UI", hint: "Contemporary surface patterns" },
  { intent: "accessibility_improve", label: "Improve accessibility", hint: "Contrast, focus, semantics" }
];

function isImproveIntent(x: unknown): x is ImproveIntent {
  return typeof x === "string" && (IMPROVE_INTENTS as readonly string[]).includes(x);
}

function isDeviceMode(x: unknown): x is ImproveStudioDeviceMode {
  return x === "mobile" || x === "tablet" || x === "desktop";
}

/** Map preview inline layout to Studio device bar (fit → desktop). */
export function inferImproveDeviceModeFromReview(
  review: ImproveHandoffReviewSnapshot | null | undefined
): ImproveStudioDeviceMode {
  if (!review || review.fullscreen) return "desktop";
  const m = review.inlineMode;
  if (m === "mobile") return "mobile";
  if (m === "tablet") return "tablet";
  return "desktop";
}

export function buildImproveContextPayload(args: {
  unitId: string;
  intent: ImproveIntent;
  review: ImproveHandoffReviewSnapshot | null | undefined;
  unit: Pick<ApiBuildUnit, "id" | "previewFeasibility" | "intakeAuditDecision">;
  exploreActionContext?: ExploreActionContext | null;
  reviewContext?: ImproveContextPayload["reviewContext"];
  reviewSummary?: ImproveReviewSummary | null;
  autoRunServerImprove?: boolean;
  exploreHandoff?: ExploreActionHandoffContext | null;
}): ImproveContextPayload {
  const pf = args.unit.previewFeasibility;
  let deviceMode = inferImproveDeviceModeFromReview(args.review);
  if (args.intent === "optimize_mobile") deviceMode = "mobile";

  const mergedSummary = args.reviewSummary ?? buildImproveReviewSummaryFromUnit(args.unit);

  return {
    v: STUDIO_IMPROVE_SEED_VERSION,
    source: "explore_improve",
    unitId: args.unitId,
    intent: args.intent,
    deviceMode,
    compareMode: args.review?.compareEngaged === true,
    reviewContext: args.reviewContext,
    previewFeasibility: pf
      ? {
          mode: pf.previewMode,
          framework: typeof pf.signals?.framework === "string" ? pf.signals.framework.trim() || undefined : undefined
        }
      : undefined,
    exploreActionContext: args.exploreActionContext ?? undefined,
    ...(mergedSummary ? { reviewSummary: mergedSummary } : {}),
    ...(args.autoRunServerImprove === true ? { autoRunServerImprove: true } : {}),
    ...(args.exploreHandoff ? { exploreHandoff: args.exploreHandoff } : {})
  };
}

function parseEmbeddedExploreActionContext(e: Record<string, unknown>): ExploreActionContext | null {
  if (typeof e.rawQuery !== "string" || typeof e.normalizedQuery !== "string") return null;
  const intent = e.intent;
  const mq = e.matchQuality;
  if (
    intent !== "keyword_search" &&
    intent !== "assisted_search" &&
    intent !== "broad_idea" &&
    intent !== "create_request"
  ) {
    return null;
  }
  if (mq !== "strong" && mq !== "weak" && mq !== "empty") return null;
  return {
    rawQuery: e.rawQuery,
    normalizedQuery: e.normalizedQuery,
    strippedIdea: typeof e.strippedIdea === "string" ? e.strippedIdea : undefined,
    intent,
    matchQuality: mq,
    suggestedCategories: Array.isArray(e.suggestedCategories)
      ? e.suggestedCategories.filter((x): x is string => typeof x === "string")
      : undefined,
    sourceTab: typeof e.sourceTab === "string" ? e.sourceTab : undefined,
    selectedCategory: typeof e.selectedCategory === "string" ? e.selectedCategory : null,
    selectedType: typeof e.selectedType === "string" ? e.selectedType : null,
    explanationMode:
      e.explanationMode === "strict" || e.explanationMode === "expanded" || e.explanationMode === "catalog"
        ? e.explanationMode
        : undefined,
    resultsExplanation: typeof e.resultsExplanation === "string" ? e.resultsExplanation : undefined
  };
}

export function serializeStudioImproveSeedForUrl(payload: ImproveContextPayload, maxLen = 12_000): string {
  let json = JSON.stringify(payload);
  if (json.length <= maxLen) return json;
  const trimmed: ImproveContextPayload = {
    ...payload,
    exploreActionContext: payload.exploreActionContext
      ? {
          ...payload.exploreActionContext,
          rawQuery: payload.exploreActionContext.rawQuery.slice(0, 1200),
          normalizedQuery: payload.exploreActionContext.normalizedQuery.slice(0, 1200),
          strippedIdea: payload.exploreActionContext.strippedIdea?.slice(0, 600),
          resultsExplanation: payload.exploreActionContext.resultsExplanation?.slice(0, 800)
        }
      : undefined
  };
  json = JSON.stringify(trimmed);
  if (json.length <= maxLen) return json;
  const minimal: ImproveContextPayload = {
    v: STUDIO_IMPROVE_SEED_VERSION,
    source: "explore_improve",
    unitId: payload.unitId,
    intent: payload.intent,
    deviceMode: payload.deviceMode,
    compareMode: payload.compareMode,
    reviewContext: payload.reviewContext,
    previewFeasibility: payload.previewFeasibility
  };
  return JSON.stringify(minimal);
}

export function parseStudioImproveSeed(raw: string): ParsedStudioImproveSeed {
  const t = raw.trim();
  if (!t.startsWith("{")) return { kind: "invalid" };
  try {
    const o = JSON.parse(t) as unknown;
    if (!o || typeof o !== "object") return { kind: "invalid" };
    const r = o as Record<string, unknown>;
    if (r.source !== "explore_improve") return { kind: "invalid" };
    if (typeof r.unitId !== "string" || !r.unitId.trim()) return { kind: "invalid" };
    if (!isImproveIntent(r.intent)) return { kind: "invalid" };
    const deviceMode = isDeviceMode(r.deviceMode) ? r.deviceMode : inferImproveDeviceModeFromReview(null);

    const payload: ImproveContextPayload = {
      v: typeof r.v === "number" ? r.v : STUDIO_IMPROVE_SEED_VERSION,
      source: "explore_improve",
      unitId: r.unitId.trim(),
      intent: r.intent,
      deviceMode,
      compareMode: r.compareMode === true
    };

    const rc = r.reviewContext;
    if (rc && typeof rc === "object" && rc !== null) {
      const rcO = rc as Record<string, unknown>;
      const scrollPosition =
        typeof rcO.scrollPosition === "number" && Number.isFinite(rcO.scrollPosition) ? rcO.scrollPosition : undefined;
      const focusedSection = typeof rcO.focusedSection === "string" ? rcO.focusedSection : undefined;
      if (scrollPosition !== undefined || focusedSection !== undefined) {
        payload.reviewContext = { scrollPosition, focusedSection };
      }
    }

    const pf = r.previewFeasibility;
    if (pf && typeof pf === "object" && pf !== null) {
      const p = pf as Record<string, unknown>;
      const mode = p.mode;
      const framework = typeof p.framework === "string" ? p.framework : undefined;
      if (mode === "live" || mode === "code" || mode === "static" || mode === "none") {
        payload.previewFeasibility = { mode, framework };
      } else if (framework) {
        payload.previewFeasibility = { framework };
      }
    }

    const eac = r.exploreActionContext;
    if (eac && typeof eac === "object" && eac !== null) {
      const e = eac as Record<string, unknown>;
      const embedded = parseEmbeddedExploreActionContext(e);
      if (embedded) payload.exploreActionContext = embedded;
    }

    if (r.autoRunServerImprove === true) payload.autoRunServerImprove = true;

    const eh = r.exploreHandoff;
    if (eh && typeof eh === "object") {
      const normalized = normalizeExploreHandoffPayload(eh);
      if (normalized) payload.exploreHandoff = normalized;
    }

    const rs = r.reviewSummary;
    if (rs && typeof rs === "object" && rs !== null) {
      const o = rs as Record<string, unknown>;
      const intakeDecision = typeof o.intakeDecision === "string" ? o.intakeDecision : undefined;
      const feasibilityLabel = typeof o.feasibilityLabel === "string" ? o.feasibilityLabel : undefined;
      const previewFeasible = o.previewFeasible === true ? true : o.previewFeasible === false ? false : undefined;
      const limRaw = o.limitations;
      const limitations =
        Array.isArray(limRaw)
          ? limRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 6)
          : undefined;
      if (intakeDecision || feasibilityLabel || previewFeasible !== undefined || (limitations && limitations.length)) {
        payload.reviewSummary = {
          intakeDecision,
          feasibilityLabel,
          previewFeasible,
          limitations
        };
      }
    }

    return { kind: "improve", payload };
  } catch {
    return { kind: "invalid" };
  }
}

export function persistStudioImproveSeedContext(payload: ImproveContextPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STUDIO_IMPROVE_SEED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readPersistedStudioImproveSeed(): ImproveContextPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STUDIO_IMPROVE_SEED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseStudioImproveSeed(raw);
    return parsed.kind === "improve" ? parsed.payload : null;
  } catch {
    return null;
  }
}

/** Studio handoff: only prepend supplement when the composer has no in-progress user text. */
export function mergeComposerWithImproveSupplementIfEmpty(prev: string, base: string, supplement: string | null | undefined): string {
  if (prev.trim()) return prev;
  const b = base.trimEnd();
  const s = supplement?.trim();
  return s ? `${s}\n\n${b}` : b;
}

/** Maps Improve intent to Studio posture (preview framing / device rules — deterministic). */
export function improveIntentToStudioPosture(intent: ImproveIntent): StudioImprovePosture {
  switch (intent) {
    case "optimize_mobile":
      return "mobile";
    case "tighten_spacing_typography":
      return "visual_polish";
    case "enhance_visual_hierarchy":
      return "hierarchy";
    case "increase_conversion_focus":
      return "conversion";
    case "accessibility_improve":
      return "accessibility";
    case "modernize_ui":
      return "modernization";
    default:
      return "general";
  }
}

function improveIntentFramingSublabel(intent: ImproveIntent): string | undefined {
  if (improveIntentUsesGenericApiPath(intent) && intent !== "generic_improve") {
    return "Your chosen focus shapes Studio and the composer; the automated improve step uses MALV’s general path today (not a separate server specialization per focus).";
  }
  switch (intent) {
    case "generic_improve":
      return "Holistic refinement and polish in Studio.";
    case "optimize_mobile":
      return "Narrow viewports, responsiveness, and touch-friendly structure.";
    case "tighten_spacing_typography":
      return "Rhythm, type scale, and visual cleanliness.";
    case "enhance_visual_hierarchy":
      return "Emphasis, structure, and reading flow.";
    case "increase_conversion_focus":
      return "Primary actions, flow, and clarity of next steps.";
    case "modernize_ui":
      return "Contemporary patterns and cohesive surface treatment.";
    case "accessibility_improve":
      return "Contrast, semantics, focus, and interaction clarity.";
    default:
      return undefined;
  }
}

/** Primary line in Studio — matches what the user chose in Explore. */
export function studioImprovePrimaryLine(payload: ImproveContextPayload): string {
  if (improveIntentUsesGenericApiPath(payload.intent) && payload.intent !== "generic_improve") {
    if (payload.deviceMode === "mobile") return "Improving with your mobile preview context";
    return "Improving this preview";
  }
  switch (payload.intent) {
    case "optimize_mobile":
      return "Improving for mobile layout";
    case "tighten_spacing_typography":
      return "Improving typography & spacing";
    case "enhance_visual_hierarchy":
      return "Improving layout & hierarchy";
    default:
      if (payload.deviceMode === "mobile") return "Improving with your mobile preview context";
      return "Improving this preview";
  }
}

/** Short outcome for Explore cue strip after Studio improve. */
export function improveOutcomeShortLabel(intent: ImproveIntent): string {
  if (improveIntentUsesGenericApiPath(intent) && intent !== "generic_improve") {
    return "Preview refined";
  }
  switch (intent) {
    case "optimize_mobile":
      return "Mobile layout improved";
    case "tighten_spacing_typography":
      return "Typography refined";
    case "enhance_visual_hierarchy":
      return "Layout improved";
    default:
      return "Preview refined";
  }
}

function reviewSummaryFramingLine(s: ImproveReviewSummary | undefined): string | undefined {
  if (!s) return undefined;
  const parts: string[] = [];
  if (s.intakeDecision) parts.push(`Intake: ${s.intakeDecision.replace(/_/g, " ")}`);
  if (typeof s.previewFeasible === "boolean") {
    parts.push(s.previewFeasible ? "Preview checks passed" : "Preview constraints apply");
  }
  if (s.feasibilityLabel?.trim()) parts.push(s.feasibilityLabel.trim().slice(0, 140));
  if (s.limitations?.length) parts.push(`${s.limitations.length} limitation(s) noted in Explore`);
  return parts.length ? parts.join(" · ") : undefined;
}

export type DeriveStudioImproveFramingOptions = {
  /** Future: bounded optional copy from Explore-side model assist — never overwrites factual review lines. */
  optionalModelEnhancement?: ExploreOptionalModelTextEnhancement | null;
};

/** Deterministic framing for the Studio Improve context strip. */
export function deriveStudioImproveFraming(
  payload: ImproveContextPayload,
  options?: DeriveStudioImproveFramingOptions | null
): StudioImproveFraming {
  const row = IMPROVE_INTENT_STUDIO_OPTIONS.find((o) => o.intent === payload.intent);
  const flowRow = EXPLORE_IMPROVE_FLOW_OPTIONS.find((o) => o.intent === payload.intent);
  const intentLabel = flowRow?.label ?? row?.label ?? "Improve";
  const focused = payload.reviewContext?.focusedSection?.trim();
  const scroll = payload.reviewContext?.scrollPosition;
  return {
    headline: studioImprovePrimaryLine(payload),
    sublabel: improveIntentFramingSublabel(payload.intent),
    intentLabel,
    posture: improveIntentToStudioPosture(payload.intent),
    focusHint: focused || undefined,
    reviewScrollPosition: typeof scroll === "number" && Number.isFinite(scroll) ? scroll : undefined,
    compareHandoffNote: payload.compareMode ? "Compare layout was on when you left Explore." : undefined,
    reviewFactsLine: reviewSummaryFramingLine(payload.reviewSummary),
    optionalModelRefinementNote: optionalImproveRefinementNote(options?.optionalModelEnhancement ?? null)
  };
}

/** Short caption for intent posture — calm, operational; omit noise for general. */
export function studioImprovePostureCaption(posture: StudioImprovePosture | undefined): string | null {
  if (!posture || posture === "general") return null;
  switch (posture) {
    case "mobile":
      return "Studio preview favors a narrow, touch-first posture.";
    case "visual_polish":
      return "Posture: spacing, typography, and visual polish.";
    case "hierarchy":
      return "Posture: hierarchy, emphasis, and reading flow.";
    case "conversion":
      return "Posture: conversion clarity and primary actions.";
    case "accessibility":
      return "Posture: accessibility and inclusive interaction.";
    case "modernization":
      return "Posture: modernization and contemporary UI craft.";
    default:
      return null;
  }
}

/** Single-line preview feasibility note for handoff UI; null when nothing to show. */
export function studioImprovePreviewFeasibilityNote(
  payload: Pick<ImproveContextPayload, "previewFeasibility">
): string | null {
  const pf = payload.previewFeasibility;
  if (!pf?.mode && !pf?.framework?.trim()) return null;
  const fw = pf.framework?.trim();
  if (pf.mode && fw) return `Explore preview snapshot: ${pf.mode} · ${fw}`;
  if (pf.mode) return `Explore preview snapshot: ${pf.mode}`;
  return `Explore preview snapshot: ${fw}`;
}

/** One-line composer supplement when Studio composer is empty — intent-shaped, factual (no AI role-play). */
export function studioImproveSeedComposerSupplement(payload: ImproveContextPayload): string {
  let line: string;
  switch (payload.intent) {
    case "optimize_mobile":
      line = "Focus on mobile layout, responsiveness, spacing, and touch-friendly structure.";
      break;
    case "tighten_spacing_typography":
      line = "Focus on spacing rhythm, typography balance, and visual cleanliness.";
      break;
    case "enhance_visual_hierarchy":
      line = "Focus on clarity, emphasis, reading flow, and section priority.";
      break;
    case "increase_conversion_focus":
      line = "Focus on CTA clarity, conversion flow, emphasis, and friction reduction.";
      break;
    case "accessibility_improve":
      line = "Focus on accessibility, readability, contrast, and interaction clarity.";
      break;
    case "modernize_ui":
      line = "Focus on contemporary patterns, surface consistency, and modern UI craft.";
      break;
    default:
      line = "Focus on holistic refinement, layout balance, and polish.";
      break;
  }
  return payload.compareMode ? `${line} Explore compare layout was on.` : line;
}

export function buildImproveReturnCue(intent: ImproveIntent): ImproveReturnCue {
  const row = IMPROVE_INTENT_STUDIO_OPTIONS.find((o) => o.intent === intent);
  const label = row?.label ?? "Improve";
  const subtleHighlight = intent !== "generic_improve";
  return { intent, label, subtleHighlight };
}

/** Primary Studio / handoff line for the active Improve intent from Explore. */
export function exploreImproveIntentHeadline(intent: ImproveIntent): string {
  switch (intent) {
    case "optimize_mobile":
      return "Optimizing for mobile";
    case "tighten_spacing_typography":
      return "Refining spacing & typography";
    case "enhance_visual_hierarchy":
      return "Strengthening visual hierarchy";
    case "increase_conversion_focus":
      return "Sharpening conversion focus";
    case "modernize_ui":
      return "Modernizing UI";
    case "accessibility_improve":
      return "Improving accessibility";
    default:
      return "Improving this result";
  }
}

/** Short noun phrase for return cues, e.g. “visual hierarchy improvement”. */
export function improveIntentStudioReturnPhrase(intent: ImproveIntent): string {
  if (improveIntentUsesGenericApiPath(intent) && intent !== "generic_improve") {
    return "Studio refinement";
  }
  switch (intent) {
    case "optimize_mobile":
      return "mobile optimization";
    case "tighten_spacing_typography":
      return "spacing & typography refinement";
    case "enhance_visual_hierarchy":
      return "visual hierarchy improvement";
    case "increase_conversion_focus":
      return "conversion-focused refinement";
    case "modernize_ui":
      return "UI modernization";
    case "accessibility_improve":
      return "accessibility improvement";
    default:
      return "Studio refinement";
  }
}

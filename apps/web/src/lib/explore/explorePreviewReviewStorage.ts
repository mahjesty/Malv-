/** Shared with BuildUnitLivePreviewFrame — kept here to avoid circular imports with persistence. */
import {
  IMPROVE_INTENTS,
  improveIntentStudioReturnPhrase,
  type ImproveIntent
} from "./improveContext";

export type LivePreviewInlineLayoutMode = "fit" | "mobile" | "tablet" | "desktop";
export type LivePreviewStudioHandoffLayout = LivePreviewInlineLayoutMode | "fullscreen";

export type { ExploreImproveIntent, ImproveIntent } from "./improveContext";

const STORAGE_KEY = "malv_explore_preview_review_v1";
const STUDIO_RETURN_KEY = "malv_explore_studio_return_v1";
const CHAT_RETURN_KEY = "malv_explore_chat_return_v1";
const ACTION_CTX_PREFIX = "malv_explore_preview_action_ctx_v1_";

const INLINE_MODES: LivePreviewInlineLayoutMode[] = ["fit", "mobile", "tablet", "desktop"];

export type ExplorePreviewReviewPersist = {
  inlineMode: LivePreviewInlineLayoutMode;
  fullscreen: boolean;
  /** User engaged the mobile↔desktop compare workflow */
  compareEngaged?: boolean;
};

export type ExplorePreviewActionContext = {
  sourceSurface: "explore_preview";
  unitId: string;
  /** Current inline layout mode (also reflected in `layout` when not fullscreen). */
  inlineMode: LivePreviewInlineLayoutMode;
  displaySurface: "fullscreen" | "inline";
  /** Handoff layout: fullscreen token or inline mode */
  layout: LivePreviewStudioHandoffLayout;
  compareEngaged: boolean;
  improveIntent: ImproveIntent;
  savedAt: number;
};

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readAll(): Record<string, ExplorePreviewReviewPersist> {
  if (typeof window === "undefined") return {};
  const root = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (!root) return {};
  const out: Record<string, ExplorePreviewReviewPersist> = {};
  for (const [unitId, val] of Object.entries(root)) {
    if (!val || typeof val !== "object") continue;
    const o = val as Record<string, unknown>;
    const inlineRaw = typeof o.inlineMode === "string" ? o.inlineMode : "fit";
    const inlineMode = INLINE_MODES.includes(inlineRaw as LivePreviewInlineLayoutMode)
      ? (inlineRaw as LivePreviewInlineLayoutMode)
      : "fit";
    const fullscreen = o.fullscreen === true;
    const compareEngaged = o.compareEngaged === true;
    out[unitId] = { inlineMode, fullscreen, compareEngaged };
  }
  return out;
}

function writeAll(next: Record<string, ExplorePreviewReviewPersist>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function readExplorePreviewReview(unitId: string): ExplorePreviewReviewPersist | null {
  const all = readAll();
  return all[unitId] ?? null;
}

export function mergeExplorePreviewReview(unitId: string, patch: Partial<ExplorePreviewReviewPersist>) {
  const all = readAll();
  const prev = all[unitId];
  const base: ExplorePreviewReviewPersist = prev ?? { inlineMode: "fit", fullscreen: false };
  all[unitId] = { ...base, ...patch };
  writeAll(all);
}

function parseImproveIntent(raw: unknown): ImproveIntent {
  if (typeof raw === "string" && (IMPROVE_INTENTS as readonly string[]).includes(raw)) {
    return raw as ImproveIntent;
  }
  return "generic_improve";
}

function parseInlineMode(raw: unknown): LivePreviewInlineLayoutMode {
  if (typeof raw === "string" && INLINE_MODES.includes(raw as LivePreviewInlineLayoutMode)) {
    return raw as LivePreviewInlineLayoutMode;
  }
  return "fit";
}

/** After Improve creates a new unit, copy review + action context from the source id. */
export function inheritExplorePreviewReviewForImprovedUnit(sourceUnitId: string, improvedUnitId: string) {
  if (typeof window === "undefined" || sourceUnitId === improvedUnitId) return;
  const review = readExplorePreviewReview(sourceUnitId);
  if (review) {
    mergeExplorePreviewReview(improvedUnitId, { ...review });
  }
  const act = readExplorePreviewActionContext(sourceUnitId);
  if (act) {
    setExplorePreviewActionContext(improvedUnitId, {
      sourceSurface: "explore_preview",
      unitId: improvedUnitId,
      inlineMode: act.inlineMode,
      displaySurface: act.displaySurface,
      layout: act.layout,
      compareEngaged: act.compareEngaged,
      improveIntent: act.improveIntent
    });
  }
}

/** Call before Improve / Studio / quick actions so downstream surfaces can read client-side context (no API change). */
export function setExplorePreviewActionContext(
  unitId: string,
  ctx: Omit<ExplorePreviewActionContext, "savedAt" | "sourceSurface" | "unitId"> & {
    sourceSurface?: "explore_preview";
    unitId?: string;
  }
) {
  if (typeof window === "undefined") return;
  const full: ExplorePreviewActionContext = {
    sourceSurface: "explore_preview",
    unitId: ctx.unitId ?? unitId,
    inlineMode: ctx.inlineMode,
    displaySurface: ctx.displaySurface,
    layout: ctx.layout,
    compareEngaged: ctx.compareEngaged,
    improveIntent: ctx.improveIntent ?? "generic_improve",
    savedAt: Date.now()
  };
  try {
    window.sessionStorage.setItem(`${ACTION_CTX_PREFIX}${unitId}`, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export function readExplorePreviewActionContext(unitId: string): ExplorePreviewActionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${ACTION_CTX_PREFIX}${unitId}`);
    if (!raw) return null;
    const o = safeParse(raw);
    if (!o || typeof o.layout !== "string") return null;
    const layout = o.layout as LivePreviewStudioHandoffLayout;
    const inlineMode: LivePreviewInlineLayoutMode =
      o.inlineMode !== undefined
        ? parseInlineMode(o.inlineMode)
        : layout === "fullscreen"
          ? "fit"
          : parseInlineMode(layout);
    const displaySurface: "fullscreen" | "inline" =
      o.displaySurface === "fullscreen" || layout === "fullscreen" ? "fullscreen" : "inline";
    return {
      sourceSurface: "explore_preview",
      unitId: typeof o.unitId === "string" ? o.unitId : unitId,
      inlineMode,
      displaySurface,
      layout,
      compareEngaged: o.compareEngaged === true,
      improveIntent: parseImproveIntent(o.improveIntent),
      savedAt: typeof o.savedAt === "number" ? o.savedAt : 0
    };
  } catch {
    return null;
  }
}

export { exploreImproveIntentHeadline } from "./improveContext";

/**
 * Secondary line: restored Explore review posture (compare, fullscreen, mode).
 * Used in Studio handoff banner when Explore action context is present.
 */
export function exploreReviewPostureSecondaryLine(ctx: ExplorePreviewActionContext): string | null {
  const mode =
    ctx.displaySurface === "fullscreen" || ctx.layout === "fullscreen"
      ? "fullscreen"
      : ctx.inlineMode;
  if (ctx.compareEngaged && (mode === "mobile" || mode === "desktop")) {
    return mode === "mobile"
      ? "Review posture: mobile · desktop compare"
      : "Review posture: desktop · mobile compare";
  }
  if (ctx.displaySurface === "fullscreen" || ctx.layout === "fullscreen") {
    return "Review posture: fullscreen theater";
  }
  if (mode === "mobile") return "Review posture: mobile mode";
  if (mode === "desktop") return "Review posture: desktop mode";
  if (mode === "tablet") return "Review posture: tablet mode";
  if (mode === "fit") return "Review posture: fit preview";
  return null;
}

/** Fallback posture line when session action context is missing (older handoffs). */
export function exploreReviewPostureSecondaryLineFromLayout(layout: string | null | undefined): string | null {
  const l = (layout ?? "").trim().toLowerCase();
  if (!l) return null;
  if (l === "fullscreen") return "Review posture: fullscreen theater";
  if (l === "mobile") return "Review posture: mobile mode";
  if (l === "desktop") return "Review posture: desktop mode";
  if (l === "tablet") return "Review posture: tablet mode";
  if (l === "fit") return "Review posture: fit preview";
  return null;
}

/** Short line for post-navigation or post-improve review cues. */
export function formatExploreReviewReturnCue(
  r: ExplorePreviewReviewPersist | null,
  kind: "studio_return" | "post_improve",
  improveIntent?: ImproveIntent | null
): string {
  const mode = r?.fullscreen ? "fullscreen" : (r?.inlineMode ?? "fit");
  const compare = Boolean(r?.compareEngaged) && (mode === "mobile" || mode === "desktop");

  const modePhrase =
    mode === "fullscreen"
      ? "fullscreen"
      : mode === "fit"
        ? "fit"
        : mode === "mobile"
          ? "mobile"
          : mode === "tablet"
            ? "tablet"
            : "desktop";

  const intent = improveIntent ?? "generic_improve";
  const phrase = improveIntentStudioReturnPhrase(intent);

  if (kind === "studio_return") {
    if (intent !== "generic_improve") {
      if (compare) {
        return mode === "mobile"
          ? `Returned from ${phrase} · mobile compare`
          : `Returned from ${phrase} · desktop compare`;
      }
      if (mode === "fullscreen") return `Returned from ${phrase} · fullscreen`;
      return `Returned from ${phrase} in Studio`;
    }
    if (compare) {
      return mode === "mobile"
        ? "Returned to mobile compare review"
        : "Returned to desktop compare review";
    }
    if (mode === "fullscreen") return "Returned to fullscreen review";
    return `Returned to ${modePhrase} preview review`;
  }

  /* post_improve */
  if (intent !== "generic_improve") {
    if (compare) {
      return mode === "mobile"
        ? `Reviewing update after ${phrase} · mobile compare`
        : `Reviewing update after ${phrase} · desktop compare`;
    }
    if (mode === "fullscreen") return `Reviewing update after ${phrase} · fullscreen`;
    return `Reviewing update after ${phrase}`;
  }

  if (compare) {
    return mode === "mobile"
      ? "Reviewing updated result in mobile compare mode"
      : "Reviewing updated result in desktop compare mode";
  }
  if (mode === "fullscreen") return "Reviewing updated result in fullscreen mode";
  return `Reviewing updated result in ${modePhrase} mode`;
}

export type ExploreStudioReturnPayload = {
  unitId: string;
  livePreviewLayout: string | null;
  /** When set, restores compare engagement with the reopened unit. */
  compareEngaged?: boolean;
  /** Short line after Studio ran improve (shown on Explore, auto-dismiss). */
  outcomeHint?: string;
  savedAt: number;
};

export function setExploreStudioReturn(payload: Omit<ExploreStudioReturnPayload, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const full: ExploreStudioReturnPayload = { ...payload, savedAt: Date.now() };
    window.sessionStorage.setItem(STUDIO_RETURN_KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

/** Returns and removes the payload if present and fresh (24h). */
export function consumeExploreStudioReturn(): ExploreStudioReturnPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STUDIO_RETURN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STUDIO_RETURN_KEY);
    const o = safeParse(raw);
    if (!o || typeof o.unitId !== "string") return null;
    const savedAt = typeof o.savedAt === "number" ? o.savedAt : 0;
    if (Date.now() - savedAt > 86_400_000) return null;
    const livePreviewLayout = typeof o.livePreviewLayout === "string" ? o.livePreviewLayout : null;
    const compareEngaged = o.compareEngaged === true ? true : o.compareEngaged === false ? false : undefined;
    const outcomeHint = typeof o.outcomeHint === "string" && o.outcomeHint.trim() ? o.outcomeHint.trim() : undefined;
    return { unitId: o.unitId, livePreviewLayout, compareEngaged, outcomeHint, savedAt };
  } catch {
    return null;
  }
}

export function setExploreChatReturn(payload: Omit<ExploreStudioReturnPayload, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const full: ExploreStudioReturnPayload = { ...payload, savedAt: Date.now() };
    window.sessionStorage.setItem(CHAT_RETURN_KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

/** Same shape as studio return — restores Explore detail + review posture after Chat. */
export function consumeExploreChatReturn(): ExploreStudioReturnPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHAT_RETURN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(CHAT_RETURN_KEY);
    const o = safeParse(raw);
    if (!o || typeof o.unitId !== "string") return null;
    const savedAt = typeof o.savedAt === "number" ? o.savedAt : 0;
    if (Date.now() - savedAt > 86_400_000) return null;
    const livePreviewLayout = typeof o.livePreviewLayout === "string" ? o.livePreviewLayout : null;
    const compareEngaged = o.compareEngaged === true ? true : o.compareEngaged === false ? false : undefined;
    const outcomeHint = typeof o.outcomeHint === "string" && o.outcomeHint.trim() ? o.outcomeHint.trim() : undefined;
    return { unitId: o.unitId, livePreviewLayout, compareEngaged, outcomeHint, savedAt };
  } catch {
    return null;
  }
}

export function layoutStringToPersist(layout: string): Pick<ExplorePreviewReviewPersist, "inlineMode" | "fullscreen"> {
  const l = layout.trim().toLowerCase();
  if (l === "fullscreen") return { inlineMode: "fit", fullscreen: true };
  const inline = INLINE_MODES.includes(l as LivePreviewInlineLayoutMode) ? (l as LivePreviewInlineLayoutMode) : "fit";
  return { inlineMode: inline, fullscreen: false };
}

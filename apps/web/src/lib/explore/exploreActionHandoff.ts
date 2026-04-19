import type { ApiBuildUnit, ApiPreviewFeasibility } from "../api/dataPlane";
import type { ExploreActionContext } from "./exploreActionContext.types";
import type { ExplorePreviewReviewPersist, LivePreviewStudioHandoffLayout } from "./explorePreviewReviewStorage";
import type { ImproveIntent } from "./improveContext";
import {
  EXPLORE_HANDOFF_SCHEMA_VERSION,
  ExploreActionIntent,
  parseExploreHandoffJson,
  serializeExploreHandoffForMalvTransport,
  type ExploreActionHandoffActionType,
  type ExploreActionHandoffContext,
  type ExploreHandoffImprovementIntent,
  type ExploreHandoffPreviewConfidence,
  type ExploreHandoffPreviewMode,
  type ExploreHandoffPresentationViewport,
  type ExploreHandoffSourceSubsurface
} from "./exploreActionHandoff.types";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function mapPreviewFeasibilityToHandoffPreview(pf: ApiPreviewFeasibility | null | undefined): {
  mode: ExploreHandoffPreviewMode;
  confidence: ExploreHandoffPreviewConfidence;
  reasonCode?: string;
  reasonLabel?: string;
} {
  if (!pf) {
    return { mode: "technical_fallback", confidence: "low" };
  }
  const reasonCode = pf.reasonCode?.trim() || undefined;
  const reasonLabel = pf.reasonLabel?.trim() || undefined;
  let mode: ExploreHandoffPreviewMode;
  switch (pf.previewMode) {
    case "live":
      mode = "live";
      break;
    case "static":
      mode = "static";
      break;
    case "code":
      mode = "structured_fallback";
      break;
    default:
      mode = "technical_fallback";
  }
  let confidence: ExploreHandoffPreviewConfidence = "medium";
  if (mode === "live" && pf.previewFeasible) confidence = "high";
  else if (mode === "technical_fallback" || !pf.previewFeasible) confidence = "low";
  return { mode, confidence, reasonCode, reasonLabel };
}

function layoutToPresentationViewport(layout: LivePreviewStudioHandoffLayout): ExploreHandoffPresentationViewport {
  if (layout === "fullscreen") return "fit";
  return layout;
}

function improvementIntentForPayload(
  actionType: ExploreActionHandoffActionType,
  improveIntent: ImproveIntent | null
): ExploreHandoffImprovementIntent {
  if (actionType === ExploreActionIntent.OptimizeMobile) return "optimize_mobile";
  if (actionType === ExploreActionIntent.TightenSpacingTypography) return "tighten_spacing_typography";
  if (actionType === ExploreActionIntent.EnhanceVisualHierarchy) return "enhance_visual_hierarchy";
  if (improveIntent) return mapImproveIntentToHandoffImprovementIntent(improveIntent);
  return "generic_improve";
}

export function mapImproveIntentToHandoffImprovementIntent(intent: ImproveIntent): ExploreHandoffImprovementIntent {
  switch (intent) {
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

export function inferExploreSourceSubsurface(args: {
  /** True when the action originates from the live preview chrome (toolbar / refine). */
  fromPreviewChrome: boolean;
  /** True when the unit detail panel is open for this unit (vs grid-only). */
  detailPanelOpenForUnit: boolean;
  layout: LivePreviewStudioHandoffLayout;
  compareEngaged: boolean;
}): ExploreHandoffSourceSubsurface {
  if (!args.fromPreviewChrome) {
    return args.detailPanelOpenForUnit ? "detail" : "grid";
  }
  if (args.compareEngaged) return "compare_mode";
  if (args.layout === "fullscreen") return "fullscreen_preview";
  return "detail";
}

export function exploreHandoffActionTypeFromExplore(args: {
  action: "open_studio" | "improve" | "ask_malv" | "continue_in_chat";
  improveIntent?: ImproveIntent | null;
}): ExploreActionHandoffActionType {
  if (args.action === "open_studio") return ExploreActionIntent.OpenStudio;
  if (args.action === "ask_malv") return ExploreActionIntent.AskMalv;
  if (args.action === "continue_in_chat") return ExploreActionIntent.ContinueInChat;
  const i = args.improveIntent ?? "generic_improve";
  if (i === "optimize_mobile") return ExploreActionIntent.OptimizeMobile;
  if (i === "tighten_spacing_typography") return ExploreActionIntent.TightenSpacingTypography;
  if (i === "enhance_visual_hierarchy") return ExploreActionIntent.EnhanceVisualHierarchy;
  return ExploreActionIntent.Improve;
}

/** User-visible composer seeds — never include ids. */
export function exploreHandoffVisibleComposerText(args: {
  actionType: ExploreActionHandoffActionType;
  unitTitle: string;
  improveIntent?: ImproveIntent | null;
}): string {
  const title = args.unitTitle.trim() || "this screen";
  const short = title.slice(0, 80);
  switch (args.actionType) {
    case ExploreActionIntent.AskMalv:
      return `What should I improve first on “${short}”?`;
    case ExploreActionIntent.ContinueInChat:
      return `Let’s keep going on “${short}” — I want clearer next steps.`;
    case ExploreActionIntent.OptimizeMobile:
      return `Help me improve “${short}” for mobile — layout, spacing, and touch-friendly flow.`;
    case ExploreActionIntent.TightenSpacingTypography:
      return `Tighten spacing and typography for “${short}” so it feels more polished.`;
    case ExploreActionIntent.EnhanceVisualHierarchy:
      return `Improve visual hierarchy on “${short}” — emphasis, grouping, and scanability.`;
    case ExploreActionIntent.DebugPreviewIssue:
      return `Why is the preview unavailable or misbehaving for “${short}”?`;
    case ExploreActionIntent.ExplainReviewOutcome:
      return `Walk me through the review outcome for “${short}” and what it means for shipping.`;
    case ExploreActionIntent.Improve:
      return `What’s wrong with this design for “${short}”, and what should we fix first?`;
    case ExploreActionIntent.OpenStudio:
    default:
      return `I opened “${short}” from Explore — help me plan the best Studio pass.`;
  }
}

export function exploreHandoffChatCardCopy(args: {
  actionType: ExploreActionHandoffActionType;
  unitTitle: string;
}): { originLine: string; cardSubtitle: string; intentLine: string } {
  const t = args.unitTitle.trim() || "Selected unit";
  const originLine = "From Explore";
  const cardSubtitle = t.length > 56 ? `${t.slice(0, 54)}…` : t;
  let intentLine = "Continuing with context from your Explore session.";
  switch (args.actionType) {
    case ExploreActionIntent.OptimizeMobile:
    case ExploreActionIntent.Improve:
      intentLine = "Focus: design refinement and mobile-friendly layout.";
      break;
    case ExploreActionIntent.EnhanceVisualHierarchy:
      intentLine = "Focus: structure, emphasis, and visual flow.";
      break;
    case ExploreActionIntent.TightenSpacingTypography:
      intentLine = "Focus: typographic rhythm and spacing.";
      break;
    case ExploreActionIntent.AskMalv:
      intentLine = "Ready to discuss this screen with full Explore context.";
      break;
    case ExploreActionIntent.ContinueInChat:
      intentLine = "Picking up where you left off in Explore.";
      break;
    case ExploreActionIntent.OpenStudio:
      intentLine = "Explore item linked — chat stays aligned with your preview posture.";
      break;
    case ExploreActionIntent.DebugPreviewIssue:
      intentLine = "Preview delivery context is attached for troubleshooting.";
      break;
    case ExploreActionIntent.ExplainReviewOutcome:
      intentLine = "Review policy context is attached for a clear explanation.";
      break;
    default:
      break;
  }
  return { originLine, cardSubtitle, intentLine };
}

/** Replaces verbose internal “Context:” lines when a canonical handoff is present. */
export function exploreHandoffCalmStudioComposerLead(h: ExploreActionHandoffContext, unitTitle: string): string {
  const title = unitTitle.trim() || "this build unit";
  const preview = h.previewContext;
  let previewClause = "";
  if (preview.mode === "live") previewClause = " Live preview was available in Explore.";
  else if (preview.mode === "static") previewClause = " Explore used a static preview for this unit.";
  else if (preview.mode === "structured_fallback")
    previewClause = " Explore used a structured (code-derived) preview path.";
  else previewClause = " Explore had limited preview fidelity for this unit — Studio preview may differ.";
  if (preview.reasonLabel?.trim()) {
    previewClause += ` Note: ${preview.reasonLabel.trim()}`;
  }
  const posture: string[] = [];
  if (h.presentationContext.fullscreen) posture.push("fullscreen");
  if (h.presentationContext.compareMode) posture.push("compare");
  if (h.presentationContext.viewport && h.presentationContext.viewport !== "fit") {
    posture.push(`${h.presentationContext.viewport} viewport`);
  }
  const postureBit = posture.length ? ` You were reviewing in ${posture.join(", ")}.` : "";
  return `You opened «${title.slice(0, 120)}» from Explore.${postureBit}${previewClause}\n\n`;
}

export function exploreHandoffStudioBannerCopy(h: ExploreActionHandoffContext): { primary: string; secondary?: string } {
  if (
    h.actionType === ExploreActionIntent.OptimizeMobile ||
    h.improvementContext?.intent === "optimize_mobile"
  ) {
    return { primary: "Improving mobile view", secondary: "From Explore" };
  }
  if (h.actionType === ExploreActionIntent.TightenSpacingTypography) {
    return { primary: "Refining spacing & type", secondary: "From Explore" };
  }
  if (h.actionType === ExploreActionIntent.EnhanceVisualHierarchy) {
    return { primary: "Enhancing visual hierarchy", secondary: "From Explore" };
  }
  if (h.actionType === ExploreActionIntent.Improve) {
    return { primary: "Refining from Explore", secondary: "Reviewing current preview" };
  }
  if (h.presentationContext.fullscreen) {
    return { primary: "From Explore", secondary: "Fullscreen preview" };
  }
  if (h.presentationContext.compareMode) {
    return { primary: "From Explore", secondary: "Compare mode" };
  }
  return { primary: "From Explore", secondary: "Studio" };
}

const IMPROVEMENT_ACTIONS: ReadonlySet<ExploreActionHandoffActionType> = new Set([
  ExploreActionIntent.Improve,
  ExploreActionIntent.OptimizeMobile,
  ExploreActionIntent.TightenSpacingTypography,
  ExploreActionIntent.EnhanceVisualHierarchy
]);

/**
 * Central factory for Explore-originated handoffs — Studio, Chat, and improve seeds must use this.
 */
export function createExploreActionContext(args: {
  actionType: ExploreActionHandoffActionType;
  sourceSubsurface: ExploreHandoffSourceSubsurface;
  unit: ApiBuildUnit;
  unitSessionId: string;
  reviewPersist: ExplorePreviewReviewPersist | null;
  layout: LivePreviewStudioHandoffLayout;
  exploreActionContext: ExploreActionContext | null;
  improveIntent?: ImproveIntent | null;
}): ExploreActionHandoffContext {
  void args.exploreActionContext;
  const { unit, reviewPersist, layout } = args;
  const pf = mapPreviewFeasibilityToHandoffPreview(unit.previewFeasibility ?? null);
  const fullscreen = Boolean(reviewPersist?.fullscreen) || layout === "fullscreen";
  const compareEngaged = Boolean(reviewPersist?.compareEngaged);
  const inline = reviewPersist?.inlineMode ?? "fit";
  const viewport: ExploreHandoffPresentationViewport =
    layout === "fullscreen" ? inline : layoutToPresentationViewport(layout);

  const nr = unit.normalizedReview;
  const improveIntent = args.improveIntent ?? null;
  const improvementIntent = improvementIntentForPayload(args.actionType, improveIntent);

  const userPromptSeed = exploreHandoffVisibleComposerText({
    actionType: args.actionType,
    unitTitle: unit.title,
    improveIntent
  });

  const improvementContext = IMPROVEMENT_ACTIONS.has(args.actionType)
    ? {
        intent: improvementIntent,
        userPromptSeed
      }
    : undefined;

  const restoreViewport = fullscreen ? "fullscreen" : String(inline);

  return {
    v: EXPLORE_HANDOFF_SCHEMA_VERSION,
    sourceSurface: "explore",
    sourceSubsurface: args.sourceSubsurface,
    actionType: args.actionType,
    unitId: unit.id,
    unitSessionId: args.unitSessionId,
    previewContext: {
      mode: pf.mode,
      confidence: pf.confidence,
      reasonCode: pf.reasonCode,
      reasonLabel: pf.reasonLabel
    },
    reviewContext: {
      decision: String(nr?.decision ?? ""),
      previewAllowed: Boolean(nr?.previewAllowed),
      publishAllowed: Boolean(nr?.publishAllowed)
    },
    presentationContext: {
      viewport,
      compareMode: compareEngaged,
      fullscreen
    },
    ...(improvementContext ? { improvementContext } : {}),
    continuityContext: {
      returnSurface: "explore_detail",
      restoreUnitId: unit.id,
      restoreViewport,
      restoreCompareMode: compareEngaged
    }
  };
}

/** @deprecated Use {@link createExploreActionContext}. */
export const buildExploreHandoffContext = createExploreActionContext;

/** JSON for API / orchestration (string). */
export { serializeExploreHandoffForMalvTransport };

export function parseExploreHandoffContextJson(raw: string): ExploreActionHandoffContext | null {
  return parseExploreHandoffJson(raw);
}

/** Dev / test helper: visible strings must not leak UUIDs. */
export function visibleExploreStringsContainNoUuid(...parts: Array<string | null | undefined>): boolean {
  const s = parts.filter(Boolean).join("\n");
  UUID_RE.lastIndex = 0;
  return !UUID_RE.test(s);
}

/** Deterministic client-side summary for UI/tests (no network). Server augments via `resolveExploreContextForMalv` on the API. */
export function summarizeExploreHandoffForMalvClient(h: ExploreActionHandoffContext): {
  safeSummaryLines: string[];
} {
  const lines: string[] = [
    `Origin: Explore (${h.sourceSubsurface.replace(/_/g, " ")})`,
    `User action: ${h.actionType.replace(/_/g, " ")}`,
    `Preview posture: ${h.previewContext.mode} · confidence ${h.previewContext.confidence}`,
    h.presentationContext.compareMode ? "Compare mode was engaged." : null,
    h.presentationContext.fullscreen ? "Fullscreen theater was engaged." : null,
    h.presentationContext.viewport && h.presentationContext.viewport !== "fit"
      ? `Viewport: ${h.presentationContext.viewport}`
      : null
  ].filter((x): x is string => Boolean(x));
  return { safeSummaryLines: lines };
}

/** @deprecated Use {@link summarizeExploreHandoffForMalvClient}. */
export const resolveActiveExploreContextForMalvClient = summarizeExploreHandoffForMalvClient;

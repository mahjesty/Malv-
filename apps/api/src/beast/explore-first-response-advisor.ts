import type { ExploreActionHandoffContext } from "@malv/explore-action-handoff";
import { ExploreActionIntent } from "@malv/explore-action-handoff";
import type { ExploreHandoffResolvedUnitHints, ExploreHandoffUnitResolution } from "./explore-handoff-prompt.util";

export type ExploreFirstResponseAdvisory = {
  hasExploreContext: boolean;
  sourceSurface: "explore" | "unknown";
  actionType?: string | null;

  unitSummary?: {
    title?: string | null;
    framework?: string | null;
    previewMode?: "live" | "code" | "none" | "static" | "unknown";
    renderability?: "renderable" | "non_renderable" | "unknown";
  };

  posture: {
    shouldBeProactive: boolean;
    shouldAvoidGenericOpening: boolean;
    shouldSuggestConcreteNextSteps: boolean;
  };

  suggestedResponseMode:
    | "ui_improvement"
    | "implementation_help"
    | "debugging"
    | "review_and_feedback"
    | "build_from_idea"
    | "general_contextual";

  suggestedActions: string[];

  cautionFlags: {
    partialContext: boolean;
    previewUnavailable: boolean;
    nonRenderable: boolean;
  };
};

const FRAMEWORK_META_KEYS = ["framework", "primaryFramework", "stack", "techStack"] as const;

function readFrameworkFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const k of FRAMEWORK_META_KEYS) {
    const v = meta[k];
    if (typeof v === "string") {
      const t = v.replace(/\s+/g, " ").trim();
      if (t.length > 0 && t.length <= 80) return t;
    }
  }
  return null;
}

type AdvisoryPreviewMode = NonNullable<ExploreFirstResponseAdvisory["unitSummary"]>["previewMode"];
type AdvisoryRenderability = NonNullable<ExploreFirstResponseAdvisory["unitSummary"]>["renderability"];

function mapHandoffPreviewToAdvisoryMode(mode: ExploreActionHandoffContext["previewContext"]["mode"]): AdvisoryPreviewMode {
  switch (mode) {
    case "live":
      return "live";
    case "static":
      return "static";
    case "structured_fallback":
    case "technical_fallback":
      return "code";
    default:
      return "unknown";
  }
}

function deriveRenderability(args: {
  previewMode: AdvisoryPreviewMode;
  confidence: ExploreActionHandoffContext["previewContext"]["confidence"];
  previewKind: ExploreHandoffResolvedUnitHints["previewKind"];
  intakePreviewState: ExploreHandoffResolvedUnitHints["intakePreviewState"];
}): AdvisoryRenderability {
  const { previewMode, confidence, previewKind, intakePreviewState } = args;

  if (intakePreviewState === "unavailable") return "unknown";

  /** Handoff fallbacks map to advisory `code` preview class. */
  if (previewMode === "code") {
    return "non_renderable";
  }

  if (previewMode === "live") {
    if (confidence === "low") return "unknown";
    return "renderable";
  }

  if (previewMode === "static") {
    return "renderable";
  }

  if (previewKind === "rendered" || previewKind === "animation" || previewKind === "mixed") {
    return confidence === "low" ? "unknown" : "renderable";
  }
  if (previewKind === "code" || previewKind === "none") {
    return "non_renderable";
  }
  if (previewKind === "image") {
    return "renderable";
  }

  return "unknown";
}

function pickResponseMode(args: {
  parsed: ExploreActionHandoffContext;
  renderability: AdvisoryRenderability;
}): ExploreFirstResponseAdvisory["suggestedResponseMode"] {
  const { parsed, renderability } = args;
  const a = parsed.actionType;

  if (a === ExploreActionIntent.DebugPreviewIssue) return "debugging";
  if (a === ExploreActionIntent.ExplainReviewOutcome) return "review_and_feedback";

  if (
    a === ExploreActionIntent.Improve ||
    a === ExploreActionIntent.OptimizeMobile ||
    a === ExploreActionIntent.TightenSpacingTypography ||
    a === ExploreActionIntent.EnhanceVisualHierarchy
  ) {
    if (renderability === "non_renderable") return "implementation_help";
    return "ui_improvement";
  }

  if (a === ExploreActionIntent.OpenStudio) return "build_from_idea";

  if (renderability === "non_renderable") return "implementation_help";
  return "general_contextual";
}

function buildSuggestedActions(args: {
  mode: ExploreFirstResponseAdvisory["suggestedResponseMode"];
  renderability: AdvisoryRenderability;
  previewMode: AdvisoryPreviewMode;
  improvementIntent?: ExploreActionHandoffContext["improvementContext"];
}): string[] {
  const { mode, renderability, previewMode, improvementIntent } = args;
  const out: string[] = [];

  const push = (s: string) => {
    if (out.length >= 4) return;
    if (!out.includes(s)) out.push(s);
  };

  if (improvementIntent?.intent === "optimize_mobile") {
    push("Tighten layout and touch targets for small viewports");
  } else if (improvementIntent?.intent === "tighten_spacing_typography") {
    push("Refine spacing, type scale, and readability");
  } else if (improvementIntent?.intent === "enhance_visual_hierarchy") {
    push("Strengthen hierarchy, contrast, and focal flow");
  }

  switch (mode) {
    case "ui_improvement":
      push("Review visual polish, motion, and responsive behavior");
      push("Propose concrete UI tweaks aligned with the current preview posture");
      break;
    case "implementation_help":
      push("Walk through structure and implementation improvements");
      if (renderability === "non_renderable") {
        push("Outline what would be needed to make a faithful live preview realistic");
      }
      break;
    case "debugging":
      push("Isolate likely preview or bundling failure modes");
      push("Suggest minimal checks the user can run next");
      break;
    case "review_and_feedback":
      push("Explain review constraints in plain language");
      push("Suggest next steps that respect preview and publish gates");
      break;
    case "build_from_idea":
      push("Turn the unit brief into a scoped build or iteration plan");
      break;
    default:
      break;
  }

  if (previewMode === "live" && mode !== "debugging") {
    push("Offer focused improvements that match what they are seeing in Explore");
  }
  if (previewMode === "code" && renderability === "non_renderable") {
    push("Stay grounded in code and structure rather than visual pixel claims");
  }

  if (out.length < 2 && mode === "general_contextual") {
    push("Continue from the Explore unit as the working subject");
    push("Offer a small set of high-leverage next moves");
  }

  return out.slice(0, 4);
}

/**
 * Deterministic advisory for the first chat turn that carries a parsed Explore handoff.
 * Does not include ids, raw JSON, or DB column names in suggested copy paths for the model.
 */
export function buildExploreFirstResponseAdvisory(args: {
  parsed: ExploreActionHandoffContext;
  resolution: ExploreHandoffUnitResolution;
  unitHints?: ExploreHandoffResolvedUnitHints | null;
}): ExploreFirstResponseAdvisory {
  const { parsed, resolution, unitHints } = args;

  const previewMode = mapHandoffPreviewToAdvisoryMode(parsed.previewContext.mode);
  const renderability =
    resolution === "ok" && unitHints
      ? deriveRenderability({
          previewMode,
          confidence: parsed.previewContext.confidence,
          previewKind: unitHints.previewKind,
          intakePreviewState: unitHints.intakePreviewState
        })
      : ("unknown" as const);

  const previewUnavailable =
    resolution === "ok" &&
    Boolean(unitHints?.intakePreviewState === "unavailable" || parsed.previewContext.mode === "technical_fallback");

  const nonRenderable = renderability === "non_renderable";

  const partialContext =
    resolution !== "ok" ||
    parsed.previewContext.confidence === "low" ||
    renderability === "unknown" ||
    previewUnavailable;

  const title =
    resolution === "ok" && unitHints ? (unitHints.title ?? "").trim() || null : null;
  const framework = resolution === "ok" && unitHints ? readFrameworkFromMetadata(unitHints.metadataJson) : null;

  const suggestedResponseMode = pickResponseMode({ parsed, renderability });

  const suggestedActions = buildSuggestedActions({
    mode: suggestedResponseMode,
    renderability,
    previewMode,
    improvementIntent: parsed.improvementContext
  });

  const shouldBeProactive =
    resolution === "ok" &&
    (suggestedResponseMode === "debugging" ||
      suggestedResponseMode === "review_and_feedback" ||
      parsed.previewContext.confidence !== "low");

  const shouldAvoidGenericOpening = true;
  const shouldSuggestConcreteNextSteps = resolution === "ok" || resolution === "missing" || resolution === "forbidden";

  const unitSummary: ExploreFirstResponseAdvisory["unitSummary"] = {
    title,
    framework: resolution === "ok" ? framework : null,
    previewMode,
    renderability
  };

  return {
    hasExploreContext: true,
    sourceSurface: "explore",
    actionType: parsed.actionType,
    unitSummary,
    posture: {
      shouldBeProactive: shouldBeProactive || suggestedResponseMode === "debugging",
      shouldAvoidGenericOpening,
      shouldSuggestConcreteNextSteps
    },
    suggestedResponseMode,
    suggestedActions,
    cautionFlags: {
      partialContext,
      previewUnavailable,
      nonRenderable
    }
  };
}

export function emptyExploreFirstResponseAdvisory(): ExploreFirstResponseAdvisory {
  return {
    hasExploreContext: false,
    sourceSurface: "unknown",
    actionType: null,
    posture: {
      shouldBeProactive: false,
      shouldAvoidGenericOpening: false,
      shouldSuggestConcreteNextSteps: false
    },
    suggestedResponseMode: "general_contextual",
    suggestedActions: [],
    cautionFlags: {
      partialContext: false,
      previewUnavailable: false,
      nonRenderable: false
    }
  };
}

/**
 * Internal prompt lines appended under Context summary on the first handoff turn only.
 * Omits ids and transport payloads.
 */
export function formatExploreFirstResponsePolicyBlock(advisory: ExploreFirstResponseAdvisory): string | null {
  if (!advisory.hasExploreContext) return null;

  const lines: string[] = [];
  lines.push("Explore → Chat first-turn shaping (internal operator guidance):");
  lines.push(
    `- Posture: ${advisory.posture.shouldBeProactive ? "lead with substance" : "stay measured"}; avoid hollow assistant openers; ${
      advisory.posture.shouldSuggestConcreteNextSteps ? "offer a few concrete next moves" : "keep the reply tight"
    }.`
  );
  lines.push(`- Suggested response mode: ${advisory.suggestedResponseMode.replace(/_/g, " ")}.`);

  if (advisory.unitSummary?.title) {
    lines.push(`- Active subject (title only): «${advisory.unitSummary.title}».`);
  }
  if (advisory.unitSummary?.framework) {
    lines.push(`- Stack hint (metadata): ${advisory.unitSummary.framework}.`);
  }
  if (advisory.unitSummary?.previewMode && advisory.unitSummary.previewMode !== "unknown") {
    lines.push(`- Preview class: ${advisory.unitSummary.previewMode.replace(/_/g, " ")}.`);
  }
  if (advisory.unitSummary?.renderability && advisory.unitSummary.renderability !== "unknown") {
    lines.push(`- Renderability stance: ${advisory.unitSummary.renderability.replace(/_/g, " ")}.`);
  }

  if (advisory.suggestedActions.length) {
    lines.push("- Suggested action seeds (paraphrase; do not read as a script):");
    for (const a of advisory.suggestedActions) {
      lines.push(`  • ${a}`);
    }
  }

  const { partialContext, previewUnavailable, nonRenderable } = advisory.cautionFlags;
  if (partialContext || previewUnavailable || nonRenderable) {
    const bits: string[] = [];
    if (partialContext) bits.push("context is partial — state uncertainty plainly");
    if (previewUnavailable) bits.push("preview may be limited or unavailable");
    if (nonRenderable) bits.push("avoid claiming specific pixels from a live render you do not have");
    lines.push(`- Caution: ${bits.join("; ")}.`);
  }

  lines.push(
    "- Keep the user-visible reply premium and concise; do not dump orchestration labels, ids, or JSON; stay within existing policy and sandbox boundaries."
  );

  return lines.join("\n");
}

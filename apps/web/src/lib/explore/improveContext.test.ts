import { describe, expect, it } from "vitest";
import type { ApiBuildUnit } from "../api/dataPlane";
import type { ExploreActionContext } from "./exploreActionContext.types";
import {
  buildImproveContextPayload,
  buildImproveReturnCue,
  deriveStudioImproveFraming,
  inferImproveDeviceModeFromReview,
  improveIntentStudioReturnPhrase,
  improveIntentToStudioPosture,
  improveOutcomeShortLabel,
  mapImproveIntentToApiIntent,
  mergeComposerWithImproveSupplementIfEmpty,
  parseStudioImproveSeed,
  serializeStudioImproveSeedForUrl,
  studioImprovePreviewFeasibilityNote,
  studioImproveSeedComposerSupplement,
  type ImproveIntent
} from "./improveContext";

const minimalUnit = (over: Partial<Pick<ApiBuildUnit, "id" | "previewFeasibility">> = {}): Pick<
  ApiBuildUnit,
  "id" | "previewFeasibility"
> => ({
  id: "unit-1",
  previewFeasibility: null,
  ...over
});

const sampleExploreCtx: ExploreActionContext = {
  rawQuery: "dashboard",
  normalizedQuery: "dashboard",
  intent: "keyword_search",
  matchQuality: "strong",
  strippedIdea: "ops dashboard",
  resultsExplanation: "Matched title"
};

describe("improveContext", () => {
  it("buildImproveContextPayload carries intent, device, compare, feasibility, explore context", () => {
    const payload = buildImproveContextPayload({
      unitId: "u1",
      intent: "enhance_visual_hierarchy",
      review: { inlineMode: "desktop", fullscreen: false, compareEngaged: true },
      unit: minimalUnit({
        previewFeasibility: {
          previewMode: "live",
          previewFeasible: true,
          reasonCode: "ok",
          reasonLabel: "ok",
          blockingIssues: [],
          signals: { framework: "React", runtime: "node", surface: "component" }
        }
      }),
      exploreActionContext: sampleExploreCtx
    });
    expect(payload.unitId).toBe("u1");
    expect(payload.intent).toBe("enhance_visual_hierarchy");
    expect(payload.deviceMode).toBe("desktop");
    expect(payload.compareMode).toBe(true);
    expect(payload.previewFeasibility?.mode).toBe("live");
    expect(payload.previewFeasibility?.framework).toBe("React");
    expect(payload.exploreActionContext?.rawQuery).toBe("dashboard");
  });

  it("optimize_mobile biases deviceMode to mobile", () => {
    const payload = buildImproveContextPayload({
      unitId: "u1",
      intent: "optimize_mobile",
      review: { inlineMode: "desktop", fullscreen: false },
      unit: minimalUnit()
    });
    expect(payload.deviceMode).toBe("mobile");
  });

  it("inferImproveDeviceModeFromReview maps layouts", () => {
    expect(inferImproveDeviceModeFromReview({ inlineMode: "mobile", fullscreen: false })).toBe("mobile");
    expect(inferImproveDeviceModeFromReview({ inlineMode: "tablet", fullscreen: false })).toBe("tablet");
    expect(inferImproveDeviceModeFromReview({ inlineMode: "fit", fullscreen: false })).toBe("desktop");
    expect(inferImproveDeviceModeFromReview({ inlineMode: "desktop", fullscreen: true })).toBe("desktop");
  });

  it("serialize + parse roundtrip preserves core fields", () => {
    const original = buildImproveContextPayload({
      unitId: "abc",
      intent: "accessibility_improve",
      review: { inlineMode: "tablet", fullscreen: false, compareEngaged: false },
      unit: minimalUnit(),
      exploreActionContext: sampleExploreCtx
    });
    const raw = serializeStudioImproveSeedForUrl(original);
    const parsed = parseStudioImproveSeed(raw);
    expect(parsed.kind).toBe("improve");
    if (parsed.kind !== "improve") return;
    expect(parsed.payload.unitId).toBe("abc");
    expect(parsed.payload.intent).toBe("accessibility_improve");
    expect(parsed.payload.deviceMode).toBe("tablet");
    expect(parsed.payload.exploreActionContext?.intent).toBe("keyword_search");
  });

  it("parseStudioImproveSeed is defensive", () => {
    expect(parseStudioImproveSeed("").kind).toBe("invalid");
    expect(parseStudioImproveSeed("not json").kind).toBe("invalid");
    expect(parseStudioImproveSeed('{"source":"wrong"}').kind).toBe("invalid");
    expect(parseStudioImproveSeed('{"source":"explore_improve","unitId":"","intent":"generic_improve"}').kind).toBe(
      "invalid"
    );
  });

  it("parseStudioImproveSeed defaults deviceMode when missing", () => {
    const pr = parseStudioImproveSeed(
      JSON.stringify({
        source: "explore_improve",
        unitId: "x",
        intent: "generic_improve"
      })
    );
    expect(pr.kind).toBe("improve");
    if (pr.kind !== "improve") return;
    expect(pr.payload.deviceMode).toBe("desktop");
  });

  it("parseStudioImproveSeed carries reviewContext scroll and focusedSection", () => {
    const pr = parseStudioImproveSeed(
      JSON.stringify({
        source: "explore_improve",
        unitId: "u1",
        intent: "enhance_visual_hierarchy",
        deviceMode: "tablet",
        reviewContext: { scrollPosition: 88.5, focusedSection: "Pricing" }
      })
    );
    expect(pr.kind).toBe("improve");
    if (pr.kind !== "improve") return;
    expect(pr.payload.reviewContext?.scrollPosition).toBe(88.5);
    expect(pr.payload.reviewContext?.focusedSection).toBe("Pricing");
    expect(deriveStudioImproveFraming(pr.payload).reviewScrollPosition).toBe(88.5);
    expect(deriveStudioImproveFraming(pr.payload).focusHint).toBe("Pricing");
  });

  it("buildImproveReturnCue labels and highlight flag", () => {
    const g = buildImproveReturnCue("generic_improve");
    expect(g.subtleHighlight).toBe(false);
    const m = buildImproveReturnCue("modernize_ui");
    expect(m.label.toLowerCase()).toContain("modern");
    expect(m.subtleHighlight).toBe(true);
  });

  it("mapImproveIntentToApiIntent maps extended intents to API subset", () => {
    expect(mapImproveIntentToApiIntent("optimize_mobile")).toBe("optimize_mobile");
    expect(mapImproveIntentToApiIntent("tighten_spacing_typography")).toBe("tighten_spacing_typography");
    expect(mapImproveIntentToApiIntent("modernize_ui")).toBe("generic_improve");
  });

  it("studioImproveSeedComposerSupplement is intent-shaped per ImproveIntent", () => {
    const mk = (intent: Parameters<typeof buildImproveContextPayload>[0]["intent"]) =>
      buildImproveContextPayload({
        unitId: "u",
        intent,
        review: { inlineMode: "desktop", fullscreen: false, compareEngaged: false },
        unit: minimalUnit()
      });
    expect(studioImproveSeedComposerSupplement(mk("optimize_mobile"))).toContain("mobile layout");
    expect(studioImproveSeedComposerSupplement(mk("tighten_spacing_typography"))).toContain("spacing rhythm");
    expect(studioImproveSeedComposerSupplement(mk("enhance_visual_hierarchy"))).toContain("reading flow");
    expect(studioImproveSeedComposerSupplement(mk("increase_conversion_focus"))).toContain("CTA clarity");
    expect(studioImproveSeedComposerSupplement(mk("accessibility_improve"))).toContain("accessibility");
    expect(studioImproveSeedComposerSupplement(mk("modernize_ui"))).toContain("contemporary patterns");
    expect(studioImproveSeedComposerSupplement(mk("generic_improve"))).toContain("holistic refinement");
  });

  it("studioImproveSeedComposerSupplement notes compare when compareMode", () => {
    const p = buildImproveContextPayload({
      unitId: "u",
      intent: "generic_improve",
      review: { inlineMode: "desktop", fullscreen: false, compareEngaged: true },
      unit: minimalUnit()
    });
    expect(studioImproveSeedComposerSupplement(p)).toContain("Explore compare layout was on");
  });

  it("deriveStudioImproveFraming maps intents to headline, chip label, and posture", () => {
    const p = (intent: ImproveIntent) =>
      buildImproveContextPayload({
        unitId: "u",
        intent,
        review: { inlineMode: "desktop", fullscreen: false },
        unit: minimalUnit()
      });
    expect(deriveStudioImproveFraming(p("generic_improve")).headline).toBe("Improving this preview");
    expect(deriveStudioImproveFraming(p("optimize_mobile")).posture).toBe("mobile");
    expect(deriveStudioImproveFraming(p("tighten_spacing_typography")).posture).toBe("visual_polish");
    expect(deriveStudioImproveFraming(p("enhance_visual_hierarchy")).posture).toBe("hierarchy");
    expect(deriveStudioImproveFraming(p("increase_conversion_focus")).posture).toBe("conversion");
    expect(deriveStudioImproveFraming(p("accessibility_improve")).posture).toBe("accessibility");
    expect(deriveStudioImproveFraming(p("modernize_ui")).posture).toBe("modernization");
    expect(deriveStudioImproveFraming(p("optimize_mobile")).intentLabel).toBe("Mobile layout");
    expect(deriveStudioImproveFraming(p("enhance_visual_hierarchy")).headline).toBe("Improving this preview");
    expect(deriveStudioImproveFraming(p("modernize_ui")).headline).toBe("Improving this preview");
    expect(deriveStudioImproveFraming(p("enhance_visual_hierarchy")).sublabel).toMatch(/general path today/i);
  });

  it("outcome + return phrases stay generic when API improve path is generic", () => {
    expect(improveOutcomeShortLabel("enhance_visual_hierarchy")).toBe("Preview refined");
    expect(improveIntentStudioReturnPhrase("modernize_ui")).toBe("Studio refinement");
  });

  it("deriveStudioImproveFraming surfaces focusedSection and preserves scroll in framing", () => {
    const base = buildImproveContextPayload({
      unitId: "u",
      intent: "generic_improve",
      review: { inlineMode: "fit", fullscreen: false },
      unit: minimalUnit(),
      reviewContext: { focusedSection: "Hero", scrollPosition: 420 }
    });
    const f = deriveStudioImproveFraming(base);
    expect(f.focusHint).toBe("Hero");
    expect(f.reviewScrollPosition).toBe(420);
  });

  it("improveIntentToStudioPosture matches optimize_mobile posture rule", () => {
    expect(improveIntentToStudioPosture("optimize_mobile")).toBe("mobile");
  });

  it("deriveStudioImproveFraming sets compareHandoffNote when handoff compareMode", () => {
    const p = buildImproveContextPayload({
      unitId: "u",
      intent: "generic_improve",
      review: { inlineMode: "desktop", fullscreen: false, compareEngaged: true },
      unit: minimalUnit()
    });
    expect(deriveStudioImproveFraming(p).compareHandoffNote).toMatch(/compare/i);
  });

  it("deriveStudioImproveFraming carries optionalModelRefinementNote only from bounded enhancement", () => {
    const p = buildImproveContextPayload({
      unitId: "u",
      intent: "generic_improve",
      review: { inlineMode: "desktop", fullscreen: false },
      unit: minimalUnit()
    });
    expect(deriveStudioImproveFraming(p).optionalModelRefinementNote).toBeNull();
    expect(
      deriveStudioImproveFraming(p, { optionalModelEnhancement: { improveRefinementNote: "  Extra line  " } })
        .optionalModelRefinementNote
    ).toBe("Extra line");
  });

  it("studioImprovePreviewFeasibilityNote includes mode and framework when present", () => {
    expect(
      studioImprovePreviewFeasibilityNote({
        previewFeasibility: { mode: "live", framework: "React" }
      })
    ).toBe("Explore preview snapshot: live · React");
    expect(
      studioImprovePreviewFeasibilityNote({
        previewFeasibility: { mode: "static" }
      })
    ).toBe("Explore preview snapshot: static");
    expect(
      studioImprovePreviewFeasibilityNote({
        previewFeasibility: { framework: "Vue" }
      })
    ).toBe("Explore preview snapshot: Vue");
    expect(studioImprovePreviewFeasibilityNote({ previewFeasibility: undefined })).toBeNull();
  });

  it("mergeComposerWithImproveSupplementIfEmpty does not overwrite in-progress composer", () => {
    expect(mergeComposerWithImproveSupplementIfEmpty("  hello  ", "BASE", "SUP")).toBe("  hello  ");
    expect(mergeComposerWithImproveSupplementIfEmpty("", "BASE", "SUP")).toBe("SUP\n\nBASE");
    expect(mergeComposerWithImproveSupplementIfEmpty("\n", "BASE", null)).toBe("BASE");
  });
});

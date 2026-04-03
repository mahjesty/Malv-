import { DesignCritiqueService } from "./frontend-design-critique.service";
import { PatchReviewService } from "./patch-review.service";
import type { RenderedUiReviewService } from "./rendered-ui-review.service";
import type { UiVisualCritiqueService } from "./ui-visual-critique.service";
import { buildUxScenarioSimulationSummary } from "./ui-state-capture-plan";
import { MalvModelAssistGateService } from "./model-readiness/malv-model-assist.gate.service";
import { NoopMalvReasoningProvider, NoopMalvVisionCritiqueProvider } from "./model-readiness/noop-malv-intelligence-providers.service";

function noopAssistGate(): MalvModelAssistGateService {
  return {
    shouldAttemptModelAssist: () => false,
    getMode: () => "heuristic_only",
    modelAssistLive: () => false
  } as unknown as MalvModelAssistGateService;
}

export function noopRenderedUiReview(): Pick<RenderedUiReviewService, "tryCapturePreview"> {
  return {
    tryCapturePreview: jest.fn().mockResolvedValue({
      ok: false,
      skipReason: "MALV_UI_PREVIEW_SCREENSHOTS_not_enabled",
      artifacts: [],
      reviewedStates: [],
      stateCoverageSummary: "Preview capture did not run — no state coverage to report.",
      uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([]),
      meta: { baseUrl: "", captureMs: 0, pathsAttempted: [], playwrightLoaded: false }
    })
  };
}

export function noopUiVisualCritique(): Pick<UiVisualCritiqueService, "critiqueScreenshots"> {
  return {
    critiqueScreenshots: jest.fn().mockResolvedValue({
      renderedReviewAvailable: false,
      skipReason: "disabled",
      visualQualityScore: null,
      visualCritiqueSummary: null,
      issues: [],
      suggestions: [],
      stateAwareDesignRisks: null,
      uxQualityScore: null,
      userExperienceSummary: null,
      frictionAnalysis: null,
      usabilityIssues: [],
      frictionPoints: []
    })
  };
}

/** Patch review with rendered path disabled (default test wiring). */
export function patchReviewServiceForTests(
  overrides?: Partial<{
    renderedUi: Pick<RenderedUiReviewService, "tryCapturePreview">;
    visual: Pick<UiVisualCritiqueService, "critiqueScreenshots">;
  }>
) {
  return new PatchReviewService(
    new DesignCritiqueService(),
    (overrides?.renderedUi ?? noopRenderedUiReview()) as RenderedUiReviewService,
    (overrides?.visual ?? noopUiVisualCritique()) as UiVisualCritiqueService,
    new NoopMalvVisionCritiqueProvider(),
    new NoopMalvReasoningProvider(),
    noopAssistGate()
  );
}

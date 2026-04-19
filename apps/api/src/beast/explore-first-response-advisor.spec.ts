import { ExploreActionIntent } from "@malv/explore-action-handoff";
import { parseExploreHandoffJson } from "./explore-handoff-prompt.util";
import {
  buildExploreFirstResponseAdvisory,
  emptyExploreFirstResponseAdvisory,
  formatExploreFirstResponsePolicyBlock
} from "./explore-first-response-advisor";

function baseParsed() {
  return parseExploreHandoffJson(
    JSON.stringify({
      v: 2,
      sourceSurface: "explore",
      unitId: "00000000-0000-4000-8000-000000000001",
      unitSessionId: "sess",
      sourceSubsurface: "detail",
      actionType: "ask_malv",
      previewContext: { mode: "live", confidence: "high" },
      reviewContext: { decision: "", previewAllowed: true, publishAllowed: false },
      presentationContext: { viewport: "mobile", compareMode: false, fullscreen: false },
      continuityContext: {
        returnSurface: "explore_detail",
        restoreUnitId: "00000000-0000-4000-8000-000000000001",
        restoreViewport: "mobile",
        restoreCompareMode: false
      }
    })
  )!;
}

describe("explore-first-response-advisor", () => {
  it("emptyExploreFirstResponseAdvisory has no explore context", () => {
    const a = emptyExploreFirstResponseAdvisory();
    expect(a.hasExploreContext).toBe(false);
    expect(formatExploreFirstResponsePolicyBlock(a)).toBeNull();
  });

  it("live preview + ok resolution → ui-oriented mode and policy block without ids", () => {
    const parsed = { ...baseParsed(), actionType: ExploreActionIntent.Improve };
    const a = buildExploreFirstResponseAdvisory({
      parsed,
      resolution: "ok",
      unitHints: {
        title: "Landing",
        previewKind: "rendered",
        category: "web",
        tags: ["react"],
        metadataJson: { framework: "React" },
        intakePreviewState: "ready"
      }
    });
    expect(a.hasExploreContext).toBe(true);
    expect(a.unitSummary?.previewMode).toBe("live");
    expect(a.unitSummary?.renderability).toBe("renderable");
    expect(a.suggestedResponseMode).toBe("ui_improvement");
    expect(a.posture.shouldAvoidGenericOpening).toBe(true);
    const block = formatExploreFirstResponsePolicyBlock(a)!;
    expect(block).toContain("Explore → Chat first-turn shaping");
    expect(block).toContain("«Landing»");
    expect(block).toContain("React");
    expect(block).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("technical_fallback → non-renderable and implementation_help", () => {
    const parsed = {
      ...baseParsed(),
      previewContext: { mode: "technical_fallback" as const, confidence: "high" as const }
    };
    const a = buildExploreFirstResponseAdvisory({
      parsed,
      resolution: "ok",
      unitHints: {
        title: "Snippet",
        previewKind: "code",
        category: "code",
        tags: null,
        metadataJson: null,
        intakePreviewState: null
      }
    });
    expect(a.unitSummary?.previewMode).toBe("code");
    expect(a.cautionFlags.nonRenderable).toBe(true);
    expect(a.suggestedResponseMode).toBe("implementation_help");
  });

  it("debug action → debugging mode", () => {
    const parsed = { ...baseParsed(), actionType: ExploreActionIntent.DebugPreviewIssue };
    const a = buildExploreFirstResponseAdvisory({
      parsed,
      resolution: "ok",
      unitHints: {
        title: "X",
        previewKind: "rendered",
        category: "web",
        tags: null,
        metadataJson: null,
        intakePreviewState: null
      }
    });
    expect(a.suggestedResponseMode).toBe("debugging");
    expect(a.posture.shouldBeProactive).toBe(true);
  });

  it("missing unit still yields advisory and cautions", () => {
    const parsed = baseParsed();
    const a = buildExploreFirstResponseAdvisory({
      parsed,
      resolution: "missing",
      unitHints: null
    });
    expect(a.hasExploreContext).toBe(true);
    expect(a.cautionFlags.partialContext).toBe(true);
    expect(a.posture.shouldBeProactive).toBe(false);
    expect(formatExploreFirstResponsePolicyBlock(a)).not.toBeNull();
  });
});

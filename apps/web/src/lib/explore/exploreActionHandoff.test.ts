import { describe, expect, it } from "vitest";
import type { ApiBuildUnit } from "../api/dataPlane";
import { ExploreActionIntent } from "./exploreActionHandoff.types";
import {
  createExploreActionContext,
  exploreHandoffVisibleComposerText,
  inferExploreSourceSubsurface,
  parseExploreHandoffContextJson,
  serializeExploreHandoffForMalvTransport,
  summarizeExploreHandoffForMalvClient,
  visibleExploreStringsContainNoUuid
} from "./exploreActionHandoff";
import { EXPLORE_HANDOFF_SCHEMA_VERSION } from "./exploreActionHandoff.types";
import { buildImproveContextPayload, parseStudioImproveSeed, serializeStudioImproveSeedForUrl } from "./improveContext";

function minimalUnit(over: Partial<ApiBuildUnit> = {}): ApiBuildUnit {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "u",
    title: "Test Unit",
    description: null,
    type: "component",
    category: "ui",
    tags: null,
    prompt: "p",
    codeSnippet: null,
    previewImageUrl: null,
    previewKind: "code",
    previewSnapshotId: null,
    previewFileId: null,
    sourceFileId: null,
    sourceFileName: null,
    sourceFileMime: null,
    sourceFileUrl: null,
    authorUserId: null,
    authorLabel: null,
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: false,
    accent: null,
    usesCount: 0,
    forksCount: 0,
    downloadsCount: 0,
    metadataJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...over
  };
}

describe("exploreActionHandoff", () => {
  it("createExploreActionContext builds v2 handoff with preview mapping", () => {
    const unit = minimalUnit({
      previewFeasibility: {
        previewFeasible: true,
        previewMode: "live",
        reasonCode: "ok",
        reasonLabel: "Live preview",
        blockingIssues: [],
        signals: {}
      }
    });
    const h = createExploreActionContext({
      actionType: ExploreActionIntent.AskMalv,
      sourceSubsurface: "detail",
      unit,
      unitSessionId: "sess-1",
      reviewPersist: { inlineMode: "mobile", fullscreen: false, compareEngaged: true },
      layout: "mobile",
      exploreActionContext: null,
      improveIntent: null
    });
    expect(h.v).toBe(EXPLORE_HANDOFF_SCHEMA_VERSION);
    expect(h.previewContext.mode).toBe("live");
    expect(h.presentationContext.compareMode).toBe(true);
    expect(h.improvementContext).toBeUndefined();
  });

  it("serializes and parses round-trip for Malv transport", () => {
    const unit = minimalUnit();
    const h = createExploreActionContext({
      actionType: ExploreActionIntent.OpenStudio,
      sourceSubsurface: "fullscreen_preview",
      unit,
      unitSessionId: "abc-session",
      reviewPersist: null,
      layout: "fullscreen",
      exploreActionContext: null,
      improveIntent: null
    });
    const json = serializeExploreHandoffForMalvTransport(h);
    const back = parseExploreHandoffContextJson(json);
    expect(back?.unitId).toBe(unit.id);
    expect(back?.unitSessionId).toBe("abc-session");
  });

  it("inferExploreSourceSubsurface respects compare, fullscreen, grid, and detail", () => {
    expect(
      inferExploreSourceSubsurface({
        fromPreviewChrome: true,
        detailPanelOpenForUnit: true,
        layout: "fullscreen",
        compareEngaged: false
      })
    ).toBe("fullscreen_preview");
    expect(
      inferExploreSourceSubsurface({
        fromPreviewChrome: true,
        detailPanelOpenForUnit: true,
        layout: "mobile",
        compareEngaged: true
      })
    ).toBe("compare_mode");
    expect(
      inferExploreSourceSubsurface({
        fromPreviewChrome: false,
        detailPanelOpenForUnit: true,
        layout: "fit",
        compareEngaged: true
      })
    ).toBe("detail");
    expect(
      inferExploreSourceSubsurface({
        fromPreviewChrome: false,
        detailPanelOpenForUnit: false,
        layout: "fit",
        compareEngaged: false
      })
    ).toBe("grid");
  });

  it("visible composer and client resolution lines contain no UUIDs", () => {
    const vis = exploreHandoffVisibleComposerText({
      actionType: ExploreActionIntent.AskMalv,
      unitTitle: "Settings panel",
      improveIntent: null
    });
    const card = summarizeExploreHandoffForMalvClient(
      createExploreActionContext({
        actionType: ExploreActionIntent.AskMalv,
        sourceSubsurface: "detail",
        unit: minimalUnit({ title: "Home" }),
        unitSessionId: "hidden-id",
        reviewPersist: null,
        layout: "fit",
        exploreActionContext: null,
        improveIntent: null
      })
    );
    expect(visibleExploreStringsContainNoUuid(vis, ...card.safeSummaryLines)).toBe(true);
  });

  it("embeds exploreHandoff in improve seed JSON and parses back", () => {
    const unit = minimalUnit();
    const handoff = createExploreActionContext({
      actionType: ExploreActionIntent.OptimizeMobile,
      sourceSubsurface: "compare_mode",
      unit,
      unitSessionId: "s2",
      reviewPersist: { inlineMode: "desktop", fullscreen: false, compareEngaged: true },
      layout: "desktop",
      exploreActionContext: null,
      improveIntent: "optimize_mobile"
    });
    const seed = buildImproveContextPayload({
      unitId: unit.id,
      intent: "optimize_mobile",
      review: { inlineMode: "desktop", fullscreen: false, compareEngaged: true },
      unit,
      exploreHandoff: handoff
    });
    const enc = serializeStudioImproveSeedForUrl(seed);
    const dec = parseStudioImproveSeed(enc);
    expect(dec.kind).toBe("improve");
    if (dec.kind === "improve") {
      expect(dec.payload.exploreHandoff?.unitSessionId).toBe("s2");
      expect(dec.payload.exploreHandoff?.previewContext.mode).toBeDefined();
    }
  });

  it("continuityContext preserves restore viewport and compare for Studio return", () => {
    const unit = minimalUnit();
    const h = createExploreActionContext({
      actionType: ExploreActionIntent.OpenStudio,
      sourceSubsurface: "detail",
      unit,
      unitSessionId: "s",
      reviewPersist: { inlineMode: "tablet", fullscreen: true, compareEngaged: true },
      layout: "fullscreen",
      exploreActionContext: null,
      improveIntent: null
    });
    expect(h.continuityContext.restoreViewport).toBe("fullscreen");
    expect(h.continuityContext.restoreCompareMode).toBe(true);
    expect(h.presentationContext.viewport).toBe("tablet");
  });
});

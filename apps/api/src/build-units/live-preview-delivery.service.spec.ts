import { BadRequestException } from "@nestjs/common";
import { LivePreviewDeliveryService, buildUnitPreviewContentPath } from "./live-preview-delivery.service";
import type { BuildUnitEntity } from "../db/entities/build-unit.entity";
import type { PreviewFeasibilityV1 } from "../preview-feasibility/preview-feasibility.util";

function baseUnit(over: Partial<BuildUnitEntity> = {}): BuildUnitEntity {
  return {
    id: "unit-1",
    slug: "u",
    title: "T",
    description: null,
    type: "component",
    category: "code",
    tags: null,
    prompt: null,
    codeSnippet: null,
    previewImageUrl: null,
    previewKind: "code",
    previewFileId: "file-1",
    sourceFileId: null,
    sourceFileName: null,
    sourceFileMime: null,
    sourceFileUrl: null,
    authorUserId: "author-1",
    authorLabel: null,
    visibility: "private",
    sourceKind: "user",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: null,
    usesCount: 0,
    forksCount: 0,
    downloadsCount: 0,
    metadataJson: null,
    executionProfileJson: null,
    intakePreviewState: "ready",
    intakePreviewUnavailableReason: null,
    intakeAuditDecision: "approved",
    intakeDetectionJson: { framework: "react", probableEntrypoint: "App.tsx", probableSurface: "landing-page" },
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...over
  } as BuildUnitEntity;
}

function liveFeasibility(): PreviewFeasibilityV1 {
  return {
    previewFeasible: true,
    previewMode: "live",
    reasonCode: "live_ready",
    reasonLabel: "ok",
    blockingIssues: [],
    signals: {}
  };
}

describe("LivePreviewDeliveryService", () => {
  it("omits livePreview when feasibility is not live", async () => {
    const files = {
      assertUserOwnsFile: jest.fn()
    };
    const svc = new LivePreviewDeliveryService(files as any);
    const u = baseUnit();
    const out = await svc.attachToBuildUnitResponse("viewer-1", {
      ...u,
      previewFeasibility: { ...liveFeasibility(), previewMode: "code" }
    });
    expect(out.livePreview).toBeUndefined();
    expect(files.assertUserOwnsFile).not.toHaveBeenCalled();
  });

  it("eligible live + text/html => available payload with fetchPath", async () => {
    const files = {
      assertUserOwnsFile: jest.fn().mockResolvedValue({
        mimeType: "text/html",
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      })
    };
    const svc = new LivePreviewDeliveryService(files as any);
    const u = baseUnit();
    const out = await svc.attachToBuildUnitResponse("viewer-1", {
      ...u,
      previewFeasibility: liveFeasibility()
    });
    expect(out.livePreview?.available).toBe(true);
    expect(out.livePreview?.kind).toBe("html_doc");
    expect(out.livePreview?.fetchPath).toBe(`${buildUnitPreviewContentPath("unit-1")}?fileId=file-1`);
    expect(out.livePreview?.mimeType).toBe("text/html");
  });

  it("eligible live + png => iframe_url image delivery", async () => {
    const files = {
      assertUserOwnsFile: jest.fn().mockResolvedValue({
        mimeType: "image/png",
        updatedAt: new Date()
      })
    };
    const svc = new LivePreviewDeliveryService(files as any);
    const u = baseUnit();
    const out = await svc.attachToBuildUnitResponse("viewer-1", {
      ...u,
      previewFeasibility: liveFeasibility()
    });
    expect(out.livePreview?.available).toBe(true);
    expect(out.livePreview?.kind).toBe("iframe_url");
    expect(out.livePreview?.mimeType).toBe("image/png");
  });

  it("live classification but unsupported mime => available false, no fake url", async () => {
    const files = {
      assertUserOwnsFile: jest.fn().mockResolvedValue({
        mimeType: "application/pdf",
        updatedAt: new Date()
      })
    };
    const svc = new LivePreviewDeliveryService(files as any);
    const u = baseUnit();
    const out = await svc.attachToBuildUnitResponse("viewer-1", {
      ...u,
      previewFeasibility: liveFeasibility()
    });
    expect(out.livePreview?.available).toBe(false);
    expect(out.livePreview?.fetchPath).toBeUndefined();
    expect(out.livePreview?.reasonCode).toBe("unsupported_preview_mime");
  });

  it("file access throws => available false", async () => {
    const files = {
      assertUserOwnsFile: jest.fn().mockRejectedValue(new BadRequestException("nope"))
    };
    const svc = new LivePreviewDeliveryService(files as any);
    const u = baseUnit();
    const out = await svc.attachToBuildUnitResponse("viewer-1", {
      ...u,
      previewFeasibility: liveFeasibility()
    });
    expect(out.livePreview?.available).toBe(false);
    expect(out.livePreview?.reasonCode).toBe("preview_file_unreadable");
  });
});

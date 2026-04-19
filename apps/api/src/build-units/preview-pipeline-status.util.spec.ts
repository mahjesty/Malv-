import { computeBuildUnitPreviewPipelineStatus } from "./preview-pipeline-status.util";
import { INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER } from "../source-intake/source-intake-static-audit.util";
import { type PreviewFeasibilityV1 } from "../preview-feasibility/preview-feasibility.util";

type Pf = PreviewFeasibilityV1 & { frontendPreviewable?: boolean };

const basePf = (over: Partial<Pf> = {}): Pf => ({
  previewFeasible: true,
  previewMode: "code",
  reasonCode: "test",
  reasonLabel: "test",
  blockingIssues: [],
  signals: {},
  frontendPreviewable: true,
  ...over
});

describe("computeBuildUnitPreviewPipelineStatus", () => {
  it("returns undefined for non-user units", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "system",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "unavailable",
        intakePreviewUnavailableReason: "x",
        intakeDetectionJson: null,
        previewFeasibility: basePf()
      })
    ).toBeUndefined();
  });

  it("ready when snapshot or file exists", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: "f1",
        previewSnapshotId: null,
        intakePreviewState: "unavailable",
        intakePreviewUnavailableReason: "noise",
        intakeDetectionJson: null,
        previewFeasibility: basePf()
      })
    ).toBe("ready");
  });

  it("pending when queued even if a placeholder snapshot already exists", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: "snap-1",
        intakePreviewState: "queued",
        intakePreviewUnavailableReason: null,
        intakeDetectionJson: null,
        previewFeasibility: basePf()
      })
    ).toBe("pending");
  });

  it("pending for queued user unit without artifacts", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "queued",
        intakePreviewUnavailableReason: null,
        intakeDetectionJson: null,
        previewFeasibility: basePf()
      })
    ).toBe("pending");
  });

  it("pending for unavailable + async placeholder + frontendPreviewable", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "unavailable",
        intakePreviewUnavailableReason: INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER,
        intakeDetectionJson: null,
        previewFeasibility: basePf({ frontendPreviewable: true })
      })
    ).toBe("pending");
  });

  it("failed for unavailable with concrete reason (not placeholder)", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "unavailable",
        intakePreviewUnavailableReason: "Preview build error: boom",
        intakeDetectionJson: null,
        previewFeasibility: basePf({ frontendPreviewable: true })
      })
    ).toBe("failed");
  });

  it("not_previewable when generic placeholder but not structurally preview-pending", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "unavailable",
        intakePreviewUnavailableReason: INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER,
        intakeDetectionJson: null,
        previewFeasibility: basePf({ frontendPreviewable: false })
      })
    ).toBe("not_previewable");
  });

  it("pending when intake says ready but artifact ids missing (race)", () => {
    expect(
      computeBuildUnitPreviewPipelineStatus({
        sourceKind: "user",
        previewFileId: null,
        previewSnapshotId: null,
        intakePreviewState: "ready",
        intakePreviewUnavailableReason: null,
        intakeDetectionJson: null,
        previewFeasibility: basePf()
      })
    ).toBe("pending");
  });
});

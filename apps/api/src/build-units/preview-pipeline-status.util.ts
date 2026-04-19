import type { BuildUnitEntity } from "../db/entities/build-unit.entity";
import type { PreviewFeasibilityV1 } from "../preview-feasibility/preview-feasibility.util";
import { INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER } from "../source-intake/source-intake-static-audit.util";

export type BuildUnitPreviewPipelineStatus = "pending" | "ready" | "failed" | "not_previewable";

/** `frontendPreviewable` is optional on API payloads; intake `detectionJson` remains authoritative when absent. */
type PreviewFeasibilityForPipeline = PreviewFeasibilityV1 & { frontendPreviewable?: boolean };

type UnitForPipelineStatus = Pick<
  BuildUnitEntity,
  | "sourceKind"
  | "previewFileId"
  | "previewSnapshotId"
  | "intakePreviewState"
  | "intakePreviewUnavailableReason"
  | "intakeDetectionJson"
> & { previewFeasibility: PreviewFeasibilityForPipeline };

function detectionSaysFrontendPreviewable(detection: unknown): boolean {
  return Boolean(
    detection &&
      typeof detection === "object" &&
      (detection as Record<string, unknown>).frontendPreviewable === true
  );
}

function allowsAsyncPreviewArtifactWait(
  unit: Pick<BuildUnitEntity, "intakePreviewState" | "intakePreviewUnavailableReason">
): boolean {
  const st = unit.intakePreviewState;
  if (st === "queued") return true;
  if (st !== "unavailable") return false;
  const r = unit.intakePreviewUnavailableReason?.trim() ?? "";
  if (!r) return true;
  return r === INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER;
}

function isPreviewPending(unit: UnitForPipelineStatus): boolean {
  if (unit.previewFileId || unit.previewSnapshotId) return false;
  if (!allowsAsyncPreviewArtifactWait(unit)) return false;
  const pf = unit.previewFeasibility;
  if (pf.frontendPreviewable === true) return true;
  if (pf.frontendPreviewable === false) return false;
  return (
    detectionSaysFrontendPreviewable(unit.intakeDetectionJson) &&
    (unit.intakePreviewState === "unavailable" || unit.intakePreviewState === "queued")
  );
}

function isBuildingPreview(unit: UnitForPipelineStatus): boolean {
  const noArtifacts = !unit.previewFileId && !unit.previewSnapshotId;
  return (
    unit.intakePreviewState === "queued" ||
    (unit.intakePreviewState === "not_requested" &&
      detectionSaysFrontendPreviewable(unit.intakeDetectionJson) &&
      noArtifacts) ||
    isPreviewPending(unit)
  );
}

export function computeBuildUnitPreviewPipelineStatus(
  unit: UnitForPipelineStatus
): BuildUnitPreviewPipelineStatus | undefined {
  if (unit.sourceKind !== "user") return undefined;

  /**
   * Intake async preview build can persist a grid snapshot (SVG/PNG) before the HTML artifact exists.
   * While the intake queue is still active, the pipeline must stay `pending` so clients keep polling
   * until `previewFileId` / final state lands — not flip to `ready` on placeholder snapshots alone.
   */
  if (unit.intakePreviewState === "queued") {
    return "pending";
  }

  if (unit.previewFileId || unit.previewSnapshotId) return "ready";

  if (unit.intakePreviewState === "ready") return "pending";

  if (isBuildingPreview(unit)) return "pending";

  const st = unit.intakePreviewState;
  const r = unit.intakePreviewUnavailableReason?.trim() ?? "";
  if (st === "unavailable" && r && r !== INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER) {
    return "failed";
  }

  return "not_previewable";
}

/** Adds `previewPipelineStatus` for user-owned units; omits the field for catalog/system rows. */
export function withPreviewPipelineStatus<T extends UnitForPipelineStatus>(
  unit: T
): T & { previewPipelineStatus?: BuildUnitPreviewPipelineStatus } {
  const previewPipelineStatus = computeBuildUnitPreviewPipelineStatus(unit);
  return previewPipelineStatus === undefined ? unit : { ...unit, previewPipelineStatus };
}

import type { BuildUnitEntity } from "../db/entities/build-unit.entity";
import type { SourceIntakeSessionEntity } from "../db/entities/source-intake-session.entity";
import { loadPublishWithWarningsPolicyFromEnv } from "../source-intake/review/source-model-review.config";
import { normalizeSourceIntakeReviewResult } from "../source-intake/review/source-intake-review-normalizer";
import type { NormalizedSourceIntakeReviewV1 } from "../source-intake/review/source-intake-backend-review.types";
import { logBuildUnitPreviewFeasibilityAttach } from "./live-preview-debug.log";
import {
  evaluateBuildUnitPreviewFeasibility,
  evaluateSourceIntakePreviewFeasibility,
  type PreviewFeasibilityV1
} from "./preview-feasibility.util";

export function livePreviewPipelineV1FromEnv(): boolean {
  const v = process.env.MALV_LIVE_PREVIEW_PIPELINE_V1;
  return v === "1" || v === "true";
}

export function attachBuildUnitPreviewFeasibility(
  unit: BuildUnitEntity,
  livePipeline?: boolean
): BuildUnitEntity & { previewFeasibility: PreviewFeasibilityV1 } {
  const enabled = livePipeline ?? livePreviewPipelineV1FromEnv();
  const previewFeasibility = evaluateBuildUnitPreviewFeasibility(
    {
      sourceKind: unit.sourceKind,
      type: unit.type,
      category: unit.category,
      previewKind: unit.previewKind,
      codeSnippet: unit.codeSnippet,
      previewFileId: unit.previewFileId,
      previewSnapshotId: unit.previewSnapshotId ?? null,
      previewImageUrl: unit.previewImageUrl,
      intakePreviewState: unit.intakePreviewState ?? null,
      intakePreviewUnavailableReason: unit.intakePreviewUnavailableReason ?? null,
      intakeAuditDecision: unit.intakeAuditDecision ?? null,
      intakeDetectionJson: unit.intakeDetectionJson ?? null
    },
    { livePreviewPipelineV1Enabled: enabled }
  );
  logBuildUnitPreviewFeasibilityAttach({
    unit,
    pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
    pipelineEnabled: enabled,
    previewFeasibility
  });
  return Object.assign({}, unit, { previewFeasibility });
}

export function attachSourceIntakePreviewFeasibility(
  session: SourceIntakeSessionEntity
): SourceIntakeSessionEntity & { previewFeasibility: PreviewFeasibilityV1 } {
  return Object.assign({}, session, {
    previewFeasibility: evaluateSourceIntakePreviewFeasibility({
      status: session.status,
      auditDecision: session.auditDecision,
      previewState: session.previewState,
      previewUnavailableReason: session.previewUnavailableReason ?? null,
      detectionJson: session.detectionJson ?? null,
      buildUnitId: session.buildUnitId ?? null
    })
  });
}

/** API response shape: technical preview feasibility plus backend-owned review policy normalization. */
export type SourceIntakeSessionClientModel = SourceIntakeSessionEntity & {
  previewFeasibility: PreviewFeasibilityV1;
  normalizedReview: NormalizedSourceIntakeReviewV1;
};

export function attachSourceIntakeClientEnvelope(session: SourceIntakeSessionEntity): SourceIntakeSessionClientModel {
  const base = attachSourceIntakePreviewFeasibility(session);
  const normalizedReview = normalizeSourceIntakeReviewResult(session, {
    publishWithWarningsAllowed: loadPublishWithWarningsPolicyFromEnv()
  });
  return Object.assign({}, base, { normalizedReview });
}

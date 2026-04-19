import type { BuildUnitEntity } from "../db/entities/build-unit.entity";
import type { PreviewFeasibilityV1 } from "./preview-feasibility.util";
import {
  classifyFrameworkForLiveV1,
  extractPreviewFeasibilitySignals,
  runtimeBlockedForLiveV1
} from "./preview-feasibility.util";

export function shouldDebugLivePreviewForUnit(unitId: string): boolean {
  const needle = process.env.MALV_LIVE_PREVIEW_DEBUG_UNIT_ID?.trim();
  if (needle) return unitId === needle;
  return process.env.MALV_LIVE_PREVIEW_DEBUG === "1" || process.env.MALV_LIVE_PREVIEW_DEBUG === "true";
}

/**
 * Temporary structured logs for tracing feasibility → delivery (gated by env).
 */
export function logBuildUnitPreviewFeasibilityAttach(args: {
  unit: BuildUnitEntity;
  pipelineEnvRaw: string | undefined;
  pipelineEnabled: boolean;
  previewFeasibility: PreviewFeasibilityV1;
}): void {
  const { unit, pipelineEnvRaw, pipelineEnabled, previewFeasibility } = args;
  if (!shouldDebugLivePreviewForUnit(unit.id)) return;

  const signals = extractPreviewFeasibilitySignals(unit.intakeDetectionJson);
  const fwClass = classifyFrameworkForLiveV1(signals.framework ?? null);
  const audit = unit.intakeAuditDecision ?? null;
  const reactEligible = fwClass === "react_next" && (audit === "approved" || audit === "approved_with_warnings");
  const runtimeBlocked = runtimeBlockedForLiveV1(signals.runtime ?? null);
  const explicitUnavailable =
    unit.intakePreviewState === "unavailable" ||
    unit.intakePreviewState === "not_requested" ||
    unit.intakePreviewState === "queued";

  console.log(
    JSON.stringify({
      tag: "malv_live_preview.feasibility_attach",
      buildUnitId: unit.id,
      MALV_LIVE_PREVIEW_PIPELINE_V1: pipelineEnvRaw ?? "(unset)",
      previewFeasibilityPreviewMode: previewFeasibility.previewMode,
      previewFeasibilityReasonCode: previewFeasibility.reasonCode,
      previewFeasibilityReasonLabel: previewFeasibility.reasonLabel,
      intakeAuditDecision: audit,
      intakePreviewState: unit.intakePreviewState ?? null,
      previewFileId: unit.previewFileId ?? null,
      detectedFramework: signals.framework ?? null,
      detectedRuntime: signals.runtime ?? null,
      probableSurface: signals.surface ?? null,
      entrypointDetected: Boolean(signals.entrypointDetected),
      frameworkClass: fwClass,
      runtimeBlocked,
      reactEligible,
      explicitUnavailable,
      liveArtifactStructuralGate: {
        intakeReady: unit.intakePreviewState === "ready",
        hasPreviewFileId: Boolean(unit.previewFileId),
        reactEligible,
        entrypointDetected: Boolean(signals.entrypointDetected),
        pipelineEnabled,
        allSatisfied:
          unit.intakePreviewState === "ready" &&
          Boolean(unit.previewFileId) &&
          reactEligible &&
          Boolean(signals.entrypointDetected) &&
          pipelineEnabled
      },
      blockingIssues: previewFeasibility.blockingIssues
    })
  );
}

export function logBuildUnitLivePreviewDelivery(args: {
  unitId: string;
  pipelineEnvRaw: string | undefined;
  previewFeasibility: PreviewFeasibilityV1;
  livePreviewAttached: boolean;
  livePreview?: {
    available: boolean;
    kind?: string;
    fetchPath?: string;
    url?: string;
    reasonCode?: string;
    mimeType?: string | null;
  };
}): void {
  if (!shouldDebugLivePreviewForUnit(args.unitId)) return;
  const lp = args.livePreview;
  console.log(
    JSON.stringify({
      tag: "malv_live_preview.delivery_attach",
      buildUnitId: args.unitId,
      MALV_LIVE_PREVIEW_PIPELINE_V1: args.pipelineEnvRaw ?? "(unset)",
      previewFeasibilityPreviewMode: args.previewFeasibility.previewMode,
      previewFeasibilityReasonCode: args.previewFeasibility.reasonCode,
      livePreviewAttached: args.livePreviewAttached,
      livePreviewAvailable: lp?.available ?? null,
      livePreviewReasonCode: lp?.reasonCode ?? null,
      livePreviewFetchPath: lp?.fetchPath ?? lp?.url ?? null,
      livePreviewKind: lp?.kind ?? null,
      livePreviewMimeType: lp?.mimeType ?? null
    })
  );
}

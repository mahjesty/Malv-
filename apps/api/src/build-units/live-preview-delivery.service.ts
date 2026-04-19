import { Injectable } from "@nestjs/common";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import type { BuildUnitEntity } from "../db/entities/build-unit.entity";
import { logBuildUnitLivePreviewDelivery } from "../preview-feasibility/live-preview-debug.log";
import type { PreviewFeasibilityV1 } from "../preview-feasibility/preview-feasibility.util";
import {
  normalizeMime,
  BUILD_UNIT_PREVIEW_MIMES,
  BUILD_UNIT_PREVIEW_HTML_MIMES
} from "./build-unit-upload.constants";

/** Authenticated fetch path only — clients must send Authorization; not a public iframe src. */
export const buildUnitPreviewContentPath = (unitId: string) =>
  `/v1/workspaces/units/${encodeURIComponent(unitId)}/preview-content`;

export type LivePreviewPayloadV1 = {
  available: boolean;
  kind: "iframe_url" | "html_doc";
  /** Path for credentialed GET (Bearer); same security as existing preview-content. */
  fetchPath?: string;
  /** Same as `fetchPath` — additive alias for clients expecting `url`. Not a public unauthenticated iframe src. */
  url?: string;
  /** MIME from file row — client chooses iframe vs image wrapper. */
  mimeType?: string | null;
  viewport?: "component" | "page";
  title?: string;
  generatedAt?: string | null;
  reasonCode?: string;
  reasonLabel?: string;
};

@Injectable()
export class LivePreviewDeliveryService {
  constructor(private readonly files: FileUnderstandingService) {}

  /**
   * Adds `livePreview` only when preview feasibility is `live`; degrades truthfully when the artifact
   * cannot be served as an interactive/HTML or image preview.
   */
  async attachToBuildUnitResponse(
    _viewerUserId: string,
    unit: BuildUnitEntity & { previewFeasibility: PreviewFeasibilityV1 }
  ): Promise<BuildUnitEntity & { previewFeasibility: PreviewFeasibilityV1; livePreview?: LivePreviewPayloadV1 }> {
    if (unit.previewFeasibility.previewMode !== "live") {
      logBuildUnitLivePreviewDelivery({
        unitId: unit.id,
        pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
        previewFeasibility: unit.previewFeasibility,
        livePreviewAttached: false
      });
      return unit;
    }

    const fail = (code: string, label: string): LivePreviewPayloadV1 => ({
      available: false,
      kind: "html_doc",
      reasonCode: code,
      reasonLabel: label
    });

    if (!unit.previewFileId || !unit.authorUserId) {
      const out = { ...unit, livePreview: fail("no_preview_file", "This unit has no preview file attached.") };
      logBuildUnitLivePreviewDelivery({
        unitId: unit.id,
        pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
        previewFeasibility: unit.previewFeasibility,
        livePreviewAttached: true,
        livePreview: out.livePreview
      });
      return out;
    }

    try {
      const file = await this.files.assertUserOwnsFile(unit.authorUserId, unit.previewFileId);
      const mime = normalizeMime(file.mimeType);
      const det = unit.intakeDetectionJson;
      const surface =
        det && typeof det === "object" && det !== null && typeof (det as { probableSurface?: string }).probableSurface === "string"
          ? String((det as { probableSurface: string }).probableSurface).trim()
          : "";
      const viewport: "page" | "component" =
        surface && /landing|page|site|full/i.test(surface) ? "page" : "component";
      const generatedAt =
        file.updatedAt instanceof Date
          ? file.updatedAt.toISOString()
          : file.updatedAt
            ? String(file.updatedAt)
            : null;

      if (BUILD_UNIT_PREVIEW_HTML_MIMES.has(mime)) {
        // Always pin the fileId in the path so the server returns the HTML preview artifact
        // rather than the default (previewSnapshotId ?? previewFileId). Without this, units
        // that have a separate snapshot (SVG/PNG) would serve the snapshot instead of the HTML.
        const basePath = buildUnitPreviewContentPath(unit.id);
        const path = `${basePath}?fileId=${encodeURIComponent(unit.previewFileId!)}`;
        const livePreview: LivePreviewPayloadV1 = {
          available: true,
          kind: "html_doc",
          fetchPath: path,
          url: path,
          mimeType: mime,
          viewport,
          title: unit.title,
          generatedAt
        };
        logBuildUnitLivePreviewDelivery({
          unitId: unit.id,
          pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
          previewFeasibility: unit.previewFeasibility,
          livePreviewAttached: true,
          livePreview
        });
        return { ...unit, livePreview };
      }

      if (BUILD_UNIT_PREVIEW_MIMES.has(mime)) {
        const path = buildUnitPreviewContentPath(unit.id);
        const livePreview: LivePreviewPayloadV1 = {
          available: true,
          kind: "iframe_url",
          fetchPath: path,
          url: path,
          mimeType: mime,
          viewport,
          title: unit.title,
          generatedAt
        };
        logBuildUnitLivePreviewDelivery({
          unitId: unit.id,
          pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
          previewFeasibility: unit.previewFeasibility,
          livePreviewAttached: true,
          livePreview
        });
        return { ...unit, livePreview };
      }

      const failed = {
        ...unit,
        livePreview: fail(
          "unsupported_preview_mime",
          `Preview artifact MIME “${mime || "unknown"}” is not supported for live preview in v1.`
        )
      };
      logBuildUnitLivePreviewDelivery({
        unitId: unit.id,
        pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
        previewFeasibility: unit.previewFeasibility,
        livePreviewAttached: true,
        livePreview: failed.livePreview
      });
      return failed;
    } catch {
      const out = {
        ...unit,
        livePreview: fail(
          "preview_file_unreadable",
          "The preview file could not be read or is not accessible for this unit."
        )
      };
      logBuildUnitLivePreviewDelivery({
        unitId: unit.id,
        pipelineEnvRaw: process.env.MALV_LIVE_PREVIEW_PIPELINE_V1,
        previewFeasibility: unit.previewFeasibility,
        livePreviewAttached: true,
        livePreview: out.livePreview
      });
      return out;
    }
  }
}

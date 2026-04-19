import { isLikelyPlaceholderPreviewImageUrl } from "../build-units/published-preview-image-url.util";

/**
 * Deterministic preview feasibility for catalog build units and source intakes.
 * Truthful only — no optimistic live states or fake artifacts.
 *
 * Env (read in `preview-feasibility.attach.ts`, passed as options in tests):
 * - `MALV_LIVE_PREVIEW_PIPELINE_V1=1` — treat eligible React/Next + entrypoint sources as able to reach `live`
 *   once `intakePreviewState === 'ready'` and `previewFileId` are set. When unset, eligible sources with
 *   `unavailable` preview state and a code snippet surface `live_pipeline_disabled` / code fallback.
 */

export type PreviewModeV1 = "none" | "code" | "static" | "live";

export type PreviewFeasibilitySignalsV1 = {
  framework?: string | null;
  runtime?: string | null;
  entrypointDetected?: boolean;
  surface?: string | null;
};

export type PreviewFeasibilityV1 = {
  previewFeasible: boolean;
  previewMode: PreviewModeV1;
  reasonCode: string;
  reasonLabel: string;
  blockingIssues: string[];
  signals: PreviewFeasibilitySignalsV1;
};

export type PreviewFeasibilityOptions = {
  /**
   * When false (default), React/Next sources that are otherwise eligible for live preview
   * still surface as code/none with reason `live_pipeline_disabled` if preview state is not `ready`.
   * When true, structural eligibility can surface as `live` once `intakePreviewState === 'ready'`
   * and a preview file exists.
   */
  livePreviewPipelineV1Enabled?: boolean;
};

export type BuildUnitPreviewFeasibilityInput = {
  sourceKind: "system" | "user";
  type: string;
  category: string;
  previewKind: string;
  codeSnippet: string | null;
  previewFileId: string | null;
  /** Persisted Explore grid snapshot (files.id). */
  previewSnapshotId: string | null;
  previewImageUrl: string | null;
  intakePreviewState: string | null;
  intakePreviewUnavailableReason: string | null;
  intakeAuditDecision: string | null;
  intakeDetectionJson: Record<string, unknown> | null;
};

export type SourceIntakePreviewFeasibilityInput = {
  status: string;
  auditDecision: string;
  previewState: string;
  previewUnavailableReason: string | null;
  detectionJson: Record<string, unknown> | null;
  buildUnitId: string | null;
};

function isUnknownSentinel(value: string | null | undefined): boolean {
  const s = value?.trim() ?? "";
  if (!s) return true;
  return /^unknown(\s*\/\s*not inferred)?$/i.test(s);
}

export function extractPreviewFeasibilitySignals(
  det: Record<string, unknown> | null | undefined
): PreviewFeasibilitySignalsV1 {
  if (!det || typeof det !== "object") {
    return { framework: null, runtime: null, entrypointDetected: false, surface: null };
  }
  let framework = typeof det.framework === "string" ? det.framework.trim() : null;
  let runtime = typeof det.runtime === "string" ? det.runtime.trim() : null;
  const surface = typeof det.probableSurface === "string" ? det.probableSurface.trim() : null;
  const previewClass = typeof det.frontendPreviewClass === "string" ? det.frontendPreviewClass.trim() : "";
  if (isUnknownSentinel(framework) || framework === null) {
    if (previewClass === "static_html_document" || previewClass === "html_css_js_bundle") {
      framework = "static-html";
    }
  }
  if (isUnknownSentinel(runtime) || runtime === null) {
    if (previewClass === "static_html_document" || previewClass === "html_css_js_bundle") {
      runtime = "browser";
    }
  }
  const probableEp = typeof det.probableEntrypoint === "string" ? det.probableEntrypoint.trim() : "";
  const eps = Array.isArray(det.entrypoints) ? det.entrypoints : [];
  const entrypointDetected =
    Boolean(probableEp) ||
    eps.some((e) => typeof e === "string" && e.trim().length > 0);
  return { framework, runtime, entrypointDetected, surface };
}

type FrameworkClass = "react_next" | "vue" | "svelte" | "python" | "other" | "unknown";

export function classifyFrameworkForLiveV1(framework: string | null): FrameworkClass {
  if (!framework) return "unknown";
  const f = framework.toLowerCase();
  if (f.includes("python")) return "python";
  if (f.includes("vue")) return "vue";
  if (f.includes("svelte")) return "svelte";
  if (f.includes("react") || f.includes("jsx") || f.includes("next")) return "react_next";
  return "other";
}

/** True when runtime string suggests non-browser execution for v1 live UI. */
export function runtimeBlockedForLiveV1(runtime: string | null): boolean {
  if (!runtime) return false;
  const r = runtime.toLowerCase();
  if (r.includes("python")) return true;
  if (/\bjvm\b|\.java\b|spring boot/i.test(runtime)) return true;
  if (/\bruby\b|rails\b/i.test(runtime)) return true;
  if (r.includes("go ") || r.endsWith(" go") || r.startsWith("go ")) return true;
  return false;
}

function hasCodeSnippet(input: BuildUnitPreviewFeasibilityInput): boolean {
  return Boolean(input.codeSnippet?.trim());
}

function hasSystemImage(input: BuildUnitPreviewFeasibilityInput): boolean {
  const url = input.previewImageUrl?.trim() ?? "";
  if (url && isLikelyPlaceholderPreviewImageUrl(url)) return false;
  const sameOriginStatic = url.startsWith("/") && !url.startsWith("//");
  return (
    Boolean(input.previewFileId) ||
    Boolean(input.previewSnapshotId) ||
    /^https?:\/\//i.test(url) ||
    url.startsWith("blob:") ||
    sameOriginStatic
  );
}

/**
 * Evaluates catalog build unit preview feasibility.
 */
export function evaluateBuildUnitPreviewFeasibility(
  input: BuildUnitPreviewFeasibilityInput,
  opts: PreviewFeasibilityOptions = {}
): PreviewFeasibilityV1 {
  const livePipeline = Boolean(opts.livePreviewPipelineV1Enabled);
  const signals = extractPreviewFeasibilitySignals(input.intakeDetectionJson);
  const blockingIssues: string[] = [];

  if (input.sourceKind === "system") {
    const pk = input.previewKind;
    if (
      (pk === "image" || pk === "rendered" || pk === "animation" || pk === "mixed") &&
      hasSystemImage(input)
    ) {
      return {
        previewFeasible: true,
        previewMode: "static",
        reasonCode: "system_static_asset",
        reasonLabel: "Curated static preview asset (image or rendered card) is available for this catalog unit.",
        blockingIssues: [],
        signals
      };
    }
    if (pk === "code" && hasCodeSnippet(input)) {
      return {
        previewFeasible: true,
        previewMode: "code",
        reasonCode: "system_code_snippet",
        reasonLabel: "A representative code snippet is available to inspect.",
        blockingIssues: [],
        signals
      };
    }
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "system_no_preview",
      reasonLabel: "No preview asset or snippet is configured for this unit.",
      blockingIssues: [],
      signals
    };
  }

  // ── User-owned units ─────────────────────────────────────────────────────
  const audit = input.intakeAuditDecision ?? null;
  if (audit === "declined") {
    blockingIssues.push("Intake audit declined — live and catalog previews are not offered for this unit.");
    return {
      previewFeasible: hasCodeSnippet(input),
      previewMode: hasCodeSnippet(input) ? "code" : "none",
      reasonCode: "audit_declined",
      reasonLabel: "Source did not pass policy review; only a stored code snippet may be shown if present.",
      blockingIssues,
      signals
    };
  }

  if (audit === "pending" || audit == null) {
    blockingIssues.push("Intake audit is not complete — live preview is not available yet.");
    return {
      previewFeasible: hasCodeSnippet(input),
      previewMode: hasCodeSnippet(input) ? "code" : "none",
      reasonCode: "audit_pending",
      reasonLabel: "Audit is still pending or missing; preview is limited until a decision exists.",
      blockingIssues,
      signals
    };
  }

  const fwClass = classifyFrameworkForLiveV1(signals.framework ?? null);
  const runtimeBlocked = runtimeBlockedForLiveV1(signals.runtime ?? null);
  const unsupportedUiFramework = fwClass === "python" || fwClass === "vue" || fwClass === "svelte";

  if (unsupportedUiFramework) {
    blockingIssues.push(
      `Framework “${signals.framework ?? "unknown"}” is not supported for live browser preview in v1.`
    );
    if (hasCodeSnippet(input) || input.previewKind === "code") {
      return {
        previewFeasible: true,
        previewMode: "code",
        reasonCode: "unsupported_framework_code_fallback",
        reasonLabel: "Live preview is not supported for this framework family in v1; showing stored code only.",
        blockingIssues,
        signals
      };
    }
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "unsupported_framework",
      reasonLabel: "This framework is not eligible for live preview in v1 and no code snippet is stored.",
      blockingIssues,
      signals
    };
  }

  if (runtimeBlocked) {
    blockingIssues.push(
      `Runtime “${signals.runtime ?? "unknown"}” is not eligible for live browser preview in v1.`
    );
    if (hasCodeSnippet(input) || input.previewKind === "code") {
      return {
        previewFeasible: true,
        previewMode: "code",
        reasonCode: "unsupported_runtime_code_fallback",
        reasonLabel: "Runtime is not eligible for live browser preview in v1; showing stored code only.",
        blockingIssues,
        signals
      };
    }
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "unsupported_runtime",
      reasonLabel: "This runtime is not supported for live preview in v1, and no code snippet is present.",
      blockingIssues,
      signals
    };
  }

  const explicitUnavailable =
    input.intakePreviewState === "unavailable" ||
    input.intakePreviewState === "not_requested" ||
    input.intakePreviewState === "queued";

  const reactEligible =
    fwClass === "react_next" && (audit === "approved" || audit === "approved_with_warnings");

  const hasLiveArtifact =
    input.intakePreviewState === "ready" &&
    Boolean(input.previewFileId) &&
    reactEligible &&
    signals.entrypointDetected;

  if (hasLiveArtifact) {
    return {
      previewFeasible: true,
      previewMode: "live",
      reasonCode: "live_ready",
      reasonLabel: "A preview artifact is ready and policy allows showing it.",
      blockingIssues,
      signals
    };
  }

  if (hasCodeSnippet(input) || input.previewKind === "code") {
    let reasonCode = "code_snippet_available";
    let reasonLabel = "Code snippet is the available truthful preview for this unit.";
    if (explicitUnavailable && reactEligible && signals.entrypointDetected && !livePipeline) {
      reasonCode = "live_pipeline_disabled";
      reasonLabel =
        "This source looks eligible for live preview, but the live preview pipeline is not enabled in this environment. Use code preview.";
      blockingIssues.push(
        "MALV_LIVE_PREVIEW_PIPELINE_V1 is not enabled — structured live preview remains off until the pipeline is turned on."
      );
    } else if (explicitUnavailable && input.intakePreviewUnavailableReason?.trim()) {
      reasonCode = "preview_unavailable";
      reasonLabel = input.intakePreviewUnavailableReason.trim();
    } else if (explicitUnavailable) {
      reasonCode = "preview_unavailable";
      reasonLabel =
        input.intakePreviewUnavailableReason?.trim() ||
        "Live preview is not available for this unit (queued, not requested, or unavailable).";
    }

    return {
      previewFeasible: true,
      previewMode: "code",
      reasonCode,
      reasonLabel,
      blockingIssues,
      signals
    };
  }

  /**
   * User units store built or raw HTML previews as `previewKind: "rendered"` with `previewFileId`.
   * These are served as browser documents (iframe / credentialed fetch), not inert catalog snapshots.
   */
  const userHtmlRenderedArtifactReady =
    input.sourceKind === "user" &&
    input.previewKind === "rendered" &&
    input.intakePreviewState === "ready" &&
    Boolean(input.previewFileId) &&
    (audit === "approved" || audit === "approved_with_warnings");

  if (userHtmlRenderedArtifactReady) {
    return {
      previewFeasible: true,
      previewMode: "live",
      reasonCode: "html_artifact_ready",
      reasonLabel: "HTML preview artifact is ready — interactive browser preview is available.",
      blockingIssues,
      signals
    };
  }

  if (input.previewSnapshotId || input.previewFileId) {
    return {
      previewFeasible: true,
      previewMode: "static",
      reasonCode: "stored_catalog_snapshot",
      reasonLabel: "A stored catalog preview snapshot is available for this unit.",
      blockingIssues,
      signals
    };
  }

  if (reactEligible && !signals.entrypointDetected) {
    blockingIssues.push(
      "No entrypoint was detected (package.json hints or probable entrypoint). Live preview would need a resolvable entry."
    );
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "no_entrypoint",
      reasonLabel:
        "React/Next source without a detected entrypoint and no code snippet — nothing truthful to render in preview yet.",
      blockingIssues,
      signals
    };
  }

  if (explicitUnavailable && reactEligible && signals.entrypointDetected && !livePipeline) {
    blockingIssues.push(
      "MALV_LIVE_PREVIEW_PIPELINE_V1 is not enabled — no live or code fallback is available for this unit."
    );
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "live_pipeline_disabled",
      reasonLabel:
        "Live preview pipeline is disabled and no code snippet was stored on this unit — nothing truthful to render yet.",
      blockingIssues,
      signals
    };
  }

  return {
    previewFeasible: false,
    previewMode: "none",
    reasonCode: "no_preview_surface",
    reasonLabel:
      input.intakePreviewUnavailableReason?.trim() ||
      "No code snippet, static asset, or ready live preview exists for this unit.",
    blockingIssues,
    signals
  };
}

/**
 * Intake sessions never host a catalog preview file; live preview is evaluated on the published build unit.
 */
export function evaluateSourceIntakePreviewFeasibility(
  input: SourceIntakePreviewFeasibilityInput
): PreviewFeasibilityV1 {
  const signals = extractPreviewFeasibilitySignals(input.detectionJson);

  if (input.auditDecision === "declined" || input.status === "declined") {
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "audit_declined",
      reasonLabel: "Declined intakes do not offer preview surfaces.",
      blockingIssues: ["Policy declined this intake — preview is blocked."],
      signals
    };
  }

  if (
    input.auditDecision === "pending" ||
    input.status === "uploaded" ||
    input.status === "detecting" ||
    input.status === "auditing"
  ) {
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "intake_incomplete",
      reasonLabel: "Finish detection and audit before preview feasibility is final.",
      blockingIssues: ["Intake pipeline still running."],
      signals
    };
  }

  const terminalApproved =
    input.status === "approved" ||
    input.status === "approved_with_warnings" ||
    input.auditDecision === "approved" ||
    input.auditDecision === "approved_with_warnings";

  if (terminalApproved) {
    const baseReason =
      input.previewUnavailableReason?.trim() ||
      "Import Source does not host live previews. After you publish, open the build unit in Explore for catalog preview (code or live when available).";
    return {
      previewFeasible: false,
      previewMode: "none",
      reasonCode: "intake_no_catalog_surface",
      reasonLabel: baseReason,
      blockingIssues: [
        input.buildUnitId
          ? "This intake is already linked to a build unit — open that unit in Explore for preview surfaces."
          : "Publish to your library to create a build unit; preview feasibility is evaluated on the unit, not inside Import."
      ],
      signals
    };
  }

  return {
    previewFeasible: false,
    previewMode: "none",
    reasonCode: "intake_unknown_state",
    reasonLabel: "Intake is not in a recognized terminal state for preview messaging.",
    blockingIssues: [],
    signals
  };
}

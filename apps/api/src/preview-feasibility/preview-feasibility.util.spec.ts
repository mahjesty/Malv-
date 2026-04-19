import {
  evaluateBuildUnitPreviewFeasibility,
  evaluateSourceIntakePreviewFeasibility,
  extractPreviewFeasibilitySignals,
  type BuildUnitPreviewFeasibilityInput
} from "./preview-feasibility.util";

const baseUserUnit = (): BuildUnitPreviewFeasibilityInput => ({
  sourceKind: "user",
  type: "component",
  category: "code",
  previewKind: "none",
  codeSnippet: null,
  previewFileId: null,
  previewSnapshotId: null,
  previewImageUrl: null,
  intakePreviewState: "unavailable",
  intakePreviewUnavailableReason: "Pipeline off",
  intakeAuditDecision: "approved",
  intakeDetectionJson: {
    framework: "react",
    runtime: "Browser (Vite typical)",
    probableEntrypoint: "App.tsx",
    probableSurface: "landing-page"
  }
});

describe("extractPreviewFeasibilitySignals", () => {
  it("maps legacy unknown placeholders + HTML preview class to static-html / browser", () => {
    const s = extractPreviewFeasibilitySignals({
      framework: "Unknown / not inferred",
      runtime: "Unknown / not inferred",
      frontendPreviewClass: "static_html_document",
      probableEntrypoint: "index.html"
    });
    expect(s.framework).toBe("static-html");
    expect(s.runtime).toBe("browser");
    expect(s.entrypointDetected).toBe(true);
  });
});

describe("evaluateBuildUnitPreviewFeasibility", () => {
  it("react + entrypoint + ready + preview file => live", () => {
    const r = evaluateBuildUnitPreviewFeasibility(
      {
        ...baseUserUnit(),
        intakePreviewState: "ready",
        previewFileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        previewKind: "code",
        codeSnippet: "export default function X(){}"
      },
      { livePreviewPipelineV1Enabled: true }
    );
    expect(r.previewMode).toBe("live");
    expect(r.previewFeasible).toBe(true);
    expect(r.reasonCode).toBe("live_ready");
  });

  it("react + entrypoint + code snippet but no ready artifact => code", () => {
    const r = evaluateBuildUnitPreviewFeasibility(
      {
        ...baseUserUnit(),
        previewKind: "code",
        codeSnippet: "export default function Page() { return null; }"
      },
      { livePreviewPipelineV1Enabled: true }
    );
    expect(r.previewMode).toBe("code");
    expect(r.previewFeasible).toBe(true);
    expect(r.reasonCode).toBe("preview_unavailable");
  });

  it("react + no entrypoint + no snippet => no_entrypoint", () => {
    const r = evaluateBuildUnitPreviewFeasibility(
      {
        ...baseUserUnit(),
        intakeDetectionJson: {
          framework: "react",
          runtime: "Browser",
          entrypoints: []
        }
      },
      { livePreviewPipelineV1Enabled: true }
    );
    expect(r.previewMode).toBe("none");
    expect(r.previewFeasible).toBe(false);
    expect(r.reasonCode).toBe("no_entrypoint");
  });

  it("declined audit => no live / no code without snippet", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      ...baseUserUnit(),
      intakeAuditDecision: "declined",
      codeSnippet: null,
      previewKind: "none"
    });
    expect(r.previewMode).toBe("none");
    expect(r.previewFeasible).toBe(false);
    expect(r.reasonCode).toBe("audit_declined");
  });

  it("declined audit with snippet => code only", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      ...baseUserUnit(),
      intakeAuditDecision: "declined",
      codeSnippet: "x",
      previewKind: "code"
    });
    expect(r.previewMode).toBe("code");
    expect(r.previewFeasible).toBe(true);
  });

  it("explicit unavailable + eligible + pipeline off => live_pipeline_disabled when snippet exists", () => {
    const r = evaluateBuildUnitPreviewFeasibility(
      {
        ...baseUserUnit(),
        codeSnippet: "export {}",
        previewKind: "code"
      },
      { livePreviewPipelineV1Enabled: false }
    );
    expect(r.previewMode).toBe("code");
    expect(r.reasonCode).toBe("live_pipeline_disabled");
    expect(r.blockingIssues.some((b) => b.includes("MALV_LIVE_PREVIEW_PIPELINE_V1"))).toBe(true);
  });

  it("unsupported runtime without snippet => none", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      ...baseUserUnit(),
      intakeDetectionJson: {
        framework: "React (package hint)",
        runtime: "Python 3.12",
        probableEntrypoint: "main.py"
      }
    });
    expect(r.previewMode).toBe("none");
    expect(r.reasonCode).toBe("unsupported_runtime");
  });

  it("ready + file but missing entrypoint => stored catalog snapshot (static)", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      ...baseUserUnit(),
      intakePreviewState: "ready",
      previewFileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      intakeDetectionJson: { framework: "react", runtime: "Browser" },
      codeSnippet: null
    });
    expect(r.previewMode).toBe("static");
    expect(r.reasonCode).toBe("stored_catalog_snapshot");
  });

  it("ready + rendered HTML artifact => live (browser preview)", () => {
    const r = evaluateBuildUnitPreviewFeasibility(
      {
        ...baseUserUnit(),
        previewKind: "rendered",
        intakePreviewState: "ready",
        previewFileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        intakeDetectionJson: {
          framework: "static-html",
          runtime: "browser",
          frontendPreviewClass: "static_html_document",
          probableEntrypoint: "index.html"
        },
        codeSnippet: null
      },
      { livePreviewPipelineV1Enabled: true }
    );
    expect(r.previewMode).toBe("live");
    expect(r.reasonCode).toBe("html_artifact_ready");
  });

  it("catalog snapshot id only => static", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      ...baseUserUnit(),
      codeSnippet: null,
      previewSnapshotId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      intakeDetectionJson: { framework: "react", runtime: "Browser", probableEntrypoint: "" }
    });
    expect(r.previewMode).toBe("static");
    expect(r.reasonCode).toBe("stored_catalog_snapshot");
  });

  it("system unit with image preview => static", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      sourceKind: "system",
      type: "template",
      category: "ui",
      previewKind: "image",
      codeSnippet: null,
      previewFileId: null,
      previewSnapshotId: null,
      previewImageUrl: "https://example.com/card.png",
      intakePreviewState: null,
      intakePreviewUnavailableReason: null,
      intakeAuditDecision: null,
      intakeDetectionJson: null
    });
    expect(r.previewMode).toBe("static");
    expect(r.previewFeasible).toBe(true);
    expect(r.reasonCode).toBe("system_static_asset");
  });

  it("system unit with same-origin static catalog SVG => static", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      sourceKind: "system",
      type: "component",
      category: "ui",
      previewKind: "image",
      codeSnippet: null,
      previewFileId: null,
      previewSnapshotId: null,
      previewImageUrl: "/explore-catalog/ai-chat-interface.svg",
      intakePreviewState: null,
      intakePreviewUnavailableReason: null,
      intakeAuditDecision: null,
      intakeDetectionJson: null
    });
    expect(r.previewMode).toBe("static");
    expect(r.previewFeasible).toBe(true);
    expect(r.reasonCode).toBe("system_static_asset");
  });

  it("system unit with placeholder preview path => no static preview", () => {
    const r = evaluateBuildUnitPreviewFeasibility({
      sourceKind: "system",
      type: "component",
      category: "ui",
      previewKind: "image",
      codeSnippet: null,
      previewFileId: null,
      previewSnapshotId: null,
      previewImageUrl: "/placeholder.svg",
      intakePreviewState: null,
      intakePreviewUnavailableReason: null,
      intakeAuditDecision: null,
      intakeDetectionJson: null
    });
    expect(r.previewFeasible).toBe(false);
    expect(r.previewMode).toBe("none");
    expect(r.reasonCode).toBe("system_no_preview");
  });
});

describe("evaluateSourceIntakePreviewFeasibility", () => {
  it("approved intake => truthful no surface in Import", () => {
    const r = evaluateSourceIntakePreviewFeasibility({
      status: "approved",
      auditDecision: "approved",
      previewState: "unavailable",
      previewUnavailableReason: "Live preview pipeline is not yet enabled for source intakes.",
      detectionJson: { framework: "react" },
      buildUnitId: null
    });
    expect(r.previewMode).toBe("none");
    expect(r.previewFeasible).toBe(false);
    expect(r.reasonCode).toBe("intake_no_catalog_surface");
  });

  it("declined => blocked", () => {
    const r = evaluateSourceIntakePreviewFeasibility({
      status: "declined",
      auditDecision: "declined",
      previewState: "unavailable",
      previewUnavailableReason: null,
      detectionJson: null,
      buildUnitId: null
    });
    expect(r.reasonCode).toBe("audit_declined");
  });
});

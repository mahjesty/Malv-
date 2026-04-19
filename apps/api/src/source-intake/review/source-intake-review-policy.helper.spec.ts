import { evaluateSourceIntakePreviewFeasibility } from "../../preview-feasibility/preview-feasibility.util";
import { decideIntakeTerminal, runStaticIntakeAnalysis } from "../source-intake-static-audit.util";
import {
  assembleStaticPolicyModelReview,
  computePreviewAllowedPolicy,
  computePublishAllowedPolicy,
  mergeModelReviewEnrichment
} from "./source-intake-review-policy.helper";
import { deriveStaticPolicyReviewResultForAnalysis, normalizeSourceIntakeReviewResult } from "./source-intake-review-normalizer";
import type { SourceIntakeSessionEntity } from "../../db/entities/source-intake-session.entity";

describe("computePreviewAllowedPolicy / computePublishAllowedPolicy", () => {
  it("declined => preview and publish false", () => {
    expect(
      computePreviewAllowedPolicy({
        auditDecision: "declined",
        statusDeclined: true,
        pipelineReadError: false
      })
    ).toBe(false);
    expect(
      computePublishAllowedPolicy({
        auditDecision: "declined",
        buildUnitId: null,
        pipelineReadError: false,
        publishWithWarningsAllowed: true
      })
    ).toBe(false);
  });

  it("approved => preview and publish true when not linked", () => {
    expect(
      computePreviewAllowedPolicy({
        auditDecision: "approved",
        statusDeclined: false,
        pipelineReadError: false
      })
    ).toBe(true);
    expect(
      computePublishAllowedPolicy({
        auditDecision: "approved",
        buildUnitId: null,
        pipelineReadError: false,
        publishWithWarningsAllowed: true
      })
    ).toBe(true);
  });

  it("approved_with_warnings => preview true; publish follows warnings policy", () => {
    expect(
      computePreviewAllowedPolicy({
        auditDecision: "approved_with_warnings",
        statusDeclined: false,
        pipelineReadError: false
      })
    ).toBe(true);
    expect(
      computePublishAllowedPolicy({
        auditDecision: "approved_with_warnings",
        buildUnitId: null,
        pipelineReadError: false,
        publishWithWarningsAllowed: false
      })
    ).toBe(false);
    expect(
      computePublishAllowedPolicy({
        auditDecision: "approved_with_warnings",
        buildUnitId: null,
        pipelineReadError: false,
        publishWithWarningsAllowed: true
      })
    ).toBe(true);
  });

  it("pipeline read error => preview false and publish false", () => {
    expect(
      computePreviewAllowedPolicy({
        auditDecision: "declined",
        statusDeclined: true,
        pipelineReadError: true
      })
    ).toBe(false);
    expect(
      computePublishAllowedPolicy({
        auditDecision: "declined",
        buildUnitId: null,
        pipelineReadError: true,
        publishWithWarningsAllowed: true
      })
    ).toBe(false);
  });

  it("linked build unit => publish false even when approved", () => {
    expect(
      computePublishAllowedPolicy({
        auditDecision: "approved",
        buildUnitId: "u1",
        pipelineReadError: false,
        publishWithWarningsAllowed: true
      })
    ).toBe(false);
  });

  it("preview feasibility for intakes does not imply preview permission (policy is separate)", () => {
    const pf = evaluateSourceIntakePreviewFeasibility({
      status: "approved",
      auditDecision: "approved",
      previewState: "unavailable",
      previewUnavailableReason: "x",
      detectionJson: { framework: "React (package hint)", entrypoints: ["src/index.tsx"] },
      buildUnitId: null
    });
    expect(pf.previewFeasible).toBe(false);
    expect(
      computePreviewAllowedPolicy({
        auditDecision: "approved",
        statusDeclined: false,
        pipelineReadError: false
      })
    ).toBe(true);
  });
});

describe("assembleStaticPolicyModelReview", () => {
  it("records partial-analysis limitation when scanTruncated", () => {
    const t = decideIntakeTerminal([]);
    const mr = assembleStaticPolicyModelReview({
      terminal: t,
      findings: [],
      detectionJson: { note: "Shallow static inspection only." },
      auditSummaryLine: t.auditSummary,
      pipelineReadError: false,
      buildUnitId: null,
      publishWithWarningsAllowed: true,
      extractError: null,
      scanTruncated: true
    });
    expect(mr.reviewMode).toBe("static_policy_only");
    expect(mr.decision).toBe("approved");
    expect(mr.previewAllowed).toBe(true);
    expect(mr.publishAllowed).toBe(true);
    expect(mr.limitations?.some((l) => l.includes("partial"))).toBe(true);
    expect(mr.limitations?.some((l) => l.includes("Shallow"))).toBe(true);
  });

  it("maps findings to risks without inventing free-form summaries", () => {
    const t = decideIntakeTerminal([
      {
        code: "CMD_CHILD_PROCESS",
        severity: "warning",
        path: "x.js",
        line: null,
        message: "child_process usage detected"
      }
    ]);
    const mr = assembleStaticPolicyModelReview({
      terminal: t,
      findings: [
        {
          code: "CMD_CHILD_PROCESS",
          severity: "warning",
          path: "x.js",
          line: null,
          message: "child_process usage detected"
        }
      ],
      detectionJson: {},
      auditSummaryLine: t.auditSummary,
      pipelineReadError: false,
      buildUnitId: null,
      publishWithWarningsAllowed: true
    });
    expect(mr.summary).toBeUndefined();
    expect(mr.risks?.length).toBe(1);
    expect(mr.risks?.[0]?.title).toContain("child_process");
    expect(mr.confidence).toBe("medium");
  });
});

describe("mergeModelReviewEnrichment", () => {
  it("keeps backend decision when model returns narrative", () => {
    const base = assembleStaticPolicyModelReview({
      terminal: decideIntakeTerminal([]),
      findings: [],
      detectionJson: {},
      auditSummaryLine: "ok",
      pipelineReadError: false,
      buildUnitId: null,
      publishWithWarningsAllowed: true
    });
    const merged = mergeModelReviewEnrichment(base, {
      summary: "Model narrative about structure.",
      risks: [{ severity: "low", category: "Test", title: "Extra signal" }]
    });
    expect(merged.reviewMode).toBe("model_assisted");
    expect(merged.decision).toBe("approved");
    expect(merged.summary).toContain("Model narrative");
    expect(merged.risks?.some((x) => x.title.includes("Extra signal"))).toBe(true);
  });
});

describe("normalizeSourceIntakeReviewResult", () => {
  it("recomputes publishAllowed when buildUnitId becomes set", () => {
    const row = {
      id: "1",
      userId: "u",
      status: "approved",
      auditDecision: "approved",
      sourceFileId: "f",
      detectionJson: {},
      auditJson: {
        findings: [],
        modelReview: {
          version: 1,
          reviewMode: "static_policy_only",
          decision: "approved",
          previewAllowed: true,
          publishAllowed: true,
          rationale: "x"
        }
      },
      auditSummary: "x",
      previewState: "unavailable",
      previewUnavailableReason: null,
      buildUnitId: "bu-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as SourceIntakeSessionEntity;
    const n = normalizeSourceIntakeReviewResult(row, { publishWithWarningsAllowed: true });
    expect(n.publishAllowed).toBe(false);
    expect(n.previewAllowed).toBe(true);
  });
});

describe("deriveStaticPolicyReviewResultForAnalysis", () => {
  it("matches end-to-end static analysis terminal decision", () => {
    const buf = Buffer.from("eval('x')", "utf8");
    const a = runStaticIntakeAnalysis(buf, "bad.js");
    const mr = deriveStaticPolicyReviewResultForAnalysis({
      terminal: a.terminal,
      findings: a.findings,
      detectionJson: a.detectionJson,
      auditSummaryLine: a.terminal.auditSummary
    });
    expect(mr.decision).toBe("declined");
    expect(mr.previewAllowed).toBe(false);
    expect(mr.publishAllowed).toBe(false);
  });
});

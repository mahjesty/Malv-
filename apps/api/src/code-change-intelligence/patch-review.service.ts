import { Inject, Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type { ChangeAuditResult, ChangePatchReviewResult, ChangePlanResult } from "./change-intelligence.types";
import { DesignCritiqueService } from "./frontend-design-critique.service";
import { isFrontendRepoPath } from "./frontend-repo-paths";
import { RenderedUiReviewService } from "./rendered-ui-review.service";
import { UiVisualCritiqueService } from "./ui-visual-critique.service";
import { MalvModelAssistGateService } from "./model-readiness/malv-model-assist.gate.service";
import {
  MALV_REASONING_PROVIDER,
  MALV_VISION_CRITIQUE_PROVIDER,
  type MalvReasoningProvider,
  type MalvVisionCritiqueProvider
} from "./model-readiness/malv-intelligence-providers";
import type { UiVisualCritiqueResult } from "./ui-visual-critique.service";
import {
  distinctNonDefaultStatesFromArtifacts,
  isDefaultOnlyCapturedStates,
  mergeStateAwareRisks,
  type ReviewedStateRecord,
  type UiCaptureState
} from "./ui-state-capture-plan";

function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "apps", "api", "src");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function effectiveDesignScore(
  codeScore: number | null,
  rendered: { available: boolean; score: number | null },
  stateBoost: { enabled: boolean; distinctNonDefault: number; defaultOnly: boolean }
): number | null {
  if (rendered.available && rendered.score !== null) {
    let blended = codeScore === null ? rendered.score : Math.round(codeScore * 0.45 + rendered.score * 0.55);
    if (
      stateBoost.enabled &&
      !stateBoost.defaultOnly &&
      stateBoost.distinctNonDefault >= 2
    ) {
      const bump = Math.min(5, stateBoost.distinctNonDefault);
      blended = Math.min(100, blended + bump);
    }
    return blended;
  }
  return codeScore;
}

function adjustDesignConfidence(
  prior: "low" | "medium" | "high" | "n/a",
  effectiveScore: number | null
): "low" | "medium" | "high" | "n/a" {
  if (effectiveScore === null) return prior;
  if (prior === "n/a") {
    if (effectiveScore < 36) return "low";
    if (effectiveScore < 52) return "medium";
    return "high";
  }
  if (effectiveScore < 36) return "low";
  if (effectiveScore < 52) {
    if (prior === "high") return "medium";
    return prior;
  }
  return prior;
}

@Injectable()
export class PatchReviewService {
  constructor(
    private readonly designCritique: DesignCritiqueService,
    private readonly renderedUi: RenderedUiReviewService,
    private readonly uiVisualCritique: UiVisualCritiqueService,
    @Inject(MALV_VISION_CRITIQUE_PROVIDER) private readonly visionCritiqueProvider: MalvVisionCritiqueProvider,
    @Inject(MALV_REASONING_PROVIDER) private readonly reasoningProvider: MalvReasoningProvider,
    private readonly modelAssistGate: MalvModelAssistGateService
  ) {}

  async review(args: {
    filesChanged: string[];
    patchSummary: string;
    audit?: ChangeAuditResult | null;
    plan?: ChangePlanResult | null;
    priorDesignConfidence?: "low" | "medium" | "high" | "n/a";
    repoRoot?: string;
  }): Promise<ChangePatchReviewResult> {
    const issuesFound: Array<Record<string, unknown>> = [];
    if (!args.patchSummary.trim()) {
      issuesFound.push({
        domain: "engineering",
        code: "missing_patch_summary",
        severity: "high",
        note: "Patch summary is required for auditability."
      });
    }
    if (args.audit?.scopeClassification?.contractChanging && args.filesChanged.some((f) => f.includes("dto"))) {
      issuesFound.push({
        domain: "engineering",
        code: "contract_surface",
        severity: "medium",
        note: "DTO/contract files touched — confirm API consumers and OpenAPI/client stubs."
      });
    }
    if (args.plan?.visualStrategy && args.filesChanged.some((f) => isFrontendRepoPath(f.replace(/\\/g, "/")))) {
      issuesFound.push({
        domain: "design",
        code: "ui_surface",
        severity: "medium",
        note: "Frontend files changed — verify hierarchy, spacing rhythm, and motion restraint vs design strategy."
      });
    }
    if (args.plan?.visualStrategy) {
      issuesFound.push({
        domain: "design",
        code: "generic_layout_risk",
        severity: "low",
        note: "Check for generic flex-col card stacks without clear typographic hierarchy (anti-premium pattern)."
      });
    }
    const debt = args.plan?.frontendDesignAudit?.designDebtAreas;
    if (debt?.length && args.filesChanged.some((f) => isFrontendRepoPath(f.replace(/\\/g, "/")))) {
      issuesFound.push({
        domain: "design",
        code: "design_debt_from_repo_scan",
        severity: "low",
        note: `Repo design scan flagged: ${debt.slice(0, 2).join(" | ")}`
      });
    }

    const normalizedPaths = args.filesChanged.map((f) => f.replace(/\\/g, "/"));
    const touchesWeb = normalizedPaths.some((f) => isFrontendRepoPath(f));
    let designQualityScore: number | null = null;
    let designCritiqueSummary: string | null = null;
    let improvementSuggestions: string[] = [];
    let designCritiqueDimensions = null as ChangePatchReviewResult["designCritiqueDimensions"];

    let visualQualityScore: number | null = null;
    let renderedReviewAvailable = false;
    let renderedCritiqueSummary: string | null = null;
    let renderedReviewSkipReason: string | null = null;
    let renderedCritiqueIssues: ChangePatchReviewResult["renderedCritiqueIssues"] = [];
    let renderedCritiqueSuggestions: string[] = [];
    let renderedUiCaptureMeta: Record<string, unknown> | null = null;
    let reviewedStatesOut: ChangePatchReviewResult["reviewedStates"] = [];
    let stateCoverageSummaryOut: string | null = null;
    let stateAwareDesignRisksOut: string | null = null;
    let uxScenarioSimulationSummaryOut: string | null = null;
    let uxQualityScore: number | null = null;
    let userExperienceSummary: string | null = null;
    let frictionAnalysis: string | null = null;
    let usabilityIssuesOut: ChangePatchReviewResult["usabilityIssues"] = [];
    let frictionPointsOut: string[] = [];
    let designCritiqueModelMerged = false;

    if (touchesWeb) {
      const root = args.repoRoot ?? findRepoRoot();
      const webTsx = normalizedPaths.filter((f) => f.endsWith(".tsx") && isFrontendRepoPath(f));
      const touchedForCritique = webTsx.length ? webTsx : normalizedPaths;
      let critique = this.designCritique.critique(root, touchedForCritique);
      if (this.modelAssistGate.shouldAttemptModelAssist("design_critique")) {
        const aug = await this.reasoningProvider.augmentDesignCritique(
          { repoRoot: root, touchedRelPaths: touchedForCritique },
          critique
        );
        if (aug) {
          critique = aug;
          designCritiqueModelMerged = true;
        }
      }
      designQualityScore = critique.designQualityScore;
      designCritiqueSummary = critique.designCritiqueSummary;
      improvementSuggestions = critique.improvementSuggestions;
      designCritiqueDimensions = critique.dimensions;

      for (const issue of critique.issues) {
        issuesFound.push({
          domain: "design",
          code: `critique_${issue.code}`,
          severity: issue.severity,
          note: issue.note
        });
      }
      if (designQualityScore < 40) {
        issuesFound.push({
          domain: "design",
          code: "design_quality_score_low",
          severity: "high",
          note: `Heuristic code-pattern design quality score is ${designQualityScore}/100 — treat UI as high-risk until improved.`
        });
      } else if (designQualityScore < 55) {
        issuesFound.push({
          domain: "design",
          code: "design_quality_score_mediocre",
          severity: "medium",
          note: `Code-pattern design quality score ${designQualityScore}/100 suggests visible polish gaps.`
        });
      }

      try {
        const cap = await this.renderedUi.tryCapturePreview({ touchedRelPaths: normalizedPaths });
        reviewedStatesOut = cap.reviewedStates.map((r: ReviewedStateRecord) => ({
          uiState: r.uiState,
          routePath: r.routePath,
          viewport: r.viewport,
          colorScheme: r.colorScheme,
          captured: r.captured,
          skipReason: r.skipReason
        }));
        stateCoverageSummaryOut = cap.stateCoverageSummary;
        uxScenarioSimulationSummaryOut = cap.uxScenarioSimulationSummary ?? null;

        renderedUiCaptureMeta = {
          ok: cap.ok,
          skipReason: cap.skipReason ?? null,
          captureMs: cap.meta.captureMs,
          pathsAttempted: cap.meta.pathsAttempted,
          artifactCount: cap.artifacts.length,
          playwrightLoaded: cap.meta.playwrightLoaded,
          reviewedStates: reviewedStatesOut,
          stateCoverageSummary: cap.stateCoverageSummary,
          uxScenarioSimulationSummary: uxScenarioSimulationSummaryOut
        };

        if (cap.ok && cap.artifacts.length > 0) {
          const touchedSourcePaths = webTsx.length ? webTsx : normalizedPaths.filter((p) => isFrontendRepoPath(p));
          const emptyVis: UiVisualCritiqueResult = {
            renderedReviewAvailable: false,
            visualQualityScore: null,
            visualCritiqueSummary: null,
            issues: [],
            suggestions: [],
            stateAwareDesignRisks: null,
            uxQualityScore: null,
            userExperienceSummary: null,
            frictionAnalysis: null,
            usabilityIssues: [],
            frictionPoints: []
          };
          const delegated = await this.visionCritiqueProvider.augmentRenderedUiCritique(
            {
              artifactCount: cap.artifacts.length,
              stateCoverageSummary: cap.stateCoverageSummary,
              touchedSourcePaths,
              captureArtifacts: cap.artifacts,
              reviewedStates: cap.reviewedStates,
              uxScenarioSimulationSummary: cap.uxScenarioSimulationSummary ?? null
            },
            emptyVis
          );
          const vis =
            delegated ??
            (await this.uiVisualCritique.critiqueScreenshots(cap.artifacts, {
              touchedSourcePaths,
              stateCoverageSummary: cap.stateCoverageSummary,
              reviewedStates: cap.reviewedStates,
              uxScenarioSimulationSummary: cap.uxScenarioSimulationSummary
            }));
          renderedReviewAvailable = vis.renderedReviewAvailable;
          renderedReviewSkipReason = vis.skipReason ?? null;
          stateAwareDesignRisksOut = mergeStateAwareRisks({
            visionRisks: vis.renderedReviewAvailable ? vis.stateAwareDesignRisks : null,
            stateCoverageSummary: cap.stateCoverageSummary,
            reviewedStates: cap.reviewedStates
          });
          if (vis.renderedReviewAvailable && vis.visualQualityScore !== null) {
            visualQualityScore = vis.visualQualityScore;
            renderedCritiqueSummary = vis.visualCritiqueSummary;
            renderedCritiqueIssues = vis.issues;
            renderedCritiqueSuggestions = vis.suggestions;
            uxQualityScore = vis.uxQualityScore;
            userExperienceSummary = vis.userExperienceSummary;
            frictionAnalysis = vis.frictionAnalysis;
            usabilityIssuesOut = vis.usabilityIssues;
            frictionPointsOut = vis.frictionPoints;
            for (const issue of vis.issues) {
              issuesFound.push({
                domain: "design",
                code: `rendered_visual_${issue.code}`,
                severity: issue.severity,
                note: issue.note
              });
            }
            for (const issue of vis.usabilityIssues) {
              issuesFound.push({
                domain: "ux",
                code: `rendered_ux_${issue.code}`,
                severity: issue.severity,
                note: issue.note
              });
            }
            for (const fp of vis.frictionPoints.slice(0, 12)) {
              issuesFound.push({
                domain: "ux",
                code: "friction_point",
                severity: "low",
                note: fp
              });
            }
            for (const s of vis.suggestions.slice(0, 6)) {
              improvementSuggestions.push(`[rendered] ${s}`);
            }
            if (vis.usabilityIssues.length || vis.frictionPoints.length || vis.userExperienceSummary) {
              improvementSuggestions.push(
                "[ux] See userExperienceSummary, frictionAnalysis, usabilityIssues, and frictionPoints on this review."
              );
            }
            if (visualQualityScore < 40) {
              issuesFound.push({
                domain: "design",
                code: "rendered_visual_quality_low",
                severity: "high",
                note: `Rendered UI quality score is ${visualQualityScore}/100 — validate on device before release.`
              });
            } else if (visualQualityScore < 55) {
              issuesFound.push({
                domain: "design",
                code: "rendered_visual_quality_mediocre",
                severity: "medium",
                note: `Rendered UI quality score ${visualQualityScore}/100 suggests visible layout or density issues.`
              });
            }
            if (uxQualityScore !== null && uxQualityScore < 40) {
              issuesFound.push({
                domain: "ux",
                code: "ux_quality_score_low",
                severity: "high",
                note: `Rendered UX quality score is ${uxQualityScore}/100 — revisit flows, copy, and affordances before release.`
              });
            } else if (uxQualityScore !== null && uxQualityScore < 55) {
              issuesFound.push({
                domain: "ux",
                code: "ux_quality_score_mediocre",
                severity: "medium",
                note: `UX quality score ${uxQualityScore}/100 suggests usability or completeness gaps visible in preview.`
              });
            }
          } else {
            renderedCritiqueSummary = null;
            renderedReviewSkipReason = vis.skipReason ?? cap.skipReason ?? "rendered_critique_unavailable";
          }
        } else {
          renderedReviewSkipReason = cap.skipReason ?? "preview_unavailable";
          stateAwareDesignRisksOut = mergeStateAwareRisks({
            visionRisks: null,
            stateCoverageSummary: cap.stateCoverageSummary,
            reviewedStates: cap.reviewedStates
          });
        }
      } catch (e) {
        renderedReviewSkipReason = `rendered_review_error:${e instanceof Error ? e.message : String(e)}`;
        renderedUiCaptureMeta = { error: renderedReviewSkipReason };
      }
    }

    const prior = args.priorDesignConfidence ?? "n/a";
    const capturedUiStates: UiCaptureState[] = reviewedStatesOut
      .filter((r) => r.captured)
      .map((r) => r.uiState as UiCaptureState);
    const stateBoost = {
      enabled: renderedReviewAvailable,
      distinctNonDefault: distinctNonDefaultStatesFromArtifacts(capturedUiStates),
      defaultOnly: isDefaultOnlyCapturedStates(capturedUiStates)
    };
    const effectiveScore = touchesWeb
      ? effectiveDesignScore(designQualityScore, { available: renderedReviewAvailable, score: visualQualityScore }, stateBoost)
      : null;
    const adjustedDesignConfidence = touchesWeb
      ? adjustDesignConfidence(prior, effectiveScore)
      : prior;

    const issuesFixed =
      issuesFound.length > 0
        ? issuesFound.map((i) => ({
            code: i.code,
            domain: i.domain,
            resolution: "Captured in review; address before merge to protected branches."
          }))
        : [];

    const residualEngineeringRisks =
      args.filesChanged.length > 12
        ? "Large change set: hidden coupling or missed edge cases possible."
        : args.audit?.scopeClassification?.dataModelChanging
          ? "Data model touch: verify migrations and rollback."
          : "No high-severity engineering residual detected from heuristics.";

    let residualDesignRisks = args.plan?.visualStrategy
      ? "Visual polish and motion must be validated on real devices; automated review cannot prove taste."
      : "N/A";

    if (touchesWeb && designCritiqueSummary) {
      residualDesignRisks =
        residualDesignRisks === "N/A"
          ? `Code-pattern critique: ${designCritiqueSummary}`
          : `${residualDesignRisks} Code-pattern critique: ${designCritiqueSummary}`;
    }
    if (touchesWeb && renderedReviewAvailable && renderedCritiqueSummary) {
      residualDesignRisks = `${residualDesignRisks} Rendered critique: ${renderedCritiqueSummary}`;
    } else if (touchesWeb && !renderedReviewAvailable && renderedReviewSkipReason) {
      residualDesignRisks = `${residualDesignRisks} Rendered UI review unproven (${renderedReviewSkipReason}).`;
    }
    if (touchesWeb && stateCoverageSummaryOut) {
      residualDesignRisks = `${residualDesignRisks} State coverage: ${stateCoverageSummaryOut}`;
    }
    if (touchesWeb && stateAwareDesignRisksOut) {
      residualDesignRisks = `${residualDesignRisks} State-aware risks: ${stateAwareDesignRisksOut}`;
    }
    if (touchesWeb && userExperienceSummary) {
      residualDesignRisks = `${residualDesignRisks} Product UX read: ${userExperienceSummary}`;
    }
    if (touchesWeb && frictionAnalysis) {
      residualDesignRisks = `${residualDesignRisks} Friction: ${frictionAnalysis}`;
    }

    let reviewSummary =
      touchesWeb && designQualityScore !== null
        ? `Peak review: engineering + code-pattern UI critique (score ${designQualityScore}/100, confidence ${adjustedDesignConfidence}).`
        : "Peak review: engineering (abstraction, contracts, security/realtime intersections) + design quality when UI is in scope.";
    if (touchesWeb && renderedReviewAvailable && visualQualityScore !== null) {
      reviewSummary = `Peak review: engineering + code-pattern UI (${designQualityScore}/100) + rendered visual (${visualQualityScore}/100); confidence ${adjustedDesignConfidence}.`;
      if (uxQualityScore !== null) {
        reviewSummary += ` UX experience score ${uxQualityScore}/100 (product + usability from screenshots).`;
      }
      if (stateCoverageSummaryOut) {
        reviewSummary += ` ${stateCoverageSummaryOut}`;
      }
    } else if (touchesWeb && !renderedReviewAvailable) {
      reviewSummary += " Rendered screenshot critique unavailable or unproven — see skip reason in metadata.";
    }

    return {
      reviewSummary,
      issuesFound,
      issuesFixed,
      malvPatchReviewPhaseProducers: touchesWeb
        ? {
            design_critique: designCritiqueModelMerged ? "merged" : "heuristic",
            rendered_ui_critique: renderedReviewAvailable ? "model" : "heuristic"
          }
        : undefined,
      residualRisks: [residualEngineeringRisks, residualDesignRisks].filter((x) => x !== "N/A").join(" "),
      residualEngineeringRisks,
      residualDesignRisks: args.plan?.visualStrategy || touchesWeb ? residualDesignRisks : "N/A",
      designQualityScore,
      designCritiqueSummary,
      improvementSuggestions,
      designCritiqueDimensions,
      visualQualityScore,
      renderedReviewAvailable,
      renderedCritiqueSummary,
      renderedReviewSkipReason,
      renderedCritiqueIssues,
      renderedCritiqueSuggestions,
      reviewedStates: reviewedStatesOut,
      stateCoverageSummary: stateCoverageSummaryOut,
      stateAwareDesignRisks: stateAwareDesignRisksOut,
      renderedUiCaptureMeta,
      adjustedDesignConfidence,
      uxScenarioSimulationSummary: touchesWeb ? uxScenarioSimulationSummaryOut : null,
      uxQualityScore: touchesWeb ? uxQualityScore : null,
      userExperienceSummary: touchesWeb ? userExperienceSummary : null,
      frictionAnalysis: touchesWeb ? frictionAnalysis : null,
      usabilityIssues: touchesWeb ? usabilityIssuesOut : [],
      frictionPoints: touchesWeb ? frictionPointsOut : []
    };
  }
}

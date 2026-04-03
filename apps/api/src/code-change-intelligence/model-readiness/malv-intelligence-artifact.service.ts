import { Injectable } from "@nestjs/common";
import type { ChangeAuditResult, ChangePatchReviewResult, ChangePlanResult } from "../change-intelligence.types";
import type { BugDetectionResult, FixPlanningResult, PerformanceIntelResult } from "../malv-intelligence.types";
import { MalvModelAssistGateService } from "./malv-model-assist.gate.service";
import type { MalvIntelligenceArtifactV1, MalvIntelligencePhase, MalvModelReadinessBundle } from "./malv-model-assist.types";
import { MALV_INTELLIGENCE_ARTIFACT_VERSION } from "./malv-model-assist.types";

@Injectable()
export class MalvIntelligenceArtifactService {
  constructor(private readonly gate: MalvModelAssistGateService) {}

  private artifact(
    phase: MalvIntelligenceArtifactV1["phase"],
    selectedProducer: MalvIntelligenceArtifactV1["selectedProducer"],
    metrics: Record<string, unknown>
  ): MalvIntelligenceArtifactV1 {
    return {
      v: MALV_INTELLIGENCE_ARTIFACT_VERSION,
      phase,
      assistMode: this.gate.getMode(),
      selectedProducer,
      producersAttempted: {
        heuristic: true,
        model: this.gate.shouldAttemptModelAssist(phase)
      },
      capturedAt: new Date().toISOString(),
      metrics
    };
  }

  /** Fingerprints for audit + bug + fix + perf (perf folded into codebase_audit metrics). */
  buildAuditPipelineReadiness(args: {
    audit: ChangeAuditResult;
    bugDetection: BugDetectionResult;
    performanceIntel: PerformanceIntelResult;
    fixPlan: FixPlanningResult;
    /** When model augmentation merged into heuristic output for a phase. */
    producerByPhase?: Partial<Record<MalvIntelligencePhase, MalvIntelligenceArtifactV1["selectedProducer"]>>;
  }): MalvModelReadinessBundle {
    return {
      assistMode: this.gate.getMode(),
      modelAssistLive: this.gate.modelAssistLive(),
      artifacts: {
        codebase_audit: this.artifact(
          "codebase_audit",
          args.producerByPhase?.codebase_audit ?? "heuristic",
          {
            summaryLength: args.audit.summary.length,
            impactedFileCount: args.audit.impactedFiles.length,
            contractChanging: args.audit.scopeClassification.contractChanging,
            securitySensitive: args.audit.scopeClassification.securitySensitive,
            perfScannedFiles: args.performanceIntel.scannedFiles,
            perfIssueCount: args.performanceIntel.issues.length
          }
        ),
        bug_detection_reasoning: this.artifact(
          "bug_detection_reasoning",
          args.producerByPhase?.bug_detection_reasoning ?? "heuristic",
          {
            scannedFiles: args.bugDetection.scannedFiles,
            issueCount: args.bugDetection.issues.length
          }
        ),
        fix_planning: this.artifact(
          "fix_planning",
          args.producerByPhase?.fix_planning ?? "heuristic",
          {
            itemCount: args.fixPlan.items.length,
            pipelinePolicy: args.fixPlan.pipelinePolicy.slice(0, 200)
          }
        )
      }
    };
  }

  buildPlanningStageReadiness(
    plan: ChangePlanResult,
    producerByPhase?: Partial<Record<MalvIntelligencePhase, MalvIntelligenceArtifactV1["selectedProducer"]>>
  ): MalvModelReadinessBundle {
    return {
      assistMode: this.gate.getMode(),
      modelAssistLive: this.gate.modelAssistLive(),
      artifacts: {
        change_planning: this.artifact(
          "change_planning",
          producerByPhase?.change_planning ?? "heuristic",
          {
            strategy: plan.strategy,
            trustLevel: plan.trustLevel,
            filesToModifyCount: plan.filesToModify.length,
            filesToCreateCount: plan.filesToCreate.length,
            hasVisualStrategy: Boolean(plan.visualStrategy),
            hasDesignBrain: Boolean(plan.designBrain)
          }
        ),
        design_strategy: this.artifact(
          "design_strategy",
          producerByPhase?.design_strategy ?? "heuristic",
          {
            hasVisualStrategy: Boolean(plan.visualStrategy),
            hasDesignBrain: Boolean(plan.designBrain),
            layoutStrategyLen: plan.visualStrategy?.layoutStrategy?.length ?? 0
          }
        )
      }
    };
  }

  buildPatchReviewReadiness(
    out: ChangePatchReviewResult,
    producerByPhase?: Partial<Record<MalvIntelligencePhase, MalvIntelligenceArtifactV1["selectedProducer"]>>
  ): MalvModelReadinessBundle {
    return {
      assistMode: this.gate.getMode(),
      modelAssistLive: this.gate.modelAssistLive(),
      artifacts: {
        design_critique: this.artifact(
          "design_critique",
          producerByPhase?.design_critique ?? "heuristic",
          {
            designQualityScore: out.designQualityScore,
            improvementSuggestionCount: out.improvementSuggestions.length
          }
        ),
        rendered_ui_critique: this.artifact(
          "rendered_ui_critique",
          producerByPhase?.rendered_ui_critique ?? "heuristic",
          {
            renderedReviewAvailable: out.renderedReviewAvailable,
            visualQualityScore: out.visualQualityScore,
            uxQualityScore: out.uxQualityScore,
            capturedStateCount: out.reviewedStates.filter((r) => r.captured).length
          }
        ),
        patch_review_synthesis: this.artifact(
          "patch_review_synthesis",
          producerByPhase?.patch_review_synthesis ?? "heuristic",
          {
            issuesFoundCount: out.issuesFound.length,
            engineeringDomainCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "engineering").length,
            designDomainCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "design").length,
            uxDomainCount: out.issuesFound.filter((i) => (i as { domain?: string }).domain === "ux").length,
            adjustedDesignConfidence: out.adjustedDesignConfidence
          }
        )
      }
    };
  }
}

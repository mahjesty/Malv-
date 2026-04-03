import { Injectable } from "@nestjs/common";
import type { ExecutionLayerOutput, MetaRouterInput } from "../meta-intelligence.types";
import { ConfidenceEngineService } from "../confidence-engine.service";

@Injectable()
export class ExecutionIntelligenceService {
  constructor(private readonly confidenceEngine: ConfidenceEngineService = new ConfidenceEngineService()) {}

  analyze(input: MetaRouterInput, signals?: { uncertaintyValidationNeeded?: boolean; debugDetected?: boolean }): ExecutionLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const uncertain = signals?.uncertaintyValidationNeeded || input.evidenceLevel === "weak";
    const highRisk = input.riskTier === "high";
    const complexTask = input.scopeSize === "large" || /\band\b|\bthen\b|\bmulti\b|\bworkflow\b/.test(text);
    const executionReadiness = uncertain ? "blocked" : highRisk ? "needs_validation" : "ready";
    const executionReadinessReason =
      executionReadiness === "blocked"
        ? "insufficient_confidence_requires_validation_first"
        : executionReadiness === "needs_validation"
          ? "risk_tier_requires_guarded_execution"
          : "sufficient_confidence_for_guided_action";

    const actionPlan = complexTask
      ? ["scope_actions", "sequence_by_risk", "execute_phase_1", "validate_phase_1", "execute_remaining_phases"]
      : ["identify_change_surface", "prepare_safe_patch", "validate_results"];
    const evidenceScore = input.evidenceLevel === "strong" ? 0.85 : input.evidenceLevel === "partial" ? 0.62 : 0.35;
    const riskPenalty = highRisk ? 0.2 : input.riskTier === "medium" ? 0.08 : 0;
    const uncertaintyPenalty = uncertain ? 0.25 : 0;
    const complexityPenalty = complexTask ? 0.08 : 0;
    const debugPenalty = signals?.debugDetected ? 0.08 : 0;
    const executionConfidence = Math.max(0, Math.min(1, Number((evidenceScore - riskPenalty - uncertaintyPenalty - complexityPenalty - debugPenalty).toFixed(3))));
    const readinessConfidence =
      executionReadiness === "ready"
        ? Math.max(0, Math.min(1, Number((executionConfidence + 0.08).toFixed(3))))
        : executionReadiness === "needs_validation"
          ? Math.max(0, Math.min(1, Number((executionConfidence - 0.08).toFixed(3))))
          : Math.max(0, Math.min(1, Number((executionConfidence - 0.18).toFixed(3))));

    const confidenceEval = this.confidenceEngine.evaluate({
      inputClarity: text.trim().length > 10 ? 0.74 : 0.45,
      contextCompleteness: input.scopeSize === "large" ? 0.62 : 0.75,
      ambiguity: uncertain ? 0.75 : complexTask ? 0.45 : 0.2,
      riskLevel: highRisk ? 0.8 : input.riskTier === "medium" ? 0.5 : 0.25
    });

    return {
      executionReadiness,
      executionReadinessReason,
      actionPlan,
      checkpointPlan: ["pre_change_snapshot", "post_change_checks", "final_regression_gate"],
      rollbackRisk: highRisk || uncertain ? "high" : complexTask ? "medium" : "low",
      completionCriteria: ["policy_compliant", "tests_green_or_explained", "user_goal_met"],
      requiresApproval: highRisk || Boolean(signals?.debugDetected),
      executionConfidence,
      readinessConfidence,
      confidence: confidenceEval.score,
      fallbackSuggested: confidenceEval.level === "low"
    };
  }
}

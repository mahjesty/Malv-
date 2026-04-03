import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, SynthesisLayerOutput } from "../meta-intelligence.types";
import { ConfidenceEngineService } from "../confidence-engine.service";

@Injectable()
export class SynthesisIntelligenceService {
  constructor(private readonly confidenceEngine: ConfidenceEngineService = new ConfidenceEngineService()) {}

  analyze(
    input: MetaRouterInput,
    signals?: {
      emotionalState?: string;
      situationalPriority?: string;
      analyticalNextStep?: string;
      uncertaintyClass?: string;
      researchReliability?: string;
    }
  ): SynthesisLayerOutput {
    const conflictBetweenSignals: string[] = [];
    if (signals?.analyticalNextStep?.includes("execution") && (signals?.uncertaintyClass === "tentative" || signals?.uncertaintyClass === "unknown")) {
      conflictBetweenSignals.push("analysis_prefers_action_but_uncertainty_requires_validation");
    }
    if (signals?.researchReliability === "unknown" && input.modeType === "execute") {
      conflictBetweenSignals.push("execution_intent_outpaces_evidence_reliability");
    }
    const unresolvedTensions = input.urgency === "high" && input.riskTier === "high" ? ["speed_vs_safety"] : [];
    const synthesizedUnderstanding = [
      `${input.modeType} request`,
      `scope=${input.scopeSize}`,
      `risk=${input.riskTier}`,
      signals?.emotionalState ? `emotion=${signals.emotionalState}` : "",
      signals?.situationalPriority ? `priority=${signals.situationalPriority}` : "",
      signals?.uncertaintyClass ? `certainty=${signals.uncertaintyClass}` : ""
    ]
      .filter(Boolean)
      .join("; ");

    const unifiedRecommendation =
      conflictBetweenSignals.length > 0
        ? "proceed_with_validation_first_then_guarded_execution"
        : input.riskTier === "high"
          ? "prefer_checked_steps_with_validation"
          : "proceed_with_compact_execution";
    const conflictSeverityScore = Math.max(
      0,
      Math.min(
        1,
        Number((conflictBetweenSignals.length * 0.35 + unresolvedTensions.length * 0.25 + (input.riskTier === "high" ? 0.2 : 0)).toFixed(3))
      )
    );
    const evidenceBase = input.evidenceLevel === "strong" ? 0.88 : input.evidenceLevel === "partial" ? 0.64 : 0.38;
    const uncertaintyPenalty = signals?.uncertaintyClass === "unknown" ? 0.28 : signals?.uncertaintyClass === "tentative" ? 0.14 : 0;
    const synthesisConfidence = Math.max(
      0,
      Math.min(1, Number((evidenceBase - uncertaintyPenalty - conflictSeverityScore * 0.4).toFixed(3)))
    );
    const confidenceEval = this.confidenceEngine.evaluate({
      inputClarity: 0.72,
      contextCompleteness: input.scopeSize === "large" ? 0.68 : 0.76,
      ambiguity: Math.min(1, conflictSeverityScore + (signals?.uncertaintyClass === "unknown" ? 0.2 : 0)),
      riskLevel: input.riskTier === "high" ? 0.75 : input.riskTier === "medium" ? 0.45 : 0.25
    });

    return {
      synthesizedUnderstanding,
      unresolvedTensions,
      conflictBetweenSignals,
      unifiedRecommendation,
      synthesisConfidence,
      conflictSeverityScore,
      confidence: confidenceEval.score,
      fallbackSuggested: confidenceEval.level === "low"
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, ReviewCritiqueLayerOutput } from "../meta-intelligence.types";

@Injectable()
export class ReviewCritiqueIntelligenceService {
  analyze(input: MetaRouterInput): ReviewCritiqueLayerOutput {
    const qualityAssessment = input.riskTier === "high" ? "mixed" : "strong";
    return {
      qualityAssessment,
      weaknessMap: qualityAssessment === "mixed" ? ["validation_depth", "rollback_plan"] : ["minor_edge_cases"],
      critiquePriorityOrder: ["correctness", "safety", "maintainability"],
      actionableImprovements: ["tighten_validation", "document_assumptions", "confirm_non_regression"],
      releaseReadinessEstimate: input.riskTier === "high" ? "needs_checks" : "ready"
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, ResearchWebLayerOutput } from "../meta-intelligence.types";
import { ConfidenceEngineService } from "../confidence-engine.service";

@Injectable()
export class ResearchWebIntelligenceService {
  constructor(private readonly confidenceEngine: ConfidenceEngineService = new ConfidenceEngineService()) {}

  analyze(input: MetaRouterInput): ResearchWebLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const asksWeb = text.includes("web") || text.includes("research") || text.includes("source") || text.includes("evidence");
    const contradiction = /\bbut\b|\bhowever\b|\bconflict\b|\bcontradict\b/.test(text);
    const insufficientData = input.evidenceLevel === "weak" && !asksWeb;
    const contradictionPenalty = contradiction ? 0.25 : 0;
    const evidenceBase = input.evidenceLevel === "strong" ? 0.9 : input.evidenceLevel === "partial" ? 0.62 : 0.35;
    const askBonus = asksWeb ? 0.05 : 0;
    const insufficientPenalty = insufficientData ? 0.15 : 0;
    const evidenceConfidence = Math.max(0, Math.min(1, Number((evidenceBase + askBonus - contradictionPenalty - insufficientPenalty).toFixed(3))));
    const evidenceSummary = asksWeb
      ? [
          input.evidenceLevel === "strong" ? "strong_internal_signal_present" : "external_verification_requested",
          contradiction ? "possible_conflicting_claims_detected" : "no_explicit_conflict_marker"
        ]
      : ["no_external_research_signal"];

    const confidenceEval = this.confidenceEngine.evaluate({
      inputClarity: text.trim().length > 10 ? 0.7 : 0.45,
      contextCompleteness: asksWeb ? 0.7 : 0.55,
      ambiguity: contradiction ? 0.6 : input.evidenceLevel === "weak" ? 0.5 : 0.25,
      riskLevel: input.riskTier === "high" ? 0.75 : input.riskTier === "medium" ? 0.45 : 0.25
    });

    return {
      researchIntent: asksWeb ? "investigate" : "none",
      evidenceSummary,
      sourceConfidenceProfile: input.evidenceLevel === "strong" ? "high" : input.evidenceLevel === "partial" ? "medium" : "low",
      contradictionNotes: contradiction ? ["request_contains_conflicting_phrasing"] : [],
      answerReliabilityEstimate: insufficientData ? "unknown" : input.evidenceLevel === "strong" ? "verified" : input.evidenceLevel === "partial" ? "strongly_inferred" : "tentative",
      followupResearchNeeds: asksWeb ? ["collect_sources", contradiction ? "resolve_conflicting_sources" : "cross_check_primary_claims"] : [],
      insufficientData,
      evidenceConfidence,
      confidence: confidenceEval.score,
      fallbackSuggested: confidenceEval.level === "low"
    };
  }
}

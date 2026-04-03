import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, UncertaintyLayerOutput } from "../meta-intelligence.types";

@Injectable()
export class UncertaintyIntelligenceService {
  analyze(input: MetaRouterInput): UncertaintyLayerOutput {
    const certaintyClass =
      input.evidenceLevel === "strong" ? "verified" : input.evidenceLevel === "partial" ? "strongly_inferred" : input.riskTier === "high" ? "unknown" : "tentative";
    return {
      certaintyClass,
      evidenceLevel: input.evidenceLevel,
      validationNeeded: input.riskTier === "high" || certaintyClass !== "verified",
      overclaimRisk: input.evidenceLevel === "weak" ? "high" : input.evidenceLevel === "partial" ? "medium" : "low"
    };
  }
}

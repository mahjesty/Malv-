import { Injectable } from "@nestjs/common";

export type ConfidenceEngineInput = {
  inputClarity: number;
  contextCompleteness: number;
  ambiguity: number;
  riskLevel: number;
  historicalSuccess?: number;
  domain?: "execution" | "research" | "device" | "general";
  highRiskAction?: boolean;
  evidenceStrength?: "strong" | "partial" | "weak";
};

export type ConfidenceEngineOutput = {
  score: number;
  level: "low" | "medium" | "high";
  factors: Record<string, number>;
  confidenceExplanation?: string;
  confidenceTrace?: {
    domain: "execution" | "research" | "device" | "general";
    domainDelta: number;
    evidenceAdjustment: number;
    highRiskEscalation: boolean;
  };
  validationRequired?: boolean;
};

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Number(v.toFixed(3));
}

@Injectable()
export class ConfidenceEngineService {
  evaluate(input: ConfidenceEngineInput): ConfidenceEngineOutput {
    const clarity = clamp01(input.inputClarity);
    const completeness = clamp01(input.contextCompleteness);
    const ambiguity = clamp01(input.ambiguity);
    const risk = clamp01(input.riskLevel);
    const historical = clamp01(input.historicalSuccess ?? 0.5);

    const base = clarity * 0.3 + completeness * 0.3;
    const bonus = historical * 0.2;
    const penalty = ambiguity * 0.1 + risk * 0.1;
    const baseScore = clamp01(base + bonus - penalty);
    const domain = input.domain ?? "general";
    const domainDelta = domain === "execution" ? -0.04 : domain === "research" ? 0.04 : domain === "device" ? -0.06 : 0;
    const evidenceAdjustment =
      input.evidenceStrength === "weak" && baseScore > 0.7
        ? -0.06
        : input.evidenceStrength === "partial" && baseScore > 0.8
          ? -0.03
          : 0;
    const score = clamp01(baseScore + domainDelta + evidenceAdjustment);
    const level: ConfidenceEngineOutput["level"] = score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";
    const validationRequired = Boolean(input.highRiskAction && level === "low");
    const confidenceExplanation = `confidence=${score.toFixed(3)} (${level}) from clarity/completeness with domain=${domain}`;

    return {
      score,
      level,
      factors: {
        inputClarity: clarity,
        contextCompleteness: completeness,
        ambiguity,
        riskLevel: risk,
        historicalSuccess: historical,
        base: Number(base.toFixed(3)),
        bonus: Number(bonus.toFixed(3)),
        penalty: Number(penalty.toFixed(3))
      },
      confidenceExplanation,
      confidenceTrace: {
        domain,
        domainDelta: Number(domainDelta.toFixed(3)),
        evidenceAdjustment: Number(evidenceAdjustment.toFixed(3)),
        highRiskEscalation: validationRequired
      },
      validationRequired
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, TrustSafetyLayerOutput } from "../meta-intelligence.types";

@Injectable()
export class TrustSafetyIntelligenceService {
  analyze(input: MetaRouterInput): TrustSafetyLayerOutput {
    const highRisk = input.riskTier === "high";
    return {
      riskSummary: highRisk ? "elevated_risk_require_validation" : "standard_risk_profile",
      approvalNeeded: highRisk,
      trustLevel: highRisk ? "guarded" : "high",
      safetyFlags: highRisk ? ["safety_review_required"] : [],
      privacyFlags: input.requestText?.toLowerCase().includes("secret") ? ["sensitive_data_mention"] : []
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { DebuggingLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class DebuggingIntelligenceService {
  analyze(input: MetaRouterInput): DebuggingLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const failureClassification = text.includes("test") ? "test" : text.includes("type") ? "type" : text.includes("crash") || text.includes("runtime") ? "runtime" : "unknown";
    return {
      failureClassification,
      probableRootCause: failureClassification === "unknown" ? "insufficient_signals" : `likely_${failureClassification}_issue`,
      diagnosticConfidence: failureClassification === "unknown" ? 0.45 : 0.78,
      affectedLayers: ["coding", "execution", "review_critique"],
      fastestSafeFixPath: ["reproduce", "narrow_scope", "validate_fix", "run_regression_checks"]
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { CodingLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class CodingIntelligenceService {
  analyze(input: MetaRouterInput): CodingLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const languageProfile = [text.includes("python") ? "python" : text.includes("java") ? "java" : text.includes("typescript") || text.includes("nest") ? "typescript" : "unknown"];
    const frameworkProfile = [text.includes("nest") ? "nestjs" : text.includes("react") ? "react" : "generic"];
    return {
      languageProfile,
      frameworkProfile,
      ecosystemRiskMap: input.riskTier === "high" ? ["production_change_risk"] : ["standard_change_risk"],
      confidenceByArea: { syntax: 0.8, integration: input.riskTier === "high" ? 0.55 : 0.7 },
      recommendedValidationByStack: ["run_typecheck", "run_lint", "run_tests"]
    };
  }
}

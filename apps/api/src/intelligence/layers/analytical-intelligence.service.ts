import { Injectable } from "@nestjs/common";
import type { AnalyticalLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class AnalyticalIntelligenceService {
  analyze(input: MetaRouterInput, signals?: { contextualComplexity?: "low" | "medium" | "high" }): AnalyticalLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const multiPart = /\band\b|\bthen\b|\balso\b|,/.test(text) || input.scopeSize === "large";
    const debugSignal = /\berror\b|\bfail\b|\bbug\b|\bstack\b|\bexception\b/.test(text);
    const missingInformation = this.detectMissingInformation(text, input);
    const riskFactors: string[] = [];
    if (input.riskTier === "high") riskFactors.push("high_risk_environment");
    if (input.evidenceLevel === "weak") riskFactors.push("low_evidence_confidence");
    if (missingInformation.length > 0) riskFactors.push("incomplete_problem_definition");

    const requiresDeepBreakdown = multiPart || signals?.contextualComplexity === "high";
    const breakdown = requiresDeepBreakdown
      ? ["clarify_subproblems", "map_dependencies", "prioritize_safe_sequence", "define_validation_gates"]
      : ["define_core_problem", "identify_primary_constraint", "select_minimum_safe_path"];
    if (debugSignal) breakdown.unshift("reproduce_failure_signal");

    const hypotheses = debugSignal
      ? ["symptom_from_upstream_dependency", "type_contract_drift", "regression_introduced_recently", "environment_mismatch"]
      : ["requirement_ambiguity", "context_gap", "constraint_conflict"];

    return {
      problemBreakdown: breakdown,
      rootCauseHypotheses: hypotheses,
      dependencyMap: [
        "user_intent -> execution_strategy",
        "uncertainty -> validation_requirements",
        "safety_policy -> action_permissions",
        "context_scope -> response_depth"
      ],
      riskFactors,
      missingInformation,
      recommendedNextStep:
        missingInformation.length > 0 ? "request_missing_information_before_execution" : input.modeType === "execute" ? "prepare_phased_safe_action_plan" : "start_ranked_investigation"
    };
  }

  private detectMissingInformation(text: string, input: MetaRouterInput): string[] {
    const missing: string[] = [];
    if (input.modeType === "fix" || input.modeType === "execute") {
      if (!/\berror\b|\blog\b|\btrace\b|\bfailing\b/.test(text)) missing.push("failure_evidence_missing");
      if (!/\bexpected\b|\bshould\b|\bgoal\b/.test(text)) missing.push("target_outcome_not_explicit");
    }
    if (input.evidenceLevel === "weak") missing.push("supporting_evidence_is_weak");
    return missing;
  }
}

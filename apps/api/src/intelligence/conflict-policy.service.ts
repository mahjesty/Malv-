import { Injectable } from "@nestjs/common";
import type { MetaConflictDecision, MetaRouterInput } from "./meta-intelligence.types";

@Injectable()
export class ConflictPolicyService {
  resolve(input: MetaRouterInput): MetaConflictDecision[] {
    const highUrgency = input.urgency === "high";
    const highRisk = input.riskTier === "high";
    const confusedFamily = input.tone === "confused" || input.tone === "emotional";
    const sensitive = input.tone === "sensitive";
    const fixFamily = input.modeType === "fix" || input.modeType === "execute";
    const explainFamily = input.modeType === "explain" || input.modeType === "analyze";
    const responseMode = fixFamily ? "action" : explainFamily ? "explanation" : "balanced";

    return [
      {
        conflictType: "urgency_vs_completeness",
        winner: highUrgency && !highRisk ? "urgency" : "completeness",
        loser: highUrgency && !highRisk ? "completeness" : "urgency",
        policyApplied: highUrgency && !highRisk ? "minimum_safe_complete_with_deferred_checklist" : "fuller_completeness_due_to_risk",
        rationale: "Urgency can compress output only when risk posture allows."
      },
      {
        conflictType: "empathy_vs_directness",
        winner: confusedFamily || sensitive ? "balanced" : "directness",
        loser: confusedFamily || sensitive ? "over_directness" : "excess_empathy",
        policyApplied: confusedFamily || sensitive ? "single_empathy_line_then_direct" : "direct_with_minimal_ack",
        rationale: "Empathy shapes framing; clarity remains mandatory."
      },
      {
        conflictType: "speed_vs_safety",
        winner: "safety",
        loser: "speed",
        policyApplied: highRisk ? "block_unsafe_shortcut_require_validation" : "safe_fast_path_if_available",
        rationale: "Safety constraints are non-negotiable."
      },
      {
        conflictType: "confidence_vs_uncertainty",
        winner: "uncertainty",
        loser: "confidence",
        policyApplied: "certainty_can_only_stay_or_downgrade",
        rationale: "Confidence cannot overrule missing evidence."
      },
      {
        conflictType: "action_vs_explanation",
        winner: responseMode,
        loser: responseMode === "action" ? "long_explanation_first" : "immediate_action_without_context",
        policyApplied: responseMode === "action" ? "action_then_brief_why" : responseMode === "explanation" ? "explain_then_options" : "balanced_split",
        rationale: "Task mode drives structure to avoid drift."
      }
    ];
  }
}

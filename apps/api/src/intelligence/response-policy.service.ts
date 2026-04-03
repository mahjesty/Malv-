import { Injectable } from "@nestjs/common";
import type {
  CertaintyClass,
  IntelligenceLayerId,
  MetaConflictDecision,
  MetaExecutionPolicy,
  MetaFinalResponsePolicy,
  MetaRouterInput
} from "./meta-intelligence.types";

@Injectable()
export class ResponsePolicyService {
  derive(
    input: MetaRouterInput,
    _conflictDecisions: MetaConflictDecision[],
    layerOutputs?: Partial<Record<IntelligenceLayerId, unknown>>
  ): MetaFinalResponsePolicy {
    const highUrgency = input.urgency === "high";
    const highRisk = input.riskTier === "high";
    const fixFamily = input.modeType === "fix" || input.modeType === "execute";
    const explainFamily = input.modeType === "explain" || input.modeType === "analyze";
    const emotional = layerOutputs?.emotional as any;
    const uncertainty = layerOutputs?.uncertainty as any;
    const trust = layerOutputs?.trust_safety as any;
    const communication = layerOutputs?.communication as any;
    const contextual = layerOutputs?.contextual as any;
    const callContext = layerOutputs?.call_context as any;
    const deviceControl = layerOutputs?.device_control as any;
    const continuity = layerOutputs?.chat_to_call_continuity as any;
    const execution = layerOutputs?.execution as any;
    const synthesis = layerOutputs?.synthesis as any;
    const research = layerOutputs?.research as any;
    const fallbackSuggested =
      Boolean(deviceControl?.fallbackSuggested) ||
      Boolean(execution?.fallbackSuggested) ||
      Boolean(research?.fallbackSuggested) ||
      Boolean((layerOutputs?.call_context as any)?.fallbackSuggested);

    const certaintyClass = uncertainty?.certaintyClass ?? this.certaintyFromEvidence(input);
    let confidenceScore = this.computeConfidenceScore(input, {
      routeConfidence: deviceControl?.routeConfidence,
      executionConfidence: execution?.executionConfidence,
      synthesisConfidence: synthesis?.synthesisConfidence,
      evidenceConfidence: research?.evidenceConfidence
    });
    if (input.modeType === "execute") confidenceScore = Math.max(0, confidenceScore - 0.03);
    if (input.modeType === "analyze" || input.modeType === "explain") confidenceScore = Math.min(1, confidenceScore + 0.02);
    if (deviceControl?.executionTarget && deviceControl.executionTarget !== "none") confidenceScore = Math.max(0, confidenceScore - 0.03);
    const evidenceWeak =
      ((research?.evidenceSummary?.length ?? 0) === 0 && (research?.contradictionNotes?.length ?? 0) === 0) ||
      input.evidenceLevel === "weak";
    if (confidenceScore > 0.8 && evidenceWeak) confidenceScore = Math.max(0, confidenceScore - 0.06);
    const confidenceClass: MetaFinalResponsePolicy["confidenceClass"] =
      confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.6 ? "medium" : "low";
    const responseMode: MetaFinalResponsePolicy["responseMode"] = fixFamily ? "action_first" : explainFamily ? "explanation_first" : "balanced";
    const toneStyle: MetaFinalResponsePolicy["toneStyle"] = emotional?.responseStyleRecommendation
      ? emotional.responseStyleRecommendation
      : callContext?.voiceToneStrategy === "urgent"
        ? "strategic_operator"
        : callContext?.voiceToneStrategy === "supportive"
          ? "supportive_clear"
      : input.tone === "technical"
        ? "technical_precise"
        : fixFamily || input.tone === "direct" || highUrgency
          ? "concise_fix"
          : "calm_direct";

    const lowConfidenceHighRisk = confidenceClass === "low" && (highRisk || (deviceControl?.executionRisk ?? "low") === "high");
    return {
      responseMode,
      toneStyle,
      depth:
        communication?.responseDepth ??
        (confidenceClass === "low" ? "deep" : confidenceClass === "medium" ? "standard" : highUrgency ? "brief" : explainFamily || input.scopeSize === "large" ? "deep" : "standard"),
      certaintyClass,
      confidenceClass,
      validationNeeded:
        highRisk ||
        certaintyClass === "tentative" ||
        certaintyClass === "unknown" ||
        Boolean(uncertainty?.validationNeeded) ||
        Boolean(deviceControl?.approvalRequired) ||
        fallbackSuggested ||
        confidenceClass !== "high" ||
        lowConfidenceHighRisk ||
        continuity?.continuityHealth === "weak",
      includeNextStepChecklist: highUrgency || input.scopeSize !== "small",
      includeRiskCallouts:
        highRisk ||
        certaintyClass !== "verified" ||
        (trust?.safetyFlags.length ?? 0) > 0 ||
        (callContext?.callPrivacyFlags?.length ?? 0) > 0 ||
        (deviceControl?.executionRisk ?? "low") !== "low" ||
        confidenceClass === "low" ||
        continuity?.continuityHealth === "weak",
      includeEmpathyLine:
        input.tone === "sensitive" ||
        input.tone === "emotional" ||
        input.tone === "confused" ||
        contextual?.stateModel?.userStressLevel === "high" ||
        continuity?.continuityState === "recovery_needed",
      confidenceExplanation: `confidence=${confidenceScore.toFixed(3)} class=${confidenceClass} mode=${input.modeType}`
    };
  }

  deriveExecutionPolicy(input: MetaRouterInput, layerOutputs?: Partial<Record<IntelligenceLayerId, unknown>>): MetaExecutionPolicy {
    const trust = layerOutputs?.trust_safety as any;
    const execution = layerOutputs?.execution as any;
    const uncertainty = layerOutputs?.uncertainty as any;
    const deviceControl = layerOutputs?.device_control as any;
    const highRisk = input.riskTier === "high";

    return {
      posture: execution?.executionReadiness === "ready" ? "actionable_plan" : execution?.executionReadiness === "needs_validation" ? "guided_execution" : "observe_only",
      approvalPosture: highRisk || trust?.approvalNeeded || Boolean(deviceControl?.approvalRequired) ? "elevated" : "normal",
      allowAutonomousActions: false,
      requireSandboxValidation:
        highRisk || (uncertainty?.validationNeeded ?? false) || execution?.executionReadiness !== "ready" || deviceControl?.executionTarget !== "none"
    };
  }

  private certaintyFromEvidence(input: MetaRouterInput): CertaintyClass {
    if (input.evidenceLevel === "strong") return "verified";
    if (input.evidenceLevel === "partial") return "strongly_inferred";
    if (input.evidenceLevel === "weak" && input.riskTier === "high") return "unknown";
    return "tentative";
  }

  private computeConfidenceScore(
    input: MetaRouterInput,
    parts: { routeConfidence?: number; executionConfidence?: number; synthesisConfidence?: number; evidenceConfidence?: number }
  ): number {
    const base = input.evidenceLevel === "strong" ? 0.85 : input.evidenceLevel === "partial" ? 0.62 : 0.4;
    const route = parts.routeConfidence ?? base;
    const execution = parts.executionConfidence ?? base;
    const synthesis = parts.synthesisConfidence ?? base;
    const evidence = parts.evidenceConfidence ?? base;
    const score = route * 0.24 + execution * 0.3 + synthesis * 0.24 + evidence * 0.22;
    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
  }
}

import { Injectable } from "@nestjs/common";
import type { DeviceIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";
import { ConfidenceEngineService } from "../confidence-engine.service";
import { BridgeRoutingService } from "./bridge-routing.service";
import { ExternalExecutionService } from "./external-execution.service";

@Injectable()
export class DeviceIntelligenceService {
  constructor(
    private readonly bridgeRouting: BridgeRoutingService,
    private readonly externalExecution: ExternalExecutionService,
    private readonly confidenceEngine: ConfidenceEngineService = new ConfidenceEngineService()
  ) {}

  analyze(input: MetaRouterInput): DeviceIntelligenceLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const targets: DeviceIntelligenceLayerOutput["executionTarget"][] = [];
    if (/\bphone\b|\bmobile\b|\bcall\b|\bsms\b/.test(text) || input.activeDevice === "phone") targets.push("phone");
    if (/\bdesktop\b|\blaptop\b|\bterminal\b/.test(text) || input.activeDevice === "desktop") targets.push("desktop");
    if (/\bbrowser\b|\btab\b|\bwebsite\b/.test(text) || input.activeDevice === "browser") targets.push("browser");
    if (/\bhome\b|\blight\b|\bthermostat\b|\bmatter\b|\bassistant\b/.test(text) || input.activeDevice === "home_hub") targets.push("home_device");
    const ambiguousSignal = /\bdevice\b|\bsystem\b|\bit\b|\bthat\b/.test(text) && targets.length === 0;
    const executionTarget =
      targets.length === 0 ? "none" : targets.length > 1 ? "multi_target" : targets[0];

    const permissionStatus: DeviceIntelligenceLayerOutput["permissionStatus"] =
      input.riskTier === "high"
        ? "restricted"
        : !input.requestedExternalExecution || executionTarget === "none"
          ? "unknown"
          : input.vaultScoped
            ? "restricted"
            : "allowed";
    const executionRisk: DeviceIntelligenceLayerOutput["executionRisk"] =
      executionTarget === "none" || ambiguousSignal
        ? "medium"
        : input.riskTier === "high"
          ? "high"
          : input.riskTier === "medium" || executionTarget === "multi_target"
            ? "medium"
            : "low";
    const bridgeRoute = this.bridgeRouting.analyze(input, executionTarget);
    const capabilityMismatch = executionTarget !== "none" && bridgeRoute === "none";
    const targetCountPenalty = targets.length > 1 ? 0.2 : 0;
    const ambiguityPenalty = ambiguousSignal ? 0.35 : 0;
    const bridgePenalty = capabilityMismatch ? 0.35 : bridgeRoute === "multi_bridge" ? 0.15 : 0;
    const permissionPenalty = permissionStatus === "allowed" ? 0 : permissionStatus === "restricted" ? 0.2 : 0.3;
    const evidenceBonus = input.evidenceLevel === "strong" ? 0.15 : input.evidenceLevel === "partial" ? 0.05 : 0;
    const routeConfidence = Math.max(0, Math.min(1, Number((0.6 + evidenceBonus - targetCountPenalty - ambiguityPenalty - bridgePenalty - permissionPenalty).toFixed(3))));
    const confidenceReason = capabilityMismatch
      ? "bridge_unavailable_for_target"
      : ambiguousSignal
        ? "target_ambiguous_requires_clarification"
        : routeConfidence >= 0.75
          ? "target_and_bridge_are_clear"
          : routeConfidence >= 0.6
            ? "partially_clear_targeting"
            : "low_route_certainty";

    const base: DeviceIntelligenceLayerOutput = {
      executionTarget,
      bridgeRoute,
      executionPlan:
        ambiguousSignal || capabilityMismatch
          ? ["classify_request", "request_target_clarification", "fallback_to_advisory_plan"]
          : ["classify_request", "determine_target", "gate_on_policy", "prepare_execution"],
      approvalRequired: executionRisk !== "low" || permissionStatus !== "allowed" || capabilityMismatch || ambiguousSignal,
      permissionStatus,
      rollbackPlan: ["snapshot_target_state", "prepare_inverse_action", "validate_recovery", "log_recovery_artifact"],
      executionRisk,
      confirmationStrategy: capabilityMismatch || ambiguousSignal ? "deny_and_explain" : "ask_before_execute",
      routeConfidence,
      confidenceReason,
      confidence: this.confidenceEngine.evaluate({
        inputClarity: text.trim().length > 10 ? 0.72 : 0.45,
        contextCompleteness: executionTarget !== "none" ? 0.75 : 0.4,
        ambiguity: ambiguousSignal ? 0.8 : targets.length > 1 ? 0.55 : 0.2,
        riskLevel: input.riskTier === "high" ? 0.8 : input.riskTier === "medium" ? 0.5 : 0.25
      }).score,
      fallbackSuggested: routeConfidence < 0.45
    };
    return this.externalExecution.analyze(input, base);
  }
}

import { Injectable } from "@nestjs/common";
import type { ContextualLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class ContextualIntelligenceService {
  analyze(input: MetaRouterInput): ContextualLayerOutput {
    const text = (input.requestText ?? "").toLowerCase();
    const repeatedSignals = /\bagain\b|\bstill\b|\balready\b|\brepeated\b/.test(text);
    const continuityReplaySignal =
      Boolean(input.lastTaskSummary) &&
      Boolean(input.requestText) &&
      (input.lastTaskSummary ?? "").slice(0, 48).toLowerCase() === (input.requestText ?? "").slice(0, 48).toLowerCase();
    const stressSignal = input.tone === "frustrated" || input.tone === "dissatisfied" || input.tone === "urgent";
    const sessionPhase =
      input.modeType === "execute" ? "executing" : input.modeType === "fix" ? "solving" : input.modeType === "improve" ? "refining" : "exploring";
    const hiddenConstraints = [input.riskTier === "high" ? "approval_gates_likely" : "normal_runtime_gates"];
    if (input.scopeSize === "large") hiddenConstraints.push("scope_management_required");
    if (repeatedSignals) hiddenConstraints.push("possible_context_repetition");
    if (continuityReplaySignal) hiddenConstraints.push("continuity_replay_detected");
    if (input.lastSurface && input.lastSurface !== "chat") hiddenConstraints.push(`continuity_from_${input.lastSurface}`);
    if (input.vaultScoped) hiddenConstraints.push("vault_boundary_active");

    return {
      activeContextSummary: `mode=${input.modeType}, tone=${input.tone}, urgency=${input.urgency}, lastSurface=${input.lastSurface ?? "none"}`,
      hiddenConstraints,
      situationalPriority: input.riskTier === "high" ? "safety" : input.urgency === "high" ? "speed" : "quality",
      contextAdjustedResponsePolicy: input.riskTier === "high" ? "deep_careful" : stressSignal ? "brief_action" : "balanced",
      stateModel: {
        sessionPhase,
        userStressLevel: stressSignal ? "high" : input.tone === "confused" ? "medium" : "low",
        repetitionSignals: repeatedSignals || continuityReplaySignal ? "clear" : input.scopeSize === "large" ? "possible" : "none",
        taskProgressEstimate: sessionPhase === "executing" ? 0.72 : sessionPhase === "solving" ? 0.45 : sessionPhase === "refining" ? 0.8 : 0.25
      }
    };
  }
}

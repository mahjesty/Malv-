import { Injectable } from "@nestjs/common";
import type { MemoryLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class MemoryIntelligenceService {
  analyze(input: MetaRouterInput): MemoryLayerOutput {
    const shouldUseMemory = Boolean(input.memoryHint) || input.scopeSize === "large";
    return {
      memoryDecision: shouldUseMemory ? "retrieve" : "none",
      memoryWorthiness: shouldUseMemory ? "medium" : "low",
      continuityHints: shouldUseMemory ? ["carry_forward_constraints", "retain_decision_context"] : [],
      memoryRiskNotes: ["memory_service_remains_authoritative"]
    };
  }
}

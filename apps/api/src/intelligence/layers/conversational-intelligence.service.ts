import { Injectable } from "@nestjs/common";
import type { ConversationalLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class ConversationalIntelligenceService {
  analyze(input: MetaRouterInput): ConversationalLayerOutput {
    const mode = input.modeType === "explain" ? "instruction" : input.modeType === "fix" || input.modeType === "execute" ? "qa" : "collaborative_problem_solving";
    return {
      conversationMode: mode,
      impliedNeeds: [input.modeType, input.scopeSize, input.urgency],
      followupPressure: input.urgency === "high" ? "high" : input.scopeSize === "large" ? "medium" : "low",
      collaborationStyle: mode === "collaborative_problem_solving" ? "paired" : "lead"
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { CommunicationLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class CommunicationIntelligenceService {
  analyze(input: MetaRouterInput): CommunicationLayerOutput {
    return {
      responseDepth: input.scopeSize === "large" ? "deep" : input.urgency === "high" ? "brief" : "standard",
      pacingMode: input.urgency === "high" ? "fast" : "measured",
      clarityMode: input.tone === "technical" ? "technical" : "plain",
      formattingRecommendation: input.modeType === "execute" || input.modeType === "fix" ? "stepwise" : "mixed"
    };
  }
}

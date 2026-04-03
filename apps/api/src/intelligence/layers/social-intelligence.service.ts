import { Injectable } from "@nestjs/common";
import type { MetaRouterInput, SocialLayerOutput } from "../meta-intelligence.types";

@Injectable()
export class SocialIntelligenceService {
  analyze(input: MetaRouterInput): SocialLayerOutput {
    const highNeed = input.tone === "emotional" || input.tone === "confused" || input.tone === "sensitive";
    return {
      interactionStrategy: highNeed ? "reassuring" : input.modeType === "execute" ? "direct" : "collaborative",
      empathyNeed: highNeed ? "high" : "low",
      assertivenessNeed: input.urgency === "high" ? "high" : "medium",
      reassuranceNeed: highNeed
    };
  }
}

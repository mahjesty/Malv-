import { Injectable } from "@nestjs/common";
import type { EmotionalLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class EmotionalIntelligenceService {
  analyze(input: MetaRouterInput): EmotionalLayerOutput {
    const state =
      input.tone === "sensitive" ? "sensitive" : input.tone === "confused" ? "confused" : input.tone === "frustrated" ? "frustrated" : "neutral";
    return {
      emotionalStateEstimate: state,
      confidence: state === "neutral" ? 0.62 : 0.84,
      responseStyleRecommendation: state === "sensitive" ? "careful_sensitive" : state === "confused" ? "supportive_clear" : "calm_direct",
      sensitivityHints: state === "sensitive" ? ["avoid_harsh_language", "be_precise"] : []
    };
  }
}

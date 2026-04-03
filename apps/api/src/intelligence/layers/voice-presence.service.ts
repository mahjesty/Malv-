import { Injectable } from "@nestjs/common";
import type { CallIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class VoicePresenceService {
  analyze(input: MetaRouterInput, callState?: CallIntelligenceLayerOutput): CallIntelligenceLayerOutput {
    const base = callState ?? {
      callState: "idle" as const,
      speakingMode: "listening" as const,
      interruptionSignals: [],
      liveIntentType: "question" as const,
      voiceToneStrategy: "calm" as const,
      presenceMode: "active" as const,
      callPrivacyFlags: []
    };
    const urgent = input.urgency === "high";
    const paused = /\bpause\b|\bgive me a second\b|\bone sec\b/.test((input.requestText ?? "").toLowerCase());
    const supportive = base.liveIntentType === "emotional_signal" || input.tone === "emotional" || input.tone === "sensitive";
    const direct = base.callPrivacyFlags.length > 0 || base.liveIntentType === "command";
    const voiceToneStrategy: CallIntelligenceLayerOutput["voiceToneStrategy"] = direct ? "direct" : urgent ? "urgent" : supportive ? "supportive" : "calm";
    const presenceMode: CallIntelligenceLayerOutput["presenceMode"] = paused
      ? "thinking"
      : base.callState === "interrupted"
        ? "active"
        : base.liveIntentType === "command"
          ? "executing"
          : base.speakingMode === "responding"
            ? "active"
            : "thinking";

    return {
      ...base,
      callState: paused ? "paused" : base.callState,
      speakingMode: paused ? "listening" : base.speakingMode,
      voiceToneStrategy,
      presenceMode
    };
  }
}

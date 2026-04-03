import { VoicePresenceService } from "./voice-presence.service";

describe("VoicePresenceService", () => {
  const svc = new VoicePresenceService();

  it("prefers supportive tone for emotional contexts", () => {
    const out = svc.analyze(
      {
        urgency: "low",
        riskTier: "medium",
        modeType: "analyze",
        tone: "emotional",
        scopeSize: "small",
        evidenceLevel: "partial",
        requestText: "i am overwhelmed"
      },
      {
        callState: "listening",
        speakingMode: "responding",
        interruptionSignals: [],
        liveIntentType: "emotional_signal",
        voiceToneStrategy: "calm",
        presenceMode: "active",
        callPrivacyFlags: []
      }
    );
    expect(out.voiceToneStrategy).toBe("supportive");
  });

  it("keeps stable thinking mode during pauses", () => {
    const out = svc.analyze(
      {
        urgency: "medium",
        riskTier: "medium",
        modeType: "execute",
        tone: "direct",
        scopeSize: "small",
        evidenceLevel: "partial",
        requestText: "pause, one sec"
      },
      {
        callState: "listening",
        speakingMode: "handoff",
        interruptionSignals: [],
        liveIntentType: "command",
        voiceToneStrategy: "urgent",
        presenceMode: "executing",
        callPrivacyFlags: []
      }
    );
    expect(out.callState).toBe("paused");
    expect(out.presenceMode).toBe("thinking");
  });
});

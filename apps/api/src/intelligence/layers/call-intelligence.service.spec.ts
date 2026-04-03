import { CallIntelligenceService } from "./call-intelligence.service";

describe("CallIntelligenceService", () => {
  const svc = new CallIntelligenceService();

  it("detects interrupted command during call", () => {
    const out = svc.analyze({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "small",
      evidenceLevel: "partial",
      inputMode: "voice",
      requestText: "wait stop and execute this now"
    });
    expect(out.callState).toBe("interrupted");
    expect(out.liveIntentType).toBe("command");
    expect(out.interruptionSignals).toContain("explicit_interruption");
  });

  it("flags privacy-sensitive utterance and switches to discreet posture", () => {
    const out = svc.analyze({
      urgency: "low",
      riskTier: "medium",
      modeType: "analyze",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "partial",
      inputMode: "voice",
      requestText: "my bank password is this, keep this between us"
    });
    expect(out.callPrivacyFlags).toContain("sensitive_spoken_context");
    expect(out.callPrivacyFlags).toContain("explicit_privacy_request");
    expect(out.voiceToneStrategy).toBe("direct");
    expect(out.presenceMode).toBe("discreet");
  });

  it("handles pause requests as paused state", () => {
    const out = svc.analyze({
      urgency: "low",
      riskTier: "low",
      modeType: "explain",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "strong",
      inputMode: "video",
      requestText: "pause one sec"
    });
    expect(out.callState).toBe("paused");
    expect(out.interruptionSignals).toContain("pause_request");
  });

  it("marks ambiguous spoken command and avoids execution presence", () => {
    const out = svc.analyze({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "confused",
      scopeSize: "small",
      evidenceLevel: "partial",
      inputMode: "voice",
      requestedExternalExecution: true,
      requestText: "do it now"
    });
    expect(out.callPrivacyFlags).toContain("ambiguous_spoken_target");
    expect(out.presenceMode).toBe("thinking");
  });
});

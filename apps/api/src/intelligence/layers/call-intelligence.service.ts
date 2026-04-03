import { Injectable } from "@nestjs/common";
import type { CallIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";
import { ConfidenceEngineService } from "../confidence-engine.service";

@Injectable()
export class CallIntelligenceService {
  constructor(private readonly confidenceEngine: ConfidenceEngineService = new ConfidenceEngineService()) {}

  analyze(input: MetaRouterInput): CallIntelligenceLayerOutput {
    const raw = input.requestText ?? "";
    const text = raw.toLowerCase();
    const interruptionSignals: string[] = [];
    if (/\bwait\b|\bhold on\b|\bstop\b|\binterrupt\b|\bhang on\b/.test(text)) interruptionSignals.push("explicit_interruption");
    if (/\.\.\.|--|—/.test(raw)) interruptionSignals.push("hesitation_pattern");
    if (/\bum\b|\buh\b/.test(text)) interruptionSignals.push("speech_disfluency");
    const pauseSignal = /\bpause\b|\bone sec\b|\bgive me a second\b|\bhold\b/.test(text);
    if (pauseSignal) interruptionSignals.push("pause_request");

    const commandSignal = /\bdo\b|\brun\b|\bopen\b|\bsend\b|\bstart\b|\bexecute\b|\bturn on\b|\bturn off\b|\blaunch\b/.test(text);
    const executeSignal = /\bexecute\b|\bperform\b|\bapply\b|\bdeploy\b|\btrigger\b/.test(text);
    const questionSignal = raw.includes("?") || /\bhow\b|\bwhat\b|\bwhy\b|\bcan you\b|\bcould you\b/.test(text);
    const emotionalSignal = /\banxious\b|\bstressed\b|\bworried\b|\bfrustrated\b|\boverwhelmed\b|\bpanic\b/.test(text) || input.tone === "emotional";

    const liveIntentType: CallIntelligenceLayerOutput["liveIntentType"] = commandSignal && questionSignal
      ? "mixed"
      : emotionalSignal
        ? "emotional_signal"
        : commandSignal || executeSignal
          ? "command"
          : "question";
    const ambiguousTarget = /\bthat\b|\bit\b|\bthis\b/.test(text) && !/\bfile\b|\bapp\b|\bbrowser\b|\bdesktop\b|\bphone\b|\bdevice\b/.test(text);
    const incompleteCommand = commandSignal && !/\b(open|run|send|launch|turn on|turn off)\b.+\b(on|in|with|to)\b/.test(text);

    const callPrivacyFlags: string[] = [];
    if (input.vaultScoped) callPrivacyFlags.push("vault_session_active");
    if (/\bpassword\b|\bsecret\b|\bprivate\b|\bssn\b|\bbank\b|\bpin\b|\btoken\b|\bmedical\b/.test(text)) callPrivacyFlags.push("sensitive_spoken_context");
    if (/\bdo not repeat\b|\bkeep this between us\b|\boff the record\b/.test(text)) callPrivacyFlags.push("explicit_privacy_request");
    if (ambiguousTarget) callPrivacyFlags.push("ambiguous_spoken_target");
    if (incompleteCommand) callPrivacyFlags.push("incomplete_spoken_command");

    const callState: CallIntelligenceLayerOutput["callState"] =
      interruptionSignals.includes("pause_request")
        ? "paused"
        : interruptionSignals.length > 0
          ? "interrupted"
          : input.inputMode === "voice" || input.inputMode === "video"
            ? "listening"
            : "idle";
    const speakingMode: CallIntelligenceLayerOutput["speakingMode"] =
      liveIntentType === "command" ? "handoff" : questionSignal ? "responding" : "listening";

    const confidenceEval = this.confidenceEngine.evaluate({
      inputClarity: raw.trim().length > 8 ? 0.75 : 0.4,
      contextCompleteness: input.callId || input.inputMode !== "text" ? 0.75 : 0.55,
      ambiguity: liveIntentType === "mixed" ? 0.5 : liveIntentType === "question" ? 0.35 : 0.2,
      riskLevel: callPrivacyFlags.length > 0 ? 0.8 : input.riskTier === "high" ? 0.65 : input.riskTier === "medium" ? 0.45 : 0.25,
      domain: input.requestedExternalExecution ? "execution" : "general",
      highRiskAction: Boolean(input.requestedExternalExecution || input.riskTier === "high"),
      evidenceStrength: input.evidenceLevel
    });

    return {
      callState,
      speakingMode,
      interruptionSignals,
      liveIntentType,
      voiceToneStrategy: callPrivacyFlags.length > 0 ? "direct" : input.urgency === "high" ? "urgent" : emotionalSignal ? "supportive" : "calm",
      presenceMode:
        callState === "paused"
          ? "thinking"
          : liveIntentType === "command" && !interruptionSignals.length
            ? "thinking"
            : callPrivacyFlags.length > 0
              ? "discreet"
              : "active",
      callPrivacyFlags,
      confidence: confidenceEval.score,
      fallbackSuggested: confidenceEval.level === "low"
    };
  }
}

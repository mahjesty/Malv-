import {
  VOICE_TRANSCRIPT_CLARIFY,
  VOICE_TRANSCRIPT_CONFIRM_NO,
  VOICE_TRANSCRIPT_CONFIRM_YES,
  VOICE_TRANSCRIPT_REDIRECT_OFF_TOPIC
} from "./boxed-voice-copy";
import {
  classifyActiveBoxedIntent,
  classifyTranscriptConsent,
  looksLikeOffTopicDuringConsent,
  normalizeUtterance
} from "./boxed-voice-intent";
import type { BoxedVoiceContext, BoxedVoiceResolution } from "./boxed-voice.types";

/**
 * Main entry: voice call operator path after transcript consent is resolved.
 * Deterministic, rule-based; swap for model orchestration later behind the same function signature.
 */
export function resolveBoxedVoiceResponse(transcriptText: string, ctx: BoxedVoiceContext): BoxedVoiceResolution {
  if (ctx.malvPaused || ctx.voiceFlowMode === "paused") {
    const resume = classifyActiveBoxedIntent(transcriptText);
    if (resume === "resume_voice") {
      return {
        intent: "resume_voice",
        reply:
          "Resuming the live voice channel. You can ask for session status, memory inspection, dashboard navigation, or a call summary while the full reasoning layer is still offline.",
        sideEffects: [{ type: "set_malv_paused", paused: false }],
        recordMalvLine: true
      };
    }
    return {
      intent: "fallback_unknown",
      reply:
        "This session is paused. Say resume when you want me to listen again, or use the control surface to unpause MALV.",
      sideEffects: [],
      recordMalvLine: false
    };
  }

  const intent = classifyActiveBoxedIntent(transcriptText);

  switch (intent) {
    case "greeting":
      return {
        intent,
        reply:
          "I am here and aligned with this call. You can ask me to inspect memory, open the dashboard, summarize what we have captured so far, or steer the session while the main model stack finishes wiring in.",
        sideEffects: [],
        recordMalvLine: true
      };
    case "help_capabilities":
      return {
        intent,
        reply:
          "I can help you navigate this session, inspect state, toggle transcription preferences, open the dashboard, review memory signals, or summarize the call. The deeper operator automations will activate once the full model layer is connected.",
        sideEffects: [],
        recordMalvLine: true
      };
    case "status_ping":
      return {
        intent,
        reply:
          "I am here and listening on a stable voice channel. Ask for memory, dashboard, a concise recap, or pause the flow if you need a moment of silence.",
        sideEffects: [],
        recordMalvLine: true
      };
    case "open_dashboard":
      return {
        intent,
        reply:
          "Opening the dashboard path on your client when that route is wired. Until then, you can continue in voice and I will keep session context warm.",
        sideEffects: [],
        recordMalvLine: true,
        uiAction: { action: "open_dashboard" }
      };
    case "check_memory":
      return {
        intent,
        reply:
          "Memory inspection is running in a lightweight, deterministic mode. I see structured session markers and call state; richer recall will arrive with the connected reasoning backend.",
        sideEffects: [],
        recordMalvLine: true,
        uiAction: { action: "check_memory" }
      };
    case "summarize_call":
      return {
        intent,
        reply: ctx.callTranscriptEnabled
          ? "Here is a concise read of the transcript so far: the session is live, consent and controls are explicit, and you are steering by voice. I will add sharper narrative detail once the full model is online."
          : "Transcription is off for this call, so I am summarizing from session telemetry only: the link is active, controls are available, and you are operating in boxed voice mode until the main model connects.",
        sideEffects: [],
        recordMalvLine: true
      };
    case "pause_voice":
      return {
        intent,
        reply:
          "Pausing my side of the voice loop. Say resume when you want me listening again, or unpause from the call controls.",
        sideEffects: [{ type: "set_malv_paused", paused: true }],
        recordMalvLine: true
      };
    case "resume_voice":
      return {
        intent,
        reply: "The voice channel is already active. Ask for status, memory, dashboard navigation, or a call summary.",
        sideEffects: [],
        recordMalvLine: true
      };
    default:
      return {
        intent: "fallback_unknown",
        reply:
          "I can help with a focused set of voice actions while the main reasoning model is still being connected. You can ask about transcription, session status, memory, dashboard navigation, or a call summary.",
        sideEffects: [],
        recordMalvLine: true
      };
  }
}

export type TranscriptConsentTurnResult = {
  intent: BoxedVoiceResolution["intent"];
  reply: string;
  consent: "yes" | "no" | "clarify" | "redirect";
  enableTranscript: boolean;
  advanceToActive: boolean;
};

/**
 * Spoken consent gate: classify yes / no / clarify / redirect before general commands run.
 */
export function resolveTranscriptConsentTurn(transcriptText: string): TranscriptConsentTurnResult {
  const bucket = classifyTranscriptConsent(transcriptText);
  if (bucket === "transcript_consent_yes") {
    return {
      intent: "transcript_consent_yes",
      reply: VOICE_TRANSCRIPT_CONFIRM_YES,
      consent: "yes",
      enableTranscript: true,
      advanceToActive: true
    };
  }
  if (bucket === "transcript_consent_no") {
    return {
      intent: "transcript_consent_no",
      reply: VOICE_TRANSCRIPT_CONFIRM_NO,
      consent: "no",
      enableTranscript: false,
      advanceToActive: true
    };
  }
  const n = normalizeUtterance(transcriptText);
  if (n && looksLikeOffTopicDuringConsent(n)) {
    return {
      intent: "transcript_consent_redirect",
      reply: VOICE_TRANSCRIPT_REDIRECT_OFF_TOPIC,
      consent: "redirect",
      enableTranscript: false,
      advanceToActive: false
    };
  }
  return {
    intent: "transcript_consent_unknown",
    reply: VOICE_TRANSCRIPT_CLARIFY,
    consent: "clarify",
    enableTranscript: false,
    advanceToActive: false
  };
}

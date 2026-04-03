import type { VoiceFlowMode } from "../../calls/call-runtime.types";

export type TranscriptConsentClass = "transcript_consent_yes" | "transcript_consent_no" | "unknown";

export type BoxedVoiceIntent =
  | "voice_onboarding_transcript_question"
  | "transcript_consent_yes"
  | "transcript_consent_no"
  | "transcript_consent_unknown"
  | "transcript_consent_redirect"
  | "greeting"
  | "help_capabilities"
  | "status_ping"
  | "open_dashboard"
  | "check_memory"
  | "summarize_call"
  | "pause_voice"
  | "resume_voice"
  | "fallback_unknown";

export type BoxedSideEffect = { type: "set_malv_paused"; paused: boolean };

export type BoxedVoiceResolution = {
  intent: BoxedVoiceIntent;
  reply: string;
  sideEffects: BoxedSideEffect[];
  /** When true, persist the assistant line to the call transcript (if transcript enabled after effects). */
  recordMalvLine: boolean;
  uiAction?: { action: "open_dashboard" | "check_memory" };
};

export type BoxedVoiceContext = {
  voiceFlowMode: VoiceFlowMode;
  callTranscriptEnabled: boolean;
  malvPaused: boolean;
};

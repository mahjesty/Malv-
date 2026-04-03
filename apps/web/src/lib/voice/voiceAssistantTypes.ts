import type { MalvSocket } from "../realtime/socket";
import type { VoiceTestTriggerResponse } from "../api/voiceTestTrigger";

/**
 * High-level phases for composer-integrated voice input (not a call UI).
 * Reply TTS playback state lives in `malvSpeechPlayback` / `VoicePlaybackControls` (play/pause/stop).
 */
export type VoiceAssistantPhase =
  | "idle"
  | "arming"
  | "listening"
  | "speech_detected"
  | "waiting_for_pause"
  | "finalizing"
  | "transcribing"
  | "committed"
  | "error";

export type VoiceRoute = "chat" | "operator";

export type MicInteractionMode = "toggle" | "press" | "continuous";

/** After composer STT finalizes on the chat route: keep text for editing vs send immediately. */
export type VoiceSubmitMode = "manual" | "auto";

export type VoiceAssistantContextHint = {
  page?: string | null;
  selectedFile?: string | null;
  activeConversationId?: string | null;
  activeTaskId?: string | null;
  issueId?: string | null;
  workspacePath?: string | null;
  workspaceId?: string | null;
  currentSymbol?: string | null;
  currentSpanStart?: number | null;
  currentSpanEnd?: number | null;
};

export type UseVoiceAssistantOptions = {
  getSocket: () => MalvSocket | null | undefined;
  /** When set (e.g. voice call page), STT routes as `operator` and tags audio with this call session. */
  getCallSessionId?: () => string | null;
  /** Conversation id for operator context hints (optional). */
  conversationId?: string | null;
  buildContextHint?: () => VoiceAssistantContextHint | null;
  /** Tap-to-toggle only: stop after this much silence once speech has been detected (ms). */
  silenceAutoStopMs?: number;
  /** Minimum time from first detected speech until silence auto-stop can finalize (ms). */
  minSpeechMs?: number;
  /** Wait after stopping capture before committing stable transcript (ms). */
  finalStabilizeMs?: number;
  /** Single source of truth (e.g. settings store). */
  getVoiceRoute: () => VoiceRoute;
  getMicInteraction: () => MicInteractionMode;
  /**
   * Operator voice call only (`getMicInteraction() === "continuous"`).
   * When true, the hook keeps the mic pipeline running: utterances end on silence (same as toggle),
   * then automatically starts the next capture. No mic button press required.
   */
  getContinuousOperatorSession?: () => boolean;
  getVoiceSubmitMode: () => VoiceSubmitMode;
  /** When STT finalizes on the chat route and submit mode is auto — send once with this text (composer may still be busy). */
  onAutoSubmitFromVoice?: (finalText: string) => void;
  /** Apply final STT text into the composer (chat route). */
  onComposerTranscript: (text: string, mode: "replace" | "append") => void;
  getComposerText: () => string;
  /** Operator path: server dispatched workflow (optional UI feedback). */
  onOperatorVoiceEvent?: (ev: { kind: "response" | "operator_started" | "error"; payload: unknown }) => void;
  /**
   * Operator path only: fired immediately after `voice:stop` is sent (before STT completes).
   * Use for watchdog timers / debug (operator mode does not receive `voice:final`).
   */
  onOperatorVoiceStopSent?: (args: { sessionId: string }) => void;

  /**
   * Voice call page: send each finalized utterance as one HTTP multipart request (`POST /v1/voice/test-trigger`)
   * instead of `voice:chunk` + `voice:stop`. Canned test audio returns in the JSON body (no WebRTC).
   */
  operatorUtteranceTransport?: "socket" | "http_test_trigger";
  /** Bearer for `http_test_trigger` (refresh handled inside `postVoiceTestTrigger`). */
  resolveVoiceTestAccessToken?: () => string | undefined | Promise<string | undefined>;
  /** Called when HTTP voice test pipeline returns (success or STT failure payload). */
  onOperatorVoiceTestHttpResult?: (result: VoiceTestTriggerResponse) => void;
};

/** Composer + mic wiring surface (returned by `useVoiceAssistant`). */
export type VoiceAssistantChrome = {
  phase: VoiceAssistantPhase;
  partialTranscript: string;
  stableTranscript: string;
  committedTranscript: string;
  errorMessage: string | null;
  /** Smoothed 0–1 mic input level while capturing (from RMS); 0 when idle. */
  inputAudioLevel: number;
  /** Temporary UI disable (e.g. fatal server voice error / cooldown). */
  micDisabled: boolean;
  micInteraction: MicInteractionMode;
  occupiesComposer: boolean;
  pressDown: boolean;
  cancelRecording: () => void;
  retryFromError: () => void;
  onMicClickToggle: () => void;
  onMicPointerDown: () => void;
  onMicPointerUp: () => void;
  onMicPointerLeave: () => void;
};

export type CallSessionPhase = "pre-call" | "active" | "ended";

/** 1:1 operator vs collaboration-style session (group: tighter avatar / presence policy). */
export type CallParticipationScope = "direct" | "group";

/** High-level voice UX mode for boxed / future model orchestration (voice calls). */
export type VoiceFlowMode = "onboarding" | "awaiting_transcript_consent" | "active" | "paused";

export type CallConnectionState = "healthy" | "weak" | "unstable" | "reconnecting";

export type CallVoiceState = "idle" | "listening" | "thinking" | "speaking" | "muted";

export type CallTranscriptStreamingStatus = "idle" | "capturing" | "partial" | "finalizing" | "final";

export type CallOperatorActivityStatus = "idle" | "awaiting_user" | "processing" | "responding" | "running_workflow" | "paused" | "error";

/** Stored in `call_sessions.recap_json`; optional fields merged by PATCH /recap. */
export type CallRecapPayload = {
  summary?: string;
  actionItems?: string[];
  decisions?: string[];
  unresolvedQuestions?: string[];
  suggestedFollowUps?: string[];
  source?: "auto" | "manual";
  /** Epoch ms when recap was last written. */
  decidedAt?: number;
};

export type CallRuntimeSnapshot = {
  callSessionId: string;
  kind: "voice" | "video";
  status: "active" | "ended";
  phase: CallSessionPhase;
  connectionState: CallConnectionState;
  voiceState: CallVoiceState;
  micMuted: boolean;
  malvPaused: boolean;
  /** Voice session mode (onboarding, consent gate, active command surface, paused). */
  voiceFlowMode: VoiceFlowMode;
  /** When true, user/malv lines are persisted to the call transcript stream. */
  callTranscriptEnabled: boolean;
  /** Explicit user consent gate for 1:1 camera interpretation support. */
  cameraAssistEnabled: boolean;
  callStartedAt: number;
  callEndedAt: number | null;
  lastHeartbeatAt: number | null;
  transcriptStreamingStatus: CallTranscriptStreamingStatus;
  operatorActivityStatus: CallOperatorActivityStatus;
  reconnectCount: number;
  updatedAt: number;
  /** Linked workspace conversation id, if any. */
  conversationId: string | null;
  /** Post-call recap when present (also on ended sessions for continuity). */
  recap: CallRecapPayload | null;
  /** `group` = blueprint stability mode (avatar / character switching restricted in UI). */
  participationScope: CallParticipationScope;
};

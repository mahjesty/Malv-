/** Mirrors API VoicePlaybackInstruction (wire subset). */
export type VoicePlaybackInstructionPayload = {
  mode: "local_asset" | "generated_audio" | "rtc_track";
  assetKey?: string;
  rtcSessionId?: string | null;
};

export type VoiceCallResponsePayload = {
  response?: string;
  playbackMessageId?: string;
  callSessionId?: string | null;
  source?: string;
  intent?: string;
  playbackInstruction?: VoicePlaybackInstructionPayload;
};

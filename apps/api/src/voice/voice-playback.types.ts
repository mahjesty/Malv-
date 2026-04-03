/**
 * Assistant audio delivery modes. Extend as real TTS / WebRTC land without changing operator intent logic.
 */
export type VoicePlaybackMode = "local_asset" | "generated_audio" | "rtc_track";

export type VoicePlaybackInstruction = {
  mode: VoicePlaybackMode;
  /** Frontend maps keys to static URLs or bundled assets (e.g. `malv_voice_test`). */
  assetKey?: string;
  /** Reserved for future WebRTC assistant track binding. */
  rtcSessionId?: string | null;
};

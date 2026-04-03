import { Injectable, Logger } from "@nestjs/common";
import { VoicePlaybackService } from "./voice-playback.service";

/**
 * Normalization + intent triggers for canned voice flows (no model).
 */
@Injectable()
export class VoiceTriggerService {
  private readonly logger = new Logger(VoiceTriggerService.name);

  /** Same normalization as operator STT final payload for consistency. */
  normalizeTranscript(transcript: string): string {
    return transcript.toLowerCase().replace(/\s+/g, " ").trim();
  }

  matchMalvTestVoice(transcript: string): { normalizedTranscript: string; matched: boolean } {
    const normalizedTranscript = this.normalizeTranscript(transcript);
    const matched = VoicePlaybackService.matchesVoicePipelineTestTrigger(transcript);
    this.logger.log(
      `[malv-voice-test] trigger normalized=${JSON.stringify(normalizedTranscript)} matched=${matched}`
    );
    return { normalizedTranscript, matched };
  }
}

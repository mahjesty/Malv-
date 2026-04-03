import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { CallsService } from "../calls/calls.service";
import { LocalTtsService } from "./local-tts/local-tts.service";
import type { VoicePlaybackInstruction, VoicePlaybackMode } from "./voice-playback.types";

/** Canned caption shown in UI / transcript; audible asset is a local test tone until replaced with a recorded line. */
export const VOICE_PIPELINE_TEST_REPLY =
  "Hello, this is MALV voice test. Audio pipeline is working.";

/** Static path served by web `public/` — must match frontend listener + asset file. */
export const VOICE_TEST_PLAYBACK_ASSET_URL = "/test-audio/malv-voice-test.wav";

@Injectable()
export class VoicePlaybackService {
  private readonly logger = new Logger(VoicePlaybackService.name);

  constructor(
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly calls: CallsService,
    private readonly localTts: LocalTtsService
  ) {}

  /** Case-insensitive substring match on normalized whitespace. */
  static matchesVoicePipelineTestTrigger(transcriptText: string): boolean {
    const n = transcriptText.toLowerCase().replace(/\s+/g, " ").trim();
    return n.includes("malv test voice");
  }

  /**
   * Canned voice-test reply audio: prefer Piper/local TTS when configured; else static WAV URL (served by web `public/`).
   * For future: add `rtc_assistant_track` alongside `local_asset` | `local_tts`.
   */
  async resolveVoiceTestAssistantOutput(): Promise<{
    replyText: string;
    audioUrl: string | null;
    audioBase64: string | null;
    audioMimeType: string | null;
    playbackMode: "local_asset" | "local_tts";
  }> {
    const replyText = VOICE_PIPELINE_TEST_REPLY;
    try {
      const { wavBytes } = await this.localTts.synthesize({ text: replyText });
      this.logger.log("[malv-voice-test] playback_mode=local_tts bytes=" + wavBytes.length);
      return {
        replyText,
        audioUrl: null,
        audioBase64: wavBytes.toString("base64"),
        audioMimeType: "audio/wav",
        playbackMode: "local_tts"
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[malv-voice-test] playback_fallback=local_asset reason=${msg}`);
      return {
        replyText,
        audioUrl: VOICE_TEST_PLAYBACK_ASSET_URL,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: "local_asset"
      };
    }
  }

  /**
   * Emit realtime instructions for canned assistant playback (no model inference).
   * Isolated from Beast / boxed resolvers so it can be swapped for Piper TTS or rtc_track later.
   */
  async playCannedReply(args: {
    userId: string;
    callSessionId: string;
    text: string;
    mode: VoicePlaybackMode;
    assetKey: string;
    triggerTranscript: string;
  }): Promise<void> {
    const session = await this.calls.assertUserOwnsCall({
      userId: args.userId,
      callSessionId: args.callSessionId
    });

    const playbackMessageId = `canned-${args.mode}-${args.callSessionId}-${Date.now()}`;
    const playbackInstruction: VoicePlaybackInstruction = {
      mode: args.mode,
      assetKey: args.assetKey
    };

    this.logger.log(
      JSON.stringify({
        msg: "voice_playback_canned_emit",
        phase: "canned_reply_created",
        userId: args.userId,
        callSessionId: args.callSessionId,
        mode: args.mode,
        assetKey: args.assetKey,
        playbackMessageId,
        triggerLen: args.triggerTranscript.length,
        triggerSnippet: args.triggerTranscript.slice(0, 160)
      })
    );

    if (session.callTranscriptEnabled && args.text.trim()) {
      await this.calls.recordMalvTranscript({
        userId: args.userId,
        callSessionId: args.callSessionId,
        content: args.text
      });
    } else if (args.text.trim()) {
      await this.calls.markPlaybackState({
        userId: args.userId,
        callSessionId: args.callSessionId,
        isSpeaking: true,
        expectedPlaybackMs: Math.max(4500, this.calls.estimateTtsPlaybackMs(args.text))
      });
    }

    const responsePayload = {
      intent: "voice_pipeline_test",
      response: args.text,
      callSessionId: args.callSessionId,
      source: "canned_voice_test",
      playbackMessageId,
      playbackInstruction,
      voiceFlowMode: session.voiceFlowMode,
      callTranscriptEnabled: session.callTranscriptEnabled
    };

    this.realtime.emitToUser(args.userId, "voice:response", responsePayload);

    this.logger.log(
      JSON.stringify({
        msg: "voice_playback_canned_emit",
        phase: "voice_response_event",
        userId: args.userId,
        callSessionId: args.callSessionId,
        playbackMessageId,
        hasPlaybackInstruction: true
      })
    );

    this.realtime.emitToUser(args.userId, "voice:playback", {
      callSessionId: args.callSessionId,
      playbackMessageId,
      kind: "canned",
      mode: args.mode,
      assetKey: args.assetKey,
      responseText: args.text
    });

    this.logger.log(
      JSON.stringify({
        msg: "voice_playback_canned_emit",
        phase: "voice_playback_diag_event",
        userId: args.userId,
        callSessionId: args.callSessionId,
        playbackMessageId
      })
    );
  }

  async emitVoicePipelineTest(args: {
    userId: string;
    callSessionId: string;
    triggerTranscript: string;
  }): Promise<void> {
    this.logger.log(
      JSON.stringify({
        msg: "voice_pipeline_test_trigger_detected",
        userId: args.userId,
        callSessionId: args.callSessionId,
        transcriptSnippet: args.triggerTranscript.slice(0, 200)
      })
    );

    await this.playCannedReply({
      userId: args.userId,
      callSessionId: args.callSessionId,
      text: VOICE_PIPELINE_TEST_REPLY,
      mode: "local_asset",
      assetKey: "malv_voice_test",
      triggerTranscript: args.triggerTranscript
    });

    this.emitVoiceTestPlaybackSocket(args.userId, args.callSessionId);
  }

  /** Dedicated socket for assistant local playback (no WebRTC); client listens and calls `Audio.play()`. */
  private emitVoiceTestPlaybackSocket(userId: string, callSessionId: string) {
    const assetUrl = VOICE_TEST_PLAYBACK_ASSET_URL;
    const payload = {
      callSessionId,
      assetUrl,
      text: VOICE_PIPELINE_TEST_REPLY
    };
    this.logger.log(
      JSON.stringify({
        msg: "voice_test_playback_socket_emit",
        userId,
        callSessionId,
        assetUrl,
        phase: "socket_event_queued"
      })
    );
    // eslint-disable-next-line no-console
    console.info("[malv-voice-debug] voice:test_playback emit (server)", payload);
    this.realtime.emitToUser(userId, "voice:test_playback", payload);
    this.logger.log(
      JSON.stringify({
        msg: "voice_test_playback_socket_emit",
        userId,
        callSessionId,
        phase: "socket_event_dispatched"
      })
    );
  }
}

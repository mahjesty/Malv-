import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SpeechToTextService } from "./speech-to-text.service";
import { VoiceTriggerService } from "./voice-trigger.service";
import { VoicePlaybackService } from "./voice-playback.service";
import { VoiceOperatorService } from "./voice-operator.service";
import { CallsService } from "../calls/calls.service";

function normalizeLoose(text: string) {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isAnnotationChunk(content: string) {
  const normalized = normalizeLoose(content);
  if (!normalized) return false;
  const ignoreWords = new Set(["a", "an", "the", "in", "on", "of", "to", "and", "with", "is", "are", "was", "were"]);
  const markerWords = new Set([
    "cough",
    "coughing",
    "applause",
    "music",
    "laughter",
    "laughing",
    "noise",
    "noises",
    "background",
    "silence",
    "breathing",
    "sneeze",
    "sneezing",
    "speaks",
    "speaking",
    "foreign",
    "language",
    "inaudible",
    "unintelligible",
    "static"
  ]);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return false;
  return words.every((w) => ignoreWords.has(w) || markerWords.has(w));
}

function isAnnotationOnlyTranscript(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const chunks = trimmed.match(/(\([^)]+\)|\[[^\]]+\])/g) ?? [];
  if (chunks.length === 0) return false;
  const withoutChunks = trimmed.replace(/(\([^)]+\)|\[[^\]]+\])/g, " ").replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  if (withoutChunks.length > 0) return false;
  return chunks.every((chunk) => isAnnotationChunk(chunk.slice(1, -1)));
}

export type VoiceTestTriggerHttpResult = {
  ok: boolean;
  transcript: string;
  normalizedTranscript: string;
  matched: boolean;
  replyText: string;
  audioUrl: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  playbackMode: "local_asset" | "local_tts" | null;
  error: string | null;
  sttErrorCode: string | null;
  sttRejectedReason: string | null;
  /** Set when `callSessionId` was provided, trigger did not match, and operator dispatch failed. */
  operatorDispatchError: string | null;
};

const MIN_AUDIO_BYTES = 800;

@Injectable()
export class VoiceTestTriggerService {
  private readonly logger = new Logger(VoiceTestTriggerService.name);

  constructor(
    private readonly speechToText: SpeechToTextService,
    private readonly voiceTrigger: VoiceTriggerService,
    private readonly voicePlayback: VoicePlaybackService,
    private readonly voiceOperator: VoiceOperatorService,
    private readonly calls: CallsService
  ) {}

  async run(args: {
    userId: string;
    audioBytes: Buffer;
    mimeType: string;
    callSessionId?: string | null;
  }): Promise<VoiceTestTriggerHttpResult> {
    const { userId, audioBytes, mimeType, callSessionId } = args;
    const sessionId = `http-voice-test-${randomUUID()}`;

    this.logger.log(
      `[malv-voice-test] audio_received userId=${userId} sessionId=${sessionId} bytes=${audioBytes.length} mime=${mimeType}`
    );

    if (!audioBytes.length || audioBytes.length < MIN_AUDIO_BYTES) {
      this.logger.warn(`[malv-voice-test] audio_rejected_too_small bytes=${audioBytes.length}`);
      return {
        ok: false,
        transcript: "",
        normalizedTranscript: "",
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: "empty_audio",
        sttErrorCode: null,
        sttRejectedReason: "too_short",
        operatorDispatchError: null
      };
    }

    if (mimeType && !(mimeType.includes("webm") || mimeType.includes("ogg"))) {
      this.logger.warn(`[malv-voice-test] audio_rejected_mime mime=${mimeType}`);
      return {
        ok: false,
        transcript: "",
        normalizedTranscript: "",
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: "unsupported_mime",
        sttErrorCode: null,
        sttRejectedReason: "unsupported_mime",
        operatorDispatchError: null
      };
    }

    const stt = await this.speechToText.transcribeUtterance({
      audioBytes,
      mimeType: mimeType || "audio/webm",
      sessionId,
      userId
    });

    if (!stt.ok) {
      return {
        ok: false,
        transcript: "",
        normalizedTranscript: "",
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: stt.errorCode,
        sttErrorCode: stt.errorCode,
        sttRejectedReason: null,
        operatorDispatchError: null
      };
    }

    const text = stt.text;
    if (!text) {
      this.logger.log(`[malv-voice-test] stt_empty_no_speech sessionId=${sessionId}`);
      return {
        ok: true,
        transcript: "",
        normalizedTranscript: "",
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: null,
        sttErrorCode: "STT_EMPTY_RESULT",
        sttRejectedReason: "no_speech",
        operatorDispatchError: null
      };
    }

    if (isAnnotationOnlyTranscript(text)) {
      this.logger.warn(`[malv-voice-test] stt_rejected_annotation_only sessionId=${sessionId}`);
      const normalizedTranscript = this.voiceTrigger.normalizeTranscript(text);
      return {
        ok: true,
        transcript: text,
        normalizedTranscript,
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: null,
        sttErrorCode: "STT_ANNOTATION_ONLY",
        sttRejectedReason: "annotation_only",
        operatorDispatchError: null
      };
    }

    const { normalizedTranscript, matched } = this.voiceTrigger.matchMalvTestVoice(text);

    if (!matched) {
      let operatorDispatchError: string | null = null;
      if (callSessionId?.trim()) {
        try {
          await this.voiceOperator.handleVoiceUtterance({
            userId,
            callSessionId: callSessionId.trim(),
            transcriptText: text,
            isFinal: true,
            contextHint: null,
            sessionTarget: "operator",
            sessionId
          });
        } catch (e) {
          operatorDispatchError = e instanceof Error ? e.message : String(e);
          this.logger.error(
            `[malv-voice-test] operator_dispatch_failed sessionId=${sessionId}`,
            e instanceof Error ? e.stack : e
          );
        }
      }
      return {
        ok: true,
        transcript: text,
        normalizedTranscript,
        matched: false,
        replyText: "",
        audioUrl: null,
        audioBase64: null,
        audioMimeType: null,
        playbackMode: null,
        error: null,
        sttErrorCode: null,
        sttRejectedReason: null,
        operatorDispatchError
      };
    }

    if (callSessionId?.trim()) {
      await this.calls.recordOperatorUserUtteranceIfEnabled({
        userId,
        callSessionId: callSessionId.trim(),
        content: text
      });
    }

    const out = await this.voicePlayback.resolveVoiceTestAssistantOutput();
    return {
      ok: true,
      transcript: text,
      normalizedTranscript,
      matched: true,
      replyText: out.replyText,
      audioUrl: out.audioUrl,
      audioBase64: out.audioBase64,
      audioMimeType: out.audioMimeType,
      playbackMode: out.playbackMode,
      error: null,
      sttErrorCode: null,
      sttRejectedReason: null,
      operatorDispatchError: null
    };
  }
}

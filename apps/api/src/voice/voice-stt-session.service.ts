import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { VoiceOperatorService, type VoiceSessionTarget } from "./voice-operator.service";
import { VoicePlaybackService } from "./voice-playback.service";
import { LocalSttService } from "./local-stt/local-stt.service";

function formatErrorForLog(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (err && typeof err === "object") return err as Record<string, unknown>;
  return { message: String(err) };
}

function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function pipelineStageForCode(code: string): string {
  switch (code) {
    case "FFMPEG_NOT_FOUND":
    case "AUDIO_PREPROCESS_FAILED":
      return "audio_preprocess";
    case "STT_UNAVAILABLE":
    case "STT_REQUEST_FAILED":
    case "STT_EMPTY_RESULT":
    case "STT_TIMEOUT":
    case "STT_PROCESS_EXIT_NONZERO":
    case "STT_INPUT_FILE_MISSING":
    case "STT_PARSE_FAILED":
      return "stt";
    case "TRANSCRIPT_EMIT_FAILED":
      return "transcript_emit";
    case "MODEL_UNAVAILABLE":
    case "MODEL_REQUEST_FAILED":
      return "model_dispatch";
    default:
      return "stt";
  }
}

function userMessageForPipelineCode(code: string, fallback: string): string {
  switch (code) {
    case "FFMPEG_NOT_FOUND":
      return "Voice processing unavailable on server";
    case "AUDIO_PREPROCESS_FAILED":
      return "Voice audio preprocessing failed on server";
    case "STT_UNAVAILABLE":
      return "Speech-to-text is not configured on server";
    case "STT_REQUEST_FAILED":
      return "Speech-to-text failed";
    case "STT_TIMEOUT":
      return "Speech-to-text timed out (audio may be long or server is busy)";
    case "STT_PROCESS_EXIT_NONZERO":
      return "Speech-to-text engine failed";
    case "STT_INPUT_FILE_MISSING":
      return "Speech-to-text could not read processed audio";
    case "STT_PARSE_FAILED":
      return "Speech-to-text returned an unreadable result";
    case "STT_EMPTY_RESULT":
      return "No speech detected in the recording";
    case "STT_ANNOTATION_ONLY":
      return "I could not catch clear speech. Please try again.";
    case "TRANSCRIPT_EMIT_FAILED":
      return "Failed to deliver transcript";
    case "MODEL_UNAVAILABLE":
      return "Assistant model is unavailable";
    case "MODEL_REQUEST_FAILED":
      return "Assistant request failed";
    default:
      return fallback;
  }
}

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

type VoiceChunkPayload = {
  sessionId: string;
  sessionTarget: VoiceSessionTarget;
  seq: number;
  mimeType: string;
  audioB64: string;
};

type VoiceSession = {
  userId: string;
  sessionId: string;
  sessionTarget: VoiceSessionTarget;
  callSessionId?: string | null;
  startedAt: number;
  lastSeq: number;
  mimeType: string;
  chunks: Buffer[];
  totalBytes: number;
  stopped: boolean;
};

@Injectable()
export class VoiceSttSessionService {
  private readonly logger = new Logger(VoiceSttSessionService.name);
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly voiceDebug = process.env.MALV_VOICE_DEBUG === "true" || process.env.NODE_ENV !== "production";

  private sttLog(event: string, data: Record<string, unknown>) {
    if (!this.voiceDebug) return;
    // eslint-disable-next-line no-console
    console.debug(`[malv-voice-stt] ${event}`, data);
  }

  private sttError(event: string, data: Record<string, unknown>, err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[malv-voice-stt] ${event}`, { ...data, error: formatErrorForLog(err) });
  }

  constructor(
    private readonly stt: LocalSttService,
    private readonly voiceOperator: VoiceOperatorService,
    private readonly moduleRef: ModuleRef
  ) {}

  private getRealtimeGateway(): RealtimeGateway {
    // Lazy resolution prevents a constructor-level circular dependency:
    // RealtimeGateway -> VoiceSttSessionService -> RealtimeGateway.
    return this.moduleRef.get(RealtimeGateway, { strict: false }) as RealtimeGateway;
  }

  private key(userId: string, sessionId: string) {
    return `${userId}:${sessionId}`;
  }

  startSession(args: { userId: string; sessionId: string; sessionTarget: VoiceSessionTarget; callSessionId?: string | null }) {
    if (!args.sessionId) throw new BadRequestException("sessionId required");
    const k = this.key(args.userId, args.sessionId);
    const existing = this.sessions.get(k);
    if (existing && !existing.stopped) {
      // Idempotent start.
      return;
    }
    this.sessions.set(k, {
      userId: args.userId,
      sessionId: args.sessionId,
      sessionTarget: args.sessionTarget,
      callSessionId: args.callSessionId ?? null,
      startedAt: Date.now(),
      lastSeq: -1,
      mimeType: "audio/webm",
      chunks: [],
      totalBytes: 0,
      stopped: false
    });

    if (this.voiceDebug) {
      this.logger.debug(`voice session started userId=${args.userId} sessionId=${args.sessionId} target=${args.sessionTarget}`);
    }
    this.logger.log(`[malv-voice] session start sessionId=${args.sessionId} target=${args.sessionTarget}`);
  }

  getCallSessionIdForSession(args: { userId: string; sessionId: string }) {
    const s = this.sessions.get(this.key(args.userId, args.sessionId));
    return s?.callSessionId ?? null;
  }

  ingestChunk(args: { userId: string; payload: VoiceChunkPayload }) {
    const { payload } = args;
    if (!payload.sessionId) throw new BadRequestException("sessionId required");
    const k = this.key(args.userId, payload.sessionId);
    const s = this.sessions.get(k);
    if (!s) throw new BadRequestException("Unknown voice session");
    if (s.stopped) throw new BadRequestException("Session already stopped");

    if (payload.seq <= s.lastSeq) {
      // Ignore out-of-order/duplicate chunks; client retries can cause this.
      return;
    }
    s.lastSeq = payload.seq;
    s.mimeType = payload.mimeType || s.mimeType;

    const buf = Buffer.from(payload.audioB64, "base64");
    if (!buf.length) return;
    const maxChunkBytes = Number(process.env.VOICE_STT_MAX_CHUNK_BYTES ?? 1_048_576);
    if (buf.length > maxChunkBytes) {
      throw new BadRequestException("Voice chunk too large.");
    }
    const maxChunks = Number(process.env.VOICE_STT_MAX_CHUNKS ?? 600);
    if (s.chunks.length >= maxChunks) {
      throw new BadRequestException("Voice session exceeded chunk limit.");
    }
    const maxSessionBytes = Number(process.env.VOICE_STT_MAX_SESSION_BYTES ?? 26_214_400);
    if (s.totalBytes + buf.length > maxSessionBytes) {
      throw new BadRequestException("Voice session exceeded max size.");
    }
    s.chunks.push(buf);
    s.totalBytes += buf.length;

    if (payload.seq === 0 || payload.seq % 5 === 0) {
      this.logger.log(`[malv-voice] chunk received sessionId=${payload.sessionId} seq=${payload.seq} bytes=${buf.length}`);
    } else if (this.voiceDebug && payload.seq % 3 === 0) {
      this.logger.debug(
        `voice chunk ingested userId=${args.userId} sessionId=${payload.sessionId} seq=${payload.seq} mimeType=${s.mimeType} bytes=${buf.length}`
      );
    }
  }

  async stopAndFinalize(args: { userId: string; sessionId: string; reason?: string | null; recordingDurationMs?: number | null }) {
    if (!args.sessionId) throw new BadRequestException("sessionId required");
    const k = this.key(args.userId, args.sessionId);
    const s = this.sessions.get(k);
    if (!s) throw new BadRequestException("Unknown voice session");
    if (s.stopped) return { ok: true, alreadyStopped: true };
    s.stopped = true;

    const requestReceivedAtMs = Date.now();
    const totalBytes = s.totalBytes;
    const chunkCount = s.chunks.length;

    this.sttLog("voice_finalize_request_received", {
      userId: args.userId,
      sessionId: args.sessionId,
      sessionTarget: s.sessionTarget,
      reason: args.reason ?? null,
      mimeType: s.mimeType,
      chunkCount,
      totalBytes,
      requestReceivedAtMs
    });

    // Required instrumentation for one end-to-end debugging run.
    // eslint-disable-next-line no-console
    console.debug("[voice_api] finalize begin", { sessionId: args.sessionId, sessionTarget: s.sessionTarget });

    const MIN_FINAL_AUDIO_BYTES = 800;
    if (!totalBytes || totalBytes < MIN_FINAL_AUDIO_BYTES) {
      this.sttLog("voice_finalize_audio_rejected_too_small", {
        userId: args.userId,
        sessionId: args.sessionId,
        reason: args.reason ?? null,
        mimeType: s.mimeType,
        chunkCount,
        totalBytes
      });
      // eslint-disable-next-line no-console
      console.error("[voice_api] error", { sessionId: args.sessionId, sessionTarget: s.sessionTarget, stage: "audio_validated", error: "empty_audio" });
      this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
        stage: "validation",
        message: "No audio captured (too short/empty). Try again and speak a bit longer.",
        code: "empty_audio",
        sessionId: args.sessionId
      });
      this.sessions.delete(k);
      return { ok: false, error: "empty_audio" };
    }

    if (s.mimeType && !(s.mimeType.includes("webm") || s.mimeType.includes("ogg"))) {
      const err = new Error(
        `Unsupported audio mimeType for local STT: ${s.mimeType} (supported: audio/webm, audio/ogg)`
      );
      this.sttError("voice_finalize_mime_rejected", { userId: args.userId, sessionId: args.sessionId, mimeType: s.mimeType }, err);
      // eslint-disable-next-line no-console
      console.error("[voice_api] error", { sessionId: args.sessionId, sessionTarget: s.sessionTarget, stage: "audio_validated", error: "unsupported_mime", mimeType: s.mimeType });
      this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
        stage: "validation",
        message: `Unsupported microphone recording format: ${s.mimeType}`,
        code: "unsupported_mime",
        sessionId: args.sessionId,
        debug: { mimeType: s.mimeType, error: formatErrorForLog(err) }
      });
      this.sessions.delete(k);
      return { ok: false, error: "unsupported_mime" };
    }

    // eslint-disable-next-line no-console
    console.debug("[voice_api] audio validated", { sessionId: args.sessionId, mimeType: s.mimeType, byteSize: totalBytes });

    const audioBytes = Buffer.concat(s.chunks);
    try {
      this.sttLog("voice_finalize_dispatching_stt", {
        userId: args.userId,
        sessionId: args.sessionId,
        reason: args.reason ?? null,
        chunkCount,
        totalBytes,
        mimeType: s.mimeType
      });
      this.logger.log(`[malv-voice] stt pipeline start sessionId=${args.sessionId} bytes=${totalBytes} chunks=${chunkCount}`);
      // eslint-disable-next-line no-console
      console.debug("[voice_api] stt started", { sessionId: args.sessionId });
      this.getRealtimeGateway().emitToUser(args.userId, "voice:session", {
        phase: "stt_running",
        sessionId: args.sessionId,
        at: Date.now()
      });
      let res: Awaited<ReturnType<LocalSttService["transcribeAudio"]>>;
      try {
        res = await this.stt.transcribeAudio({
          audioBytes,
          mimeType: s.mimeType,
          language: null,
          sessionId: args.sessionId
        });
      } finally {
        this.getRealtimeGateway().emitToUser(args.userId, "voice:session", {
          phase: "stt_done",
          sessionId: args.sessionId,
          at: Date.now()
        });
      }
      const text = (res.text ?? "").trim();
      // eslint-disable-next-line no-console
      console.debug("[voice_api] stt result", { sessionId: args.sessionId, text });
      this.sttLog("voice_finalize_stt_result", {
        userId: args.userId,
        sessionId: args.sessionId,
        textLen: text.length,
        transcriptText: text
      });
      this.logger.log(`[malv-voice] transcript ${text ? "received" : "missing"} sessionId=${args.sessionId}`);

      if (s.sessionTarget === "operator") {
        const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
        const triggerMatched = VoicePlaybackService.matchesVoicePipelineTestTrigger(text);
        const sttPayload = {
          text,
          normalized,
          triggerMatched,
          sessionId: args.sessionId,
          callSessionId: s.callSessionId ?? null,
          empty: !text
        };
        this.logger.log(
          `[malv-voice] voice:stt_operator_final emit sessionId=${args.sessionId} callSessionId=${s.callSessionId ?? "null"} textLen=${text.length} triggerMatched=${triggerMatched}`
        );
        // eslint-disable-next-line no-console
        console.info("[malv-voice-debug] voice:stt_operator_final", sttPayload);
        this.getRealtimeGateway().emitToUser(args.userId, "voice:stt_operator_final", sttPayload);
      }

      if (!text) {
        // eslint-disable-next-line no-console
        console.error("[voice_api] error", { sessionId: args.sessionId, sessionTarget: s.sessionTarget, stage: "stt_result", error: "no_speech" });
        this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
          stage: "stt",
          message: userMessageForPipelineCode("STT_EMPTY_RESULT", "No speech detected in the recording"),
          code: "STT_EMPTY_RESULT",
          sessionId: args.sessionId
        });
        return { ok: false, error: "STT_EMPTY_RESULT" };
      }

      if (isAnnotationOnlyTranscript(text)) {
        this.logger.warn(`[malv-voice] transcript rejected annotation-only sessionId=${args.sessionId} text="${text}"`);
        this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
          stage: "stt",
          message: userMessageForPipelineCode("STT_ANNOTATION_ONLY", "I could not catch clear speech. Please try again."),
          code: "STT_ANNOTATION_ONLY",
          sessionId: args.sessionId
        });
        return { ok: false, error: "STT_ANNOTATION_ONLY" };
      }

      if (s.sessionTarget === "composer_chat") {
        // eslint-disable-next-line no-console
        console.debug("[voice_api] emit final", { sessionId: args.sessionId, sessionTarget: s.sessionTarget });
        try {
          this.logger.log(
            `[malv-voice] websocket emit voice:final sessionId=${args.sessionId} userId=${args.userId} textLen=${text.length}`
          );
          this.getRealtimeGateway().emitToUser(args.userId, "voice:final", {
            text,
            sessionId: s.sessionId,
            sessionTarget: s.sessionTarget
          });
          const totalToFinalTranscriptMs = Date.now() - requestReceivedAtMs;
          this.logger.log(
            `[malv-voice] latency sessionId=${args.sessionId} recordingDurationMs=${args.recordingDurationMs ?? "unknown"} wavDurationMs=${res.diagnostics?.wavDurationMs ?? "unknown"} whisperWallMs=${res.diagnostics?.whisperWallMs ?? "unknown"} totalToFinalTranscriptMs=${totalToFinalTranscriptMs}`
          );
        } catch (emitErr) {
          const code = "TRANSCRIPT_EMIT_FAILED";
          this.sttError("voice_emit_final_failed", { userId: args.userId, sessionId: args.sessionId }, emitErr);
          this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
            stage: pipelineStageForCode(code),
            code,
            recoverable: true,
            message: userMessageForPipelineCode(code, "Failed to deliver transcript"),
            sessionId: args.sessionId,
            debug: { error: formatErrorForLog(emitErr) }
          });
          return { ok: false, error: code };
        }
        return { ok: true, composerChat: true };
      }

      // Operator mode: dispatch as a final utterance (self-hosted STT -> existing operator flow).
      try {
        this.logger.log(`[malv-voice] model dispatch start sessionId=${args.sessionId} textLen=${text.length}`);
        const op = await this.voiceOperator.handleVoiceUtterance({
          userId: args.userId,
          callSessionId: s.callSessionId ?? null,
          transcriptText: text,
          isFinal: true,
          contextHint: null,
          sessionTarget: s.sessionTarget,
          sessionId: s.sessionId
        });
        this.logger.log(`[malv-voice] model dispatch done sessionId=${args.sessionId}`);
        return op;
      } catch (opErr) {
        const code = "MODEL_REQUEST_FAILED";
        this.sttError("voice_operator_dispatch_failed", { userId: args.userId, sessionId: args.sessionId }, opErr);
        this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
          stage: pipelineStageForCode(code),
          code,
          recoverable: true,
          message: userMessageForPipelineCode(code, opErr instanceof Error ? opErr.message : String(opErr)),
          sessionId: args.sessionId,
          debug: { error: formatErrorForLog(opErr) }
        });
        return { ok: false, error: code };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errorCode = errorCodeOf(e) ?? "STT_REQUEST_FAILED";
      const stage = pipelineStageForCode(errorCode);
      this.sttError(
        "voice_finalize_failed",
        { userId: args.userId, sessionId: args.sessionId, reason: args.reason ?? null, code: errorCode, stage },
        e
      );
      // eslint-disable-next-line no-console
      console.error("[voice_api] error", {
        sessionId: args.sessionId,
        sessionTarget: s.sessionTarget,
        stage,
        code: errorCode,
        error: msg
      });
      this.logger.warn(
        `voice finalize failed userId=${args.userId} sessionId=${args.sessionId} code=${errorCode} stage=${stage} err=${msg}`
      );
      this.getRealtimeGateway().emitToUser(args.userId, "voice:error", {
        stage,
        code: errorCode,
        recoverable: errorCode !== "FFMPEG_NOT_FOUND",
        message: userMessageForPipelineCode(errorCode, msg),
        sessionId: args.sessionId,
        debug: { error: formatErrorForLog(e) }
      });
      return { ok: false, error: errorCode };
    } finally {
      this.sessions.delete(k);
    }
  }

  cancelSession(args: { userId: string; sessionId: string }) {
    if (!args.sessionId) throw new BadRequestException("sessionId required");
    const k = this.key(args.userId, args.sessionId);
    this.sessions.delete(k);
  }

  /**
   * End-call / teardown: remove all in-memory STT ingest sessions tied to a voice call.
   * Prevents further chunk processing for this call (ingest will see unknown session).
   */
  endAllSessionsForCall(args: { userId: string; callSessionId: string }) {
    const { userId, callSessionId } = args;
    for (const [k, s] of this.sessions.entries()) {
      if (s.userId === userId && s.callSessionId === callSessionId) {
        this.sessions.delete(k);
        this.sttLog("session_removed_for_call_end", { userId, callSessionId, sessionId: s.sessionId });
      }
    }
  }
}


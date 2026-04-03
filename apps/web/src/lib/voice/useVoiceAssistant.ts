import { useCallback, useEffect, useRef, useState } from "react";
import { postVoiceTestTrigger } from "../api/voiceTestTrigger";
import type { UseVoiceAssistantOptions, VoiceAssistantPhase } from "./voiceAssistantTypes";

const VAD_TICK_MS = 60;

/** Local whisper.cpp can take minutes on long audio; must exceed API `MALV_LOCAL_STT_TIMEOUT_MS` + slack. */
const VOICE_FINALIZE_TIMEOUT_MS = Math.max(
  10_000,
  Number(import.meta.env.VITE_MALV_VOICE_FINALIZE_TIMEOUT_MS ?? 360_000)
);

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatErrorForLog(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (err && typeof err === "object") {
    try {
      return err as Record<string, unknown>;
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

function isLocalSttMimeSupported(mimeType: string | null | undefined) {
  // Backend STT path currently expects webm/ogg container formats for ffmpeg -> wav.
  if (!mimeType) return true; // can't reliably verify; let backend attempt.
  return mimeType.includes("webm") || mimeType.includes("ogg");
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

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

export function useVoiceAssistant(options: UseVoiceAssistantOptions) {
  const {
    getSocket,
    silenceAutoStopMs = 2100,
    minSpeechMs = 900,
    finalStabilizeMs = 420,
    onOperatorVoiceEvent
  } = options;

  const optsRef = useRef(options);
  optsRef.current = options;

  const voiceDebug = import.meta.env.DEV || import.meta.env.VITE_MALV_VOICE_DEBUG === "true";
  const voiceLog = useCallback(
    (event: string, data?: Record<string, unknown>) => {
      if (!voiceDebug) return;
      // eslint-disable-next-line no-console
      console.debug(`[malv-voice] ${event}`, data ?? {});
    },
    [voiceDebug]
  );
  const voiceLogAlwaysError = useCallback(
    (event: string, data?: Record<string, unknown>, err?: unknown) => {
      const payload = { ...(data ?? {}) };
      if (err != null) payload.error = formatErrorForLog(err);
      // eslint-disable-next-line no-console
      console.error(`[malv-voice] ${event}`, payload);
    },
    []
  );

  // Debug-only structured trace. These logs are intentionally always-on so we can
  // audit one failing recording attempt end-to-end.
  const voiceTrace = useCallback((event: string, data?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return;
    // Hot path: per-chunk logs destroy main-thread performance; opt in with VITE_MALV_VOICE_VERBOSE=true
    if (event === "chunk" && import.meta.env.VITE_MALV_VOICE_VERBOSE !== "true") return;
    // eslint-disable-next-line no-console
    console.log(`[voice] ${event}`, data ?? {});
  }, []);

  const voiceTraceError = useCallback((event: string, data?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.error(`[voice] ${event}`, data ?? {});
  }, []);

  const [phase, setPhase] = useState<VoiceAssistantPhase>("idle");
  const [partialTranscript, setPartialTranscript] = useState(""); // intentionally unused (no visible live transcript)
  const [stableTranscript, setStableTranscript] = useState(""); // internal only
  const [committedTranscript, setCommittedTranscript] = useState(""); // internal only
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pressDown, setPressDown] = useState(false);
  const [micCooldownUntilMs, setMicCooldownUntilMs] = useState<number>(0);
  const [inputAudioLevel, setInputAudioLevel] = useState(0);
  const inputLevelSmoothRef = useRef(0);
  /** Latest smoothed mic 0–1; updated every VAD tick for orb (no React re-render). */
  const inputAudioLevelRef = useRef(0);
  const lastUiLevelEmitAtRef = useRef(0);

  const micInteraction = options.getMicInteraction();

  const listeningIntentRef = useRef(false);
  const sessionIsActiveRef = useRef(false);
  const sessionHasErrorRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef<number | null>(null);
  const captureStartAtRef = useRef<number | null>(null);
  const captureStartWallClockRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const minSpeechTimerRef = useRef<number | null>(null);
  const finalizationTokenRef = useRef(0);
  const finalizeTimerRef = useRef<number | null>(null);
  const finalizingRef = useRef(false);
  const committedOnceRef = useRef(false);
  const shouldFinalizeOnStopRef = useRef(false);
  const finalizeReasonRef = useRef<"user" | "silence" | null>(null);

  const chunkCountRef = useRef(0);
  const totalChunkBytesRef = useRef(0);
  const firstChunkAtRef = useRef<number | null>(null);
  const lastChunkAtRef = useRef<number | null>(null);
  const MIN_RECORDING_MS = 1200;

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const selectedRecorderMimeTypeRef = useRef<string | null>(null);
  const firstChunkMimeTypeRef = useRef<string | null>(null);
  const lastChunkSizeRef = useRef<number | null>(null);
  const pendingChunkPromisesRef = useRef<Set<Promise<void>>>(new Set());
  /** Operator + HTTP test-trigger: accumulate MediaRecorder blobs (no socket chunks). */
  const httpOperatorChunksRef = useRef<Blob[]>([]);
  const finalizeRequestStartedAtRef = useRef<number | null>(null);
  const sessionTargetRef = useRef<"composer_chat" | "operator">("composer_chat");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDataRef = useRef<Uint8Array | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  // Composer separation:
  // - `composerBaseTextRef` = composer text at the moment we started listening.
  // - We only write into the composer once we have a stabilized final transcript.
  const composerBaseTextRef = useRef<string>("");

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const commitComposerText = useCallback((text: string) => {
    // Always write into the real composer input state; never keep transcript trapped in voice-only UI.
    optsRef.current.onComposerTranscript(text, "replace");
  }, []);

  const restoreComposerBaseNow = useCallback(() => {
    const base = composerBaseTextRef.current;
    composerBaseTextRef.current = "";
    commitComposerText(base);
  }, [commitComposerText]);

  const emitSocket = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      const socket = getSocket();
      if (socket?.connected) socket.emit(event, payload);
    },
    [getSocket]
  );

  const clearMinSpeechTimer = useCallback(() => {
    if (minSpeechTimerRef.current != null) {
      window.clearTimeout(minSpeechTimerRef.current);
      minSpeechTimerRef.current = null;
    }
  }, []);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current != null) {
      voiceLog("finalization_timeout_cleared", { sessionId: sessionIdRef.current });
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, [voiceLog]);

  const clearAllVoiceTimers = useCallback(() => {
    clearSilenceTimer();
    clearMinSpeechTimer();
    clearFinalizeTimer();
  }, [clearFinalizeTimer, clearMinSpeechTimer, clearSilenceTimer]);

  const tearDownCapture = useCallback(() => {
    if (vadTimerRef.current != null) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* noop */
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) track.stop();
    }
    mediaStreamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        /* noop */
      });
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    timeDataRef.current = null;
    inputLevelSmoothRef.current = 0;
    inputAudioLevelRef.current = 0;
    setInputAudioLevel(0);
  }, []);

  const markSessionErroredAndTearDown = useCallback(
    (args: { message: string; code?: string | null; sessionId?: string | null }) => {
      const { message } = args;
      sessionHasErrorRef.current = true;
      sessionIsActiveRef.current = false;
      listeningIntentRef.current = false;
      finalizingRef.current = false;
      shouldFinalizeOnStopRef.current = false;
      finalizeReasonRef.current = null;

      // Invalidate any pending finalize watchdogs immediately.
      finalizationTokenRef.current += 1;

      clearAllVoiceTimers();
      pendingChunkPromisesRef.current.clear();
      finalizeRequestStartedAtRef.current = null;

      setPressDown(false);
      tearDownCapture();
      restoreComposerBaseNow();

      setErrorMessage(message);
      setPhase("error");

      // Make the mic feel intentionally disabled (not broken) for a moment.
      setMicCooldownUntilMs(Date.now() + 2500);
    },
    [clearAllVoiceTimers, restoreComposerBaseNow, tearDownCapture]
  );

  const beginFinalization = useCallback(
    (reason: "user" | "silence") => {
      if (sessionHasErrorRef.current) return;
      // Prevent multiple finalizations from competing.
      if (finalizeTimerRef.current != null) return;

      voiceLog("finalization_begin", { reason, sessionId: sessionIdRef.current, phase });
      voiceTrace("stop", { sessionTarget: sessionTargetRef.current, reason });

      inputLevelSmoothRef.current = 0;
      inputAudioLevelRef.current = 0;
      setInputAudioLevel(0);

      listeningIntentRef.current = false;
      finalizingRef.current = true;
      committedOnceRef.current = false;

      clearSilenceTimer();
      clearMinSpeechTimer();
      clearFinalizeTimer();

      setPressDown(false);
      setPhase("finalizing");
      setStableTranscript("");
      setPartialTranscript("");

      try {
        // Stop media recorder; backend STT gets triggered only after the recorder fully stops.
        shouldFinalizeOnStopRef.current = true;
        finalizeReasonRef.current = reason;
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
      } catch (err) {
        voiceLog("recorder_stop_error", {
          sessionId: sessionIdRef.current,
          reason,
          recState: mediaRecorderRef.current?.state ?? null
        });
        voiceLogAlwaysError("recorder_stop_error_caught", { sessionId: sessionIdRef.current, reason }, err);
        shouldFinalizeOnStopRef.current = false;
        finalizeReasonRef.current = null;
        // Fallback: still attempt stop to avoid UI hanging.
        const captureElapsedMs = captureStartAtRef.current != null ? Math.max(0, Math.round(performance.now() - captureStartAtRef.current)) : null;
        const httpOpFallback =
          sessionTargetRef.current === "operator" && optsRef.current.operatorUtteranceTransport === "http_test_trigger";
        if (!httpOpFallback) {
          emitSocket("voice:stop", { sessionId: sessionIdRef.current, reason, recordingDurationMs: captureElapsedMs });
        }
      }

      const token = finalizationTokenRef.current + 1;
      finalizationTokenRef.current = token;

      if (sessionTargetRef.current === "composer_chat") {
        // Composer-chat path requires `voice:final`; timeout is an error.
        finalizeTimerRef.current = window.setTimeout(() => {
          finalizeTimerRef.current = null;
          if (finalizationTokenRef.current !== token) return;
          if (sessionHasErrorRef.current) return;
          if (committedOnceRef.current) return;
          voiceLog("finalization_timeout", { reason, sessionId: sessionIdRef.current, sessionTarget: sessionTargetRef.current });
          voiceTraceError("timeout finalization", {
            sessionId: sessionIdRef.current,
            sessionTarget: sessionTargetRef.current,
            reason
          });
          voiceLogAlwaysError("voice:error", {
            sessionId: sessionIdRef.current,
            stage: "finalize_timeout",
            reason,
            sessionTarget: sessionTargetRef.current
          });
          markSessionErroredAndTearDown({ message: "Voice transcription timed out.", sessionId: sessionIdRef.current });
        }, VOICE_FINALIZE_TIMEOUT_MS);
      } else {
        const httpOperator =
          sessionTargetRef.current === "operator" && optsRef.current.operatorUtteranceTransport === "http_test_trigger";
        const watchdogMs = httpOperator ? VOICE_FINALIZE_TIMEOUT_MS : Math.max(1800, finalStabilizeMs + 800);
        finalizeTimerRef.current = window.setTimeout(() => {
          finalizeTimerRef.current = null;
          if (finalizationTokenRef.current !== token) return;
          if (sessionHasErrorRef.current) return;
          if (committedOnceRef.current) return;
          voiceLog("operator_finalize_watchdog_elapsed", {
            reason,
            sessionId: sessionIdRef.current,
            sessionTarget: sessionTargetRef.current,
            httpOperator
          });
          if (httpOperator) {
            voiceLogAlwaysError("voice:error", {
              sessionId: sessionIdRef.current,
              stage: "http_test_trigger_timeout",
              reason
            });
            markSessionErroredAndTearDown({
              message: "Voice test pipeline timed out.",
              sessionId: sessionIdRef.current
            });
            return;
          }
          finalizingRef.current = false;
          setPhase("idle");
        }, watchdogMs);
      }
    },
    [
      clearFinalizeTimer,
      clearMinSpeechTimer,
      clearSilenceTimer,
      emitSocket,
      finalStabilizeMs,
      markSessionErroredAndTearDown,
      phase,
      voiceLog,
      voiceLogAlwaysError,
      voiceTrace,
      voiceTraceError
    ]
  );

  const scheduleSilenceAutoStop = useCallback(() => {
    if (sessionHasErrorRef.current) return;
    // Press-to-record: only finalize on pointer-up. Toggle + continuous: silence ends utterance.
    if (optsRef.current.getMicInteraction() === "press") return;
    const speechStartedAt = speechStartedAtRef.current;
    if (speechStartedAt == null) return;

    clearSilenceTimer();
    clearMinSpeechTimer();

    const silenceSnapshot = lastSpeechAtRef.current;
    if (silenceSnapshot == null) return;

    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      if (sessionHasErrorRef.current) return;
      // Ignore if speech resumed after snapshot.
      if (lastSpeechAtRef.current !== silenceSnapshot) return;

      const elapsed = performance.now() - speechStartedAt;
      if (elapsed < minSpeechMs) {
        setPhase("waiting_for_pause");
        const remaining = Math.max(0, minSpeechMs - elapsed);

        minSpeechTimerRef.current = window.setTimeout(() => {
          minSpeechTimerRef.current = null;
          if (sessionHasErrorRef.current) return;
          // Still silent and still in the same speech turn.
          if (lastSpeechAtRef.current !== silenceSnapshot) return;
          beginFinalization("silence");
        }, remaining);
        return;
      }

      const captureElapsed = captureStartAtRef.current ? performance.now() - captureStartAtRef.current : 0;
      if (captureElapsed < MIN_RECORDING_MS) {
        const remaining = Math.max(0, MIN_RECORDING_MS - captureElapsed);
        voiceLog("silence_ignored_min_recording", {
          remainingMs: remaining,
          captureElapsedMs: captureElapsed,
          sessionId: sessionIdRef.current
        });
        // Re-check silence after we reach the minimum recording window.
        silenceTimerRef.current = window.setTimeout(() => {
          silenceTimerRef.current = null;
          if (sessionHasErrorRef.current) return;
          if (lastSpeechAtRef.current !== silenceSnapshot) return;
          beginFinalization("silence");
        }, remaining);
        return;
      }

      beginFinalization("silence");
    }, silenceAutoStopMs);
  }, [beginFinalization, clearMinSpeechTimer, clearSilenceTimer, minSpeechMs, silenceAutoStopMs, voiceLog]);

  const cancelRecording = useCallback(() => {
    clearAllVoiceTimers();
    listeningIntentRef.current = false;
    sessionIsActiveRef.current = false;
    sessionHasErrorRef.current = false;
    finalizingRef.current = false;
    committedOnceRef.current = false;
    shouldFinalizeOnStopRef.current = false;
    finalizeReasonRef.current = null;
    setPressDown(false);
    setPartialTranscript("");
    setStableTranscript("");
    setCommittedTranscript("");
    speechStartedAtRef.current = null;
    lastSpeechAtRef.current = null;
    captureStartAtRef.current = null;
    captureStartWallClockRef.current = null;
    chunkCountRef.current = 0;
    totalChunkBytesRef.current = 0;
    firstChunkAtRef.current = null;
    lastChunkAtRef.current = null;
    selectedRecorderMimeTypeRef.current = null;
    firstChunkMimeTypeRef.current = null;
    lastChunkSizeRef.current = null;
    pendingChunkPromisesRef.current.clear();
    httpOperatorChunksRef.current = [];
    finalizeRequestStartedAtRef.current = null;
    emitSocket("voice:cancel", { sessionId: sessionIdRef.current });
    sessionIdRef.current = null;
    tearDownCapture();
    restoreComposerBaseNow();
    setPhase("idle");
  }, [
    clearAllVoiceTimers,
    emitSocket,
    restoreComposerBaseNow,
    tearDownCapture
  ]);

  const startListening = useCallback(() => {
    clearAllVoiceTimers();
    tearDownCapture();

    finalizingRef.current = false;
    committedOnceRef.current = false;
    pendingChunkPromisesRef.current.clear();
    httpOperatorChunksRef.current = [];
    finalizeRequestStartedAtRef.current = null;
    selectedRecorderMimeTypeRef.current = null;
    firstChunkMimeTypeRef.current = null;
    lastChunkSizeRef.current = null;

    sessionHasErrorRef.current = false;
    sessionIsActiveRef.current = true;
    setErrorMessage(null);
    setPartialTranscript("");
    setStableTranscript("");
    setCommittedTranscript("");
    speechStartedAtRef.current = null;
    lastSpeechAtRef.current = null;
    captureStartAtRef.current = performance.now();
    captureStartWallClockRef.current = Date.now();
    chunkCountRef.current = 0;
    totalChunkBytesRef.current = 0;
    firstChunkAtRef.current = null;
    lastChunkAtRef.current = null;

    composerBaseTextRef.current = optsRef.current.getComposerText().trim();
    sessionIdRef.current = crypto.randomUUID();
    seqRef.current = 0;
    listeningIntentRef.current = true;
    shouldFinalizeOnStopRef.current = false;
    finalizeReasonRef.current = null;

    setPhase("arming");
    const callSessionId = optsRef.current.getCallSessionId?.() ?? null;
    const sessionTarget: "composer_chat" | "operator" = callSessionId ? "operator" : "composer_chat";
    const autoSend = false;
    sessionTargetRef.current = sessionTarget;
    voiceTrace("start", { sessionTarget, autoSend, callSessionId });
    const useHttpOperator =
      sessionTarget === "operator" && optsRef.current.operatorUtteranceTransport === "http_test_trigger";
    if (!useHttpOperator) {
      emitSocket(
        "voice:start",
        callSessionId
          ? { sessionId: sessionIdRef.current, sessionTarget, callSessionId }
          : { sessionId: sessionIdRef.current, sessionTarget }
      );
    } else {
      voiceTrace("voice:start skipped (http_test_trigger)", { sessionId: sessionIdRef.current });
    }

    const bootstrap = async () => {
      try {
        if (typeof navigator === "undefined" || typeof window === "undefined") return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        voiceLog("voice:recording_started", {
          sessionId: sessionIdRef.current,
          mime: "audio/webm (MediaRecorder)",
          now: Date.now()
        });
        voiceLog("recording_started", {
          sessionId: sessionIdRef.current,
          mime: "audio/webm (MediaRecorder)",
          now: Date.now()
        });

        const selectedMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        selectedRecorderMimeTypeRef.current = selectedMimeType;
        voiceLog("media_recorder_mime_selected", { sessionId: sessionIdRef.current, mimeType: selectedMimeType });

        const rec = new MediaRecorder(stream, { mimeType: selectedMimeType });
        mediaRecorderRef.current = rec;

        rec.onerror = (ev) => {
          voiceLog("media_recorder_error", { sessionId: sessionIdRef.current });
          voiceLogAlwaysError("voice:error", {
            sessionId: sessionIdRef.current,
            stage: "media_recorder_error",
            mimeType: selectedRecorderMimeTypeRef.current ?? null,
            error: (ev as any)?.error ?? null
          });
          voiceTraceError("error", {
            sessionId: sessionIdRef.current,
            sessionTarget: sessionTargetRef.current,
            message: "Microphone recording failed.",
            stage: "media_recorder_error",
            mimeType: selectedRecorderMimeTypeRef.current ?? null
          });
          shouldFinalizeOnStopRef.current = false;
          finalizeReasonRef.current = null;
          setErrorMessage("Microphone recording failed.");
          setPhase("error");
          listeningIntentRef.current = false;
          voiceLogAlwaysError(
            "media_recorder_error_caught",
            { sessionId: sessionIdRef.current, mimeType: selectedRecorderMimeTypeRef.current ?? null },
            (ev as any)?.error ?? ev
          );
        };

        rec.onstop = () => {
          const sid = sessionIdRef.current;
          const reason = finalizeReasonRef.current;
          const should = shouldFinalizeOnStopRef.current;
          shouldFinalizeOnStopRef.current = false;
          finalizeReasonRef.current = null;

          const stopWallClockAt = Date.now();
          const stopPerfAt = performance.now();
          const startPerfAt = captureStartAtRef.current;
          const startWallClockAt = captureStartWallClockRef.current;
          const durationMs = startPerfAt != null ? stopPerfAt - startPerfAt : null;

          const mimeType = firstChunkMimeTypeRef.current ?? selectedRecorderMimeTypeRef.current ?? null;
          const audioBlobSizeBytes = totalChunkBytesRef.current;
          const chunkCount = chunkCountRef.current;

          if (!should) {
            voiceLog("recorder_stopped_ignored", { sessionId: sid, reason });
            // Still stop mic capture; finalize request will not be triggered.
            tearDownCapture();
            return;
          }

          voiceLog("recording_stopped", {
            sessionId: sid,
            reason,
            recordingStartAtMs: startWallClockAt,
            recordingStopAtMs: stopWallClockAt,
            recordingDurationMs: durationMs,
            mimeType,
            audioBlobSizeBytes,
            chunkCount,
            firstChunkAtMsAgo: firstChunkAtRef.current != null && captureStartAtRef.current != null ? firstChunkAtRef.current - captureStartAtRef.current : null,
            lastChunkAtMsAgo: lastChunkAtRef.current != null && captureStartAtRef.current != null ? lastChunkAtRef.current - captureStartAtRef.current : null,
            lastChunkSizeBytes: lastChunkSizeRef.current
          });
          voiceLog("voice:recording_stopped", {
            sessionId: sid,
            reason,
            recordingStartAtMs: startWallClockAt,
            recordingStopAtMs: stopWallClockAt,
            recordingDurationMs: durationMs,
            mimeType,
            audioBlobSizeBytes,
            chunkCount
          });

          void (async () => {
            try {
              if (sessionHasErrorRef.current) return;
              // Critical: wait for all pending MediaRecorder -> base64 chunk dispatches.
              // Otherwise the backend finalizer can run before the last chunk lands.
              let totalWaitElapsedMs = 0;
              for (let attempt = 0; attempt < 3; attempt++) {
                const pending = Array.from(pendingChunkPromisesRef.current);
                if (pending.length === 0) break;

                const waitStartPerf = performance.now();
                voiceLog("finalize_wait_for_pending_chunks_round_start", {
                  sessionId: sid,
                  reason,
                  attempt: attempt + 1,
                  pendingChunkCount: pending.length
                });
                await Promise.allSettled(pending);
                const waitElapsedMs = performance.now() - waitStartPerf;
                totalWaitElapsedMs += waitElapsedMs;
                voiceLog("finalize_wait_for_pending_chunks_round_done", {
                  sessionId: sid,
                  reason,
                  attempt: attempt + 1,
                  pendingChunkCount: pending.length,
                  waitElapsedMs
                });
              }
              pendingChunkPromisesRef.current.clear();
              voiceLog("finalize_wait_for_pending_chunks_total_done", { sessionId: sid, reason, totalWaitElapsedMs });

              const MIN_FINAL_AUDIO_BYTES = 800;
              if (!sid) return;
              if (sessionHasErrorRef.current) return;

              // Validate audio payload before we ask backend/local STT to decode.
              if (!audioBlobSizeBytes || audioBlobSizeBytes < MIN_FINAL_AUDIO_BYTES) {
                voiceLog("finalize_blocked_empty_or_tiny_audio", {
                  sessionId: sid,
                  reason,
                  mimeType,
                  audioBlobSizeBytes,
                  chunkCount
                });
                voiceLogAlwaysError("voice:error", {
                  sessionId: sid,
                  stage: "finalize_blocked_empty_or_tiny_audio",
                  reason,
                  mimeType,
                  audioBlobSizeBytes,
                  chunkCount
                });
                voiceTraceError("error", {
                  sessionId: sid,
                  sessionTarget: sessionTargetRef.current,
                  message: "No audio captured (too short/empty). Try again and speak a bit longer.",
                  stage: "finalize_blocked_empty_or_tiny_audio"
                });
                markSessionErroredAndTearDown({
                  message: "No audio captured (too short/empty). Try again and speak a bit longer.",
                  sessionId: sid
                });
                return;
              }

              if (!isLocalSttMimeSupported(mimeType)) {
                voiceLog("finalize_blocked_unsupported_mime", {
                  sessionId: sid,
                  reason,
                  mimeType,
                  audioBlobSizeBytes,
                  chunkCount
                });
                voiceLogAlwaysError("voice:error", {
                  sessionId: sid,
                  stage: "finalize_blocked_unsupported_mime",
                  reason,
                  mimeType,
                  audioBlobSizeBytes,
                  chunkCount
                });
                voiceTraceError("error", {
                  sessionId: sid,
                  sessionTarget: sessionTargetRef.current,
                  message: "Unsupported microphone recording format.",
                  stage: "finalize_blocked_unsupported_mime",
                  mimeType
                });
                markSessionErroredAndTearDown({
                  message: "Unsupported microphone recording format (see dev console for details).",
                  sessionId: sid
                });
                return;
              }

              finalizeRequestStartedAtRef.current = Date.now();
              // Debug log: aggregated blob for this recording session.
              voiceTrace("blob", {
                size: audioBlobSizeBytes ?? 0,
                type: mimeType ?? null,
                sessionId: sid,
                sessionTarget: sessionTargetRef.current
              });
              voiceLog("finalize_request_start", {
                sessionId: sid,
                reason,
                recordingDurationMs: durationMs,
                mimeType,
                audioBlobSizeBytes,
                chunkCount,
                finalizeRequestStartedAtMs: finalizeRequestStartedAtRef.current
              });
              voiceLog("voice:finalize_request_sent", {
                sessionId: sid,
                reason,
                recordingDurationMs: durationMs,
                mimeType,
                audioBlobSizeBytes,
                chunkCount
              });

              const httpOperator =
                sessionTargetRef.current === "operator" && optsRef.current.operatorUtteranceTransport === "http_test_trigger";

              if (httpOperator) {
                voiceTrace("http_test_trigger POST", { sessionId: sid });
                setPhase("transcribing");
                const chunks = httpOperatorChunksRef.current.splice(0);
                const blobType = mimeType || "audio/webm";
                const utteranceBlob = new Blob(chunks, { type: blobType });
                const token = await optsRef.current.resolveVoiceTestAccessToken?.();
                if (!token) {
                  markSessionErroredAndTearDown({
                    message: "Sign in required for voice test.",
                    sessionId: sid
                  });
                  return;
                }
                const callSessionId = optsRef.current.getCallSessionId?.() ?? null;
                try {
                  const result = await postVoiceTestTrigger({
                    accessToken: token,
                    blob: utteranceBlob,
                    mimeType: blobType,
                    callSessionId
                  });
                  optsRef.current.onOperatorVoiceTestHttpResult?.(result);
                  clearFinalizeTimer();
                  committedOnceRef.current = true;
                  finalizingRef.current = false;
                  setPhase("idle");
                  voiceTrace("http_test_trigger done", {
                    sessionId: sid,
                    matched: result.matched,
                    ok: result.ok
                  });
                } catch (e) {
                  voiceLogAlwaysError("http_test_trigger_failed", { sessionId: sid }, e);
                  markSessionErroredAndTearDown({
                    message: e instanceof Error ? e.message : "Voice test request failed.",
                    sessionId: sid
                  });
                }
              } else {
                voiceTrace("emit voice:stop", { sessionId: sid, sessionTarget: sessionTargetRef.current });
                emitSocket("voice:stop", {
                  sessionId: sid,
                  reason,
                  recordingDurationMs: durationMs != null ? Math.max(0, Math.round(durationMs)) : null
                });
                if (sessionTargetRef.current === "operator") {
                  if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.info(
                      "[malv-voice-debug] voice:stop emitted (operator). Expect voice:stt_operator_final then voice:response / voice:test_playback — not voice:final."
                    );
                  }
                  optsRef.current.onOperatorVoiceStopSent?.({ sessionId: sid });
                }
                voiceTrace("waiting for final", { sessionTarget: sessionTargetRef.current });
              }
            } catch (err) {
              voiceLogAlwaysError("finalize_onstop_error", { sessionId: sid, reason }, err);
              voiceLogAlwaysError("voice:error", {
                sessionId: sid,
                stage: "finalize_onstop_error",
                reason,
                error: formatErrorForLog(err)
              });
              markSessionErroredAndTearDown({ message: "Voice finalization failed (see dev console).", sessionId: sid });
            } finally {
              // Stop mic capture now; backend has received audio chunks.
              tearDownCapture();
            }
          })();
        };

        rec.ondataavailable = (ev) => {
          if (sessionHasErrorRef.current) return;
          const blob = ev.data;
          if (!blob || blob.size === 0) return;
          const currentSessionId = sessionIdRef.current;
          const target = sessionTargetRef.current;
          const seq = seqRef.current++;

          const blobMimeType = blob.type || "audio/webm";
          voiceTrace("chunk", { size: blob.size, type: blobMimeType });
          voiceLog("voice:blob_created", {
            sessionId: currentSessionId,
            seq,
            sessionTarget: target,
            mimeType: blobMimeType,
            blobSizeBytes: blob.size
          });
          if (firstChunkMimeTypeRef.current == null) firstChunkMimeTypeRef.current = blobMimeType;
          lastChunkSizeRef.current = blob.size;

          const promise = (async () => {
            try {
              if (sessionHasErrorRef.current) return;
              chunkCountRef.current += 1;
              totalChunkBytesRef.current += blob.size;
              const now = performance.now();
              if (firstChunkAtRef.current == null) firstChunkAtRef.current = now;
              lastChunkAtRef.current = now;

              if (optsRef.current.operatorUtteranceTransport === "http_test_trigger" && target === "operator") {
                httpOperatorChunksRef.current.push(blob);
                voiceLog("voice:http_chunk_buffered", {
                  sessionId: currentSessionId,
                  seq,
                  bytes: blob.size,
                  mimeType: blobMimeType
                });
                return;
              }

              const audioB64 = await blobToBase64(blob);
              if (sessionHasErrorRef.current) return;
              emitSocket("voice:chunk", {
                sessionId: currentSessionId,
                sessionTarget: target,
                seq,
                mimeType: blobMimeType,
                audioB64
              });

              voiceLog("chunk_sent", {
                sessionId: currentSessionId,
                seq,
                bytes: blob.size,
                mimeType: blobMimeType
              });
            } catch (err) {
              // ignore; STT will fail if we drop too many chunks
              voiceLog("chunk_encode_failed", {
                sessionId: currentSessionId,
                seq,
                error: formatErrorForLog(err)
              });
              voiceLogAlwaysError("chunk_encode_failed_caught", { sessionId: currentSessionId, seq }, err);
            }
          })();
          pendingChunkPromisesRef.current.add(promise);
          promise.finally(() => {
            pendingChunkPromisesRef.current.delete(promise);
          });
          void promise;
        };

        // Local VAD via RMS energy on mic signal (no transcript UI).
        const AudioContextCtor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) throw new Error("AudioContext not available");
        const ac = new AudioContextCtor();
        audioContextRef.current = ac;
        const source = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.85;
        analyserRef.current = analyser;
        source.connect(analyser);
        const timeData = new Uint8Array(analyser.fftSize);
        timeDataRef.current = timeData;

        const threshold = clamp01(Number(import.meta.env.VITE_MALV_VAD_THRESHOLD ?? 0.022));
        const hangoverMs = Math.max(180, Number(import.meta.env.VITE_MALV_VAD_HANGOVER_MS ?? 340));

        vadTimerRef.current = window.setInterval(() => {
          if (sessionHasErrorRef.current) return;
          const an = analyserRef.current;
          const buf = timeDataRef.current;
          if (!an || !buf) return;
          an.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] ?? 128) - 128;
            const n = v / 128;
            sumSq += n * n;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const rawLevel = clamp01(rms * 16);
          inputLevelSmoothRef.current = inputLevelSmoothRef.current * 0.78 + rawLevel * 0.22;
          inputAudioLevelRef.current = inputLevelSmoothRef.current;
          const wallNow = Date.now();
          if (wallNow - lastUiLevelEmitAtRef.current >= 120) {
            lastUiLevelEmitAtRef.current = wallNow;
            setInputAudioLevel(inputLevelSmoothRef.current);
          }

          if (finalizingRef.current) return;

          const now = performance.now();
          const speaking = rms >= threshold;

          if (speaking) {
            lastSpeechAtRef.current = now;
            if (speechStartedAtRef.current == null) speechStartedAtRef.current = now;
            setPhase((p) => (p === "arming" || p === "listening" || p === "waiting_for_pause" ? "speech_detected" : p));
            scheduleSilenceAutoStop();
          } else {
            // If we recently had speech, treat as "waiting_for_pause" (natural pauses).
            const last = lastSpeechAtRef.current;
            if (last != null && now - last < hangoverMs) {
              setPhase((p) => (p === "speech_detected" || p === "listening" ? "waiting_for_pause" : p));
              scheduleSilenceAutoStop();
            } else {
              setPhase((p) => (p === "arming" ? "listening" : p));
            }
          }
        }, VAD_TICK_MS);

        rec.start(250);
        voiceLog("media_recorder_start", { sessionId: sessionIdRef.current, seq: 0 });
        voiceTrace("mediaRecorder:start", { sessionId: sessionIdRef.current, seq: 0 });
        setPhase("listening");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not start microphone.";
        voiceLogAlwaysError("voice:error", {
          sessionId: sessionIdRef.current,
          stage: "recording_start_failed",
          error: e instanceof Error ? e.message : String(e)
        });
        voiceTraceError("error", {
          sessionId: sessionIdRef.current,
          sessionTarget: sessionTargetRef.current,
          message: e instanceof Error ? e.message : String(e),
          stage: "recording_start_failed"
        });
        markSessionErroredAndTearDown({ message: msg, sessionId: sessionIdRef.current });
        voiceLog("recording_start_failed", { sessionId: sessionIdRef.current, error: e instanceof Error ? e.message : String(e) });
      }
    };

    void bootstrap();
  }, [
    clearAllVoiceTimers,
    clearFinalizeTimer,
    emitSocket,
    scheduleSilenceAutoStop,
    markSessionErroredAndTearDown,
    tearDownCapture
  ]);

  const stopListening = useCallback(() => {
    beginFinalization("user");
  }, [beginFinalization]);

  const retryFromError = useCallback(() => {
    setErrorMessage(null);
    setPhase("idle");
    setPressDown(false);
    setPartialTranscript("");
    setStableTranscript("");
    setCommittedTranscript("");
    speechStartedAtRef.current = null;
    lastSpeechAtRef.current = null;

    finalizingRef.current = false;
    committedOnceRef.current = false;
    sessionHasErrorRef.current = false;
    sessionIsActiveRef.current = false;

    clearAllVoiceTimers();

    pendingChunkPromisesRef.current.clear();
    finalizeRequestStartedAtRef.current = null;
    selectedRecorderMimeTypeRef.current = null;
    firstChunkMimeTypeRef.current = null;
    lastChunkSizeRef.current = null;

    restoreComposerBaseNow();
    tearDownCapture();
  }, [clearAllVoiceTimers, restoreComposerBaseNow, tearDownCapture]);

  const onMicClickToggle = useCallback(() => {
    if (optsRef.current.getMicInteraction() === "continuous") return;
    if (optsRef.current.getMicInteraction() !== "toggle") return;
    if (Date.now() < micCooldownUntilMs) return;
    if (phase === "error") {
      retryFromError();
      return;
    }
    const isActive =
      listeningIntentRef.current ||
      phase === "arming" ||
      phase === "listening" ||
      phase === "speech_detected" ||
      phase === "waiting_for_pause";
    if (isActive) {
      stopListening();
      return;
    }
    if (phase === "finalizing" || phase === "transcribing" || phase === "committed") return;
    startListening();
  }, [phase, retryFromError, startListening, stopListening]);

  const onMicPointerDown = useCallback(() => {
    if (optsRef.current.getMicInteraction() !== "press") return;
    if (Date.now() < micCooldownUntilMs) return;
    setPressDown(true);
    if (phase === "error") retryFromError();
    startListening();
  }, [phase, retryFromError, startListening]);

  const onMicPointerUp = useCallback(() => {
    if (optsRef.current.getMicInteraction() !== "press") return;
    setPressDown(false);
    stopListening();
  }, [stopListening]);

  const onMicPointerLeave = useCallback(() => {
    if (optsRef.current.getMicInteraction() !== "press" || !pressDown) return;
    setPressDown(false);
    stopListening();
  }, [pressDown, stopListening]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onVoiceError = (p: { message?: string; sessionId?: string | null; debug?: unknown }) => {
      const msg = typeof p?.message === "string" ? p.message : "Voice error";
      const sid = sessionIdRef.current;
      const payloadSessionId = typeof p?.sessionId === "string" ? p.sessionId : null;
      const code = (p as any)?.code ?? null;

      if (payloadSessionId && sid && payloadSessionId !== sid) {
        voiceLog("voice_error_ignored_session_mismatch", { expected: sid, got: payloadSessionId, message: msg });
        return;
      }

      voiceLog("voice_finalize_failure", {
        sessionId: sid,
        message: msg,
        finalizeRequestStartedAtMs: finalizeRequestStartedAtRef.current
      });
      voiceLog("voice:finalize_response_received", {
        sessionId: sid,
        kind: "voice:error",
        message: msg
      });
      voiceTraceError("error", {
        sessionId: sid,
        sessionTarget: sessionTargetRef.current,
        message: msg,
        code: (p as any)?.code ?? null
      });
      voiceLogAlwaysError("voice:error", {
        sessionId: sid,
        stage: "voice:error_received",
        message: msg,
        finalizeRequestStartedAtMs: finalizeRequestStartedAtRef.current,
        code: (p as any)?.code ?? null,
        debug: (p as any)?.debug ?? null
      });
      voiceLogAlwaysError("voice_error_received_payload", { sessionId: sid, message: msg, debug: p?.debug }, p);

      const friendly =
        code === "FFMPEG_NOT_FOUND" || /ffmpeg/i.test(msg)
          ? "Voice unavailable (server missing audio processing)"
          : msg;

      markSessionErroredAndTearDown({ message: friendly, code, sessionId: sid });
      onOperatorVoiceEvent?.({ kind: "error", payload: p });
    };
    const onVoiceFinal = (p: { text?: string; sessionId?: string | null; sessionTarget?: string | null }) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (p?.sessionId !== sid) {
        voiceLog("voice_final_ignored_session_mismatch", { expected: sid, got: p?.sessionId ?? null });
        return;
      }
      if (sessionHasErrorRef.current) return;
      if (p?.sessionTarget !== "composer_chat") {
        voiceLog("voice_final_ignored_target_mismatch", { sessionId: sid, target: p?.sessionTarget ?? null });
        return;
      }
      const candidate = String(p?.text ?? "").trim();
      voiceLog("voice_final_received", { sessionId: sid, textLen: candidate.length });
      voiceLog("voice:finalize_response_received", {
        sessionId: sid,
        kind: "voice:final",
        sessionTarget: p?.sessionTarget ?? null,
        textLen: candidate.length
      });
      voiceTrace("received voice:final payload", {
        sessionId: sid,
        sessionTarget: p?.sessionTarget ?? null,
        text: candidate
      });
      voiceLog("voice:transcript_received", {
        sessionId: sid,
        textLen: candidate.length
      });
      if (!candidate) {
        voiceLog("voice_final_empty_text_noop", { sessionId: sid });
        return;
      }

      if (isAnnotationOnlyTranscript(candidate)) {
        voiceLog("voice_final_rejected_annotation_only", { sessionId: sid, text: candidate });
        markSessionErroredAndTearDown({
          message: "I could not catch clear speech. Please try again.",
          sessionId: sid
        });
        return;
      }

      if (committedOnceRef.current) {
        voiceLog("voice_final_ignored_already_committed", { sessionId: sid, transcriptTextLen: candidate.length });
        return;
      }
      committedOnceRef.current = true;
      clearFinalizeTimer();
      const autoSend = false; // Debug simplification
      voiceLog("voice_finalize_success", {
        sessionId: sid,
        transcriptText: candidate,
        textLen: candidate.length,
        finalizeRequestStartedAtMs: finalizeRequestStartedAtRef.current,
        autoSubmit: autoSend
      });

      setStableTranscript(candidate);
      setCommittedTranscript(candidate);

      const base = composerBaseTextRef.current;
      const next = base ? `${base} ${candidate}`.trim() : candidate;
      composerBaseTextRef.current = "";

      // Debug simplification: commit immediately on any non-empty transcript.
      setPhase("committed");
      voiceTrace("commit transcript", { text: candidate, autoSend });
      try {
        commitComposerText(next);
      } catch (err) {
        voiceTraceError("error", {
          sessionId: sid,
          sessionTarget: sessionTargetRef.current,
          message: "transcript commit failed",
          error: formatErrorForLog(err)
        });
        voiceLogAlwaysError("transcript_commit_failed", { sessionId: sid, textLen: next.length }, err);
      }
      // Clear finalizing state after a small UI delay.
      window.setTimeout(() => {
        if (sessionHasErrorRef.current) return;
        finalizingRef.current = false;
        setPhase("idle");
      }, 180);
    };
    const onResponse = (p: unknown) => {
      if (sessionTargetRef.current === "operator" && finalizingRef.current) {
        clearFinalizeTimer();
        finalizingRef.current = false;
        setPhase("idle");
        voiceLog("operator_finalize_resolved_by_event", {
          sessionId: sessionIdRef.current,
          event: "voice:response"
        });
      }
      onOperatorVoiceEvent?.({ kind: "response", payload: p });
    };
    const onOpStart = (p: unknown) => {
      if (sessionTargetRef.current === "operator" && finalizingRef.current) {
        clearFinalizeTimer();
        finalizingRef.current = false;
        setPhase("idle");
        voiceLog("operator_finalize_resolved_by_event", {
          sessionId: sessionIdRef.current,
          event: "voice:operator_started"
        });
      }
      onOperatorVoiceEvent?.({ kind: "operator_started", payload: p });
    };

    const onVoiceSession = (p: { phase?: string; sessionId?: string | null; at?: number }) => {
      const sid = sessionIdRef.current;
      if (!sid || p?.sessionId !== sid) return;
      if (sessionTargetRef.current !== "composer_chat") return;
      if (p.phase === "stt_running") {
        if (finalizingRef.current && !sessionHasErrorRef.current && !committedOnceRef.current) {
          setPhase("transcribing");
        }
        clearFinalizeTimer();
        voiceLog("finalize_watchdog_paused_for_stt", { sessionId: sid });
        return;
      }
      if (p.phase === "stt_done") {
        if (finalizingRef.current && !sessionHasErrorRef.current && !committedOnceRef.current) {
          setPhase("finalizing");
        }
        voiceLog("finalize_watchdog_rearmed_after_stt", { sessionId: sid });
        if (!finalizingRef.current || committedOnceRef.current || sessionHasErrorRef.current) return;
        clearFinalizeTimer();
        const token = finalizationTokenRef.current;
        finalizeTimerRef.current = window.setTimeout(() => {
          finalizeTimerRef.current = null;
          if (finalizationTokenRef.current !== token) return;
          if (sessionHasErrorRef.current) return;
          if (committedOnceRef.current) return;
          voiceLog("finalization_timeout", {
            reason: "post_stt_watchdog",
            sessionId: sessionIdRef.current,
            sessionTarget: sessionTargetRef.current
          });
          voiceTraceError("timeout finalization", {
            sessionId: sessionIdRef.current,
            sessionTarget: sessionTargetRef.current,
            reason: "post_stt"
          });
          voiceLogAlwaysError("voice:error", {
            sessionId: sessionIdRef.current,
            stage: "finalize_timeout",
            reason: "post_stt",
            sessionTarget: sessionTargetRef.current
          });
          markSessionErroredAndTearDown({ message: "Voice transcription timed out.", sessionId: sessionIdRef.current });
        }, VOICE_FINALIZE_TIMEOUT_MS);
      }
    };

    socket.on("voice:error", onVoiceError);
    socket.on("voice:response", onResponse);
    socket.on("voice:operator_started", onOpStart);
    socket.on("voice:final", onVoiceFinal);
    socket.on("voice:session", onVoiceSession);

    return () => {
      socket.off("voice:error", onVoiceError);
      socket.off("voice:response", onResponse);
      socket.off("voice:operator_started", onOpStart);
      socket.off("voice:final", onVoiceFinal);
      socket.off("voice:session", onVoiceSession);
    };
  }, [
    clearFinalizeTimer,
    commitComposerText,
    finalStabilizeMs,
    getSocket,
    markSessionErroredAndTearDown,
    onOperatorVoiceEvent,
    voiceLog,
    voiceLogAlwaysError,
    voiceTraceError
  ]);

  useEffect(() => {
    return () => {
      clearAllVoiceTimers();
      listeningIntentRef.current = false;
      sessionIsActiveRef.current = false;
      sessionHasErrorRef.current = false;
      finalizingRef.current = false;
      committedOnceRef.current = false;
      tearDownCapture();
    };
  }, [clearAllVoiceTimers, tearDownCapture]);

  const occupiesComposer =
    phase === "arming" ||
    phase === "listening" ||
    phase === "speech_detected" ||
    phase === "waiting_for_pause" ||
    phase === "finalizing" ||
      phase === "transcribing" ||
    phase === "committed";

  useEffect(() => {
    if (!micCooldownUntilMs) return;
    const remaining = micCooldownUntilMs - Date.now();
    if (remaining <= 0) {
      setMicCooldownUntilMs(0);
      return;
    }
    const t = window.setTimeout(() => setMicCooldownUntilMs(0), remaining);
    return () => window.clearTimeout(t);
  }, [micCooldownUntilMs]);

  const micDisabled = micCooldownUntilMs > Date.now();

  return {
    phase,
    partialTranscript,
    stableTranscript,
    committedTranscript,
    errorMessage,
    inputAudioLevel,
    inputAudioLevelRef,
    micDisabled,
    micInteraction,
    occupiesComposer,
    pressDown,
    startListening,
    stopListening,
    cancelRecording,
    retryFromError,
    onMicClickToggle,
    onMicPointerDown,
    onMicPointerUp,
    onMicPointerLeave
  };
}

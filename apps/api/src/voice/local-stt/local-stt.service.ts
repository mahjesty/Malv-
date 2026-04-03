import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FfmpegNotFoundError, FfmpegService } from "../../modules/voice/services/ffmpeg.service";

type LocalSttResult = {
  text: string;
  segments?: Array<{ startMs: number; endMs: number; text: string }>;
  diagnostics?: {
    wavDurationMs: number;
    whisperWallMs: number;
    sttTotalMs: number;
    language: string;
    modelPath: string;
  };
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    const e = new Error(`Missing env ${name} (local STT unavailable)`);
    (e as Error & { code: string }).code = "STT_UNAVAILABLE";
    throw e;
  }
  return v;
}

function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function formatErrorForLog(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (err && typeof err === "object") return err as Record<string, unknown>;
  return { message: String(err) };
}

function errWithCode(message: string, code: string, cause?: unknown) {
  const e = new Error(message);
  (e as Error & { code: string }).code = code;
  if (cause instanceof Error) (e as Error & { cause?: Error }).cause = cause;
  return e;
}

/** whisper-cli prints segment lines to stderr like: `[00:00:00.000 --> 00:00:11.000]   text` */
function extractTranscriptFromWhisperSegments(text: string): string {
  const lines = text.split(/\r?\n/);
  const pieces: string[] = [];
  const reBracket =
    /\[\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\]\s*(.+)$/;
  const rePlainTime = /^\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s+(.+)$/;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^main:|^whisper_|^ggml_|^system_info|^init:|^load time|^malloc|^AVX|^\[.*%\]/.test(t)) continue;
    let m = t.match(reBracket);
    if (m?.[1]) {
      pieces.push(m[1].trim());
      continue;
    }
    m = t.match(rePlainTime);
    if (m?.[1]) pieces.push(m[1].trim());
  }
  return pieces.join(" ").trim();
}

/** Prefer user transcript lines; drop obvious progress / timing noise. */
function extractPlainTranscriptCandidate(stdout: string, stderr: string): string {
  const blob = `${stdout}\n${stderr}`;
  const lines = blob.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^main:|^whisper_|^ggml_|^system_info|^init:|^load time|^malloc|^AVX|^error:|^warning:/i.test(t)) continue;
    if (/^\[.*%\]\s*translate|^transcribe\s|^processing\s/i.test(t)) continue;
    if (reBracketLine(t)) {
      kept.push(t);
      continue;
    }
    if (t.length > 2 && !t.startsWith("[") && !t.includes("-->")) kept.push(t);
  }
  return kept.join(" ").trim();
}

function reBracketLine(t: string) {
  return /\[\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\]/.test(t);
}

type WhisperRunResult = { stdout: string; stderr: string; exitCode: number; durationMs: number; startedAtMs: number };

async function execWhisperWithLogs(args: {
  cmd: string;
  argv: string[];
  timeoutMs: number;
  sessionId: string;
  logger: Logger;
  whisperBin: string;
  modelPath: string;
  wavPath: string;
  wavBytes: number;
}): Promise<WhisperRunResult> {
  const { cmd, argv, timeoutMs, sessionId, logger, whisperBin, modelPath, wavPath, wavBytes } = args;
  const startedAtMs = Date.now();

  const header = {
    sessionId,
    sttStartAtMs: startedAtMs,
    inputAudioPath: wavPath,
    inputAudioBytes: wavBytes,
    whisperBin,
    modelPath,
    argv: [cmd, ...argv]
  };
  logger.log(`[STT] whisper_invocation ${JSON.stringify(header)}`);
  // eslint-disable-next-line no-console
  console.log(`[STT] whisper_invocation`, header);

  return await new Promise<WhisperRunResult>((resolve, reject) => {
    const child = spawn(cmd, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      const elapsed = Date.now() - startedAtMs;
      logger.error(
        `[STT] whisper TIMEOUT sessionId=${sessionId} afterMs=${elapsed} limitMs=${timeoutMs} — full stderr:\n${stderr || "(empty)"}`
      );
      logger.error(`[STT] whisper TIMEOUT sessionId=${sessionId} — full stdout:\n${stdout || "(empty)"}`);
      reject(errWithCode(`whisper.cpp timed out after ${timeoutMs}ms (ran ${elapsed}ms)`, "STT_TIMEOUT"));
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(t);
      logger.error(`[STT] whisper spawn error sessionId=${sessionId}: ${formatErrorForLog(e)}`);
      reject(errWithCode(`whisper.cpp spawn failed: ${e instanceof Error ? e.message : String(e)}`, "STT_REQUEST_FAILED", e));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      const exitCode = code ?? -1;
      const durationMs = Date.now() - startedAtMs;
      const summary = {
        sessionId,
        exitCode,
        durationMs,
        stdoutBytes: stdout.length,
        stderrBytes: stderr.length,
        inputAudioPath: wavPath,
        whisperBin,
        modelPath
      };
      logger.log(`[STT] whisper_finished ${JSON.stringify(summary)}`);
      // eslint-disable-next-line no-console
      console.log(`[STT] whisper_finished`, summary);

      logger.log(`[STT] whisper stdout (full) sessionId=${sessionId} chars=${stdout.length}\n${stdout || "(empty)"}`);
      logger.log(`[STT] whisper stderr (full) sessionId=${sessionId} chars=${stderr.length}\n${stderr || "(empty)"}`);

      if (exitCode === 0) return resolve({ stdout, stderr, exitCode, durationMs, startedAtMs });

      logger.error(
        `[STT] whisper NONZERO_EXIT sessionId=${sessionId} exitCode=${exitCode} durationMs=${durationMs} — stderr:\n${stderr || "(empty)"}`
      );
      logger.error(`[STT] whisper NONZERO_EXIT sessionId=${sessionId} — stdout:\n${stdout || "(empty)"}`);
      reject(
        errWithCode(
          `whisper.cpp exited ${exitCode} after ${durationMs}ms (see server logs for full I/O)`,
          "STT_PROCESS_EXIT_NONZERO"
        )
      );
    });
  });
}

async function execAndCollect(args: { cmd: string; argv: string[]; timeoutMs: number }) {
  const { cmd, argv, timeoutMs } = args;
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`Command failed (code ${code}): ${cmd}\n${stderr || stdout}`));
    });
  });
}

async function execProbe(args: { cmd: string; argv: string[]; timeoutMs: number }) {
  const { cmd, argv, timeoutMs } = args;
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      reject(new Error(`Probe timed out after ${timeoutMs}ms: ${cmd}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr });
    });
  });
}

function withHelpfulFfmpegError(err: unknown, operation: string) {
  if (err instanceof FfmpegNotFoundError) return err;
  if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT") {
    const wrapped = new Error(`Audio processing unavailable: ffmpeg missing while ${operation}`);
    (wrapped as Error & { code?: string }).code = "FFMPEG_NOT_FOUND";
    return wrapped;
  }
  return err as Error;
}

function ffmpegTimeoutMsForBytes(totalInputBytes: number) {
  const base = Number(process.env.MALV_FFMPEG_TIMEOUT_MS ?? 180_000);
  const extra = Math.min(300_000, Math.floor(totalInputBytes / 50_000) * 1000);
  return Math.max(base, extra);
}

/**
 * WAV is always transcoded to 16kHz mono PCM16, so duration is derivable from bytes.
 * This avoids ffprobe dependency for timing diagnostics.
 */
function estimateWavDurationMs(wavBytes: number) {
  const WAV_HEADER_BYTES = 44;
  const PCM_BYTES_PER_SECOND = 16_000 * 2;
  const payloadBytes = Math.max(0, wavBytes - WAV_HEADER_BYTES);
  return Math.round((payloadBytes / PCM_BYTES_PER_SECOND) * 1000);
}

async function transcodeToWav(args: { ffmpegBin: string; inputPath: string; outputPath: string; timeoutMs: number }) {
  const { ffmpegBin, inputPath, outputPath, timeoutMs } = args;
  try {
    await execAndCollect({
      cmd: ffmpegBin,
      argv: ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-f", "wav", outputPath],
      timeoutMs
    });
  } catch (err) {
    throw withHelpfulFfmpegError(err, "transcoding audio to wav");
  }
}

function buildWhisperArgv(args: { model: string; wavPath: string; outputPrefix: string; language?: string | null }) {
  const { model, wavPath, outputPrefix } = args;
  const language =
    (args.language && args.language.trim()) || (process.env.MALV_WHISPER_LANGUAGE ?? "auto").trim() || "auto";
  const argv: string[] = ["-m", model, "-f", wavPath, "-of", outputPrefix, "-otxt", "-l", language];
  if (process.env.MALV_WHISPER_NO_NP !== "1" && process.env.MALV_WHISPER_NP_OFF !== "1") {
    argv.push("-np");
  }
  const extra = process.env.MALV_WHISPER_EXTRA_ARGS?.trim()
    ? process.env.MALV_WHISPER_EXTRA_ARGS.trim().split(/\s+/).filter(Boolean)
    : [];
  argv.push(...extra);
  return { argv, language, extraFlags: extra };
}

@Injectable()
export class LocalSttService {
  private readonly logger = new Logger(LocalSttService.name);
  private readonly voiceDebug = process.env.MALV_VOICE_DEBUG === "true" || process.env.NODE_ENV !== "production";

  constructor(private readonly ffmpegService: FfmpegService) {}

  private sttLog(event: string, data: Record<string, unknown>) {
    if (!this.voiceDebug) return;
    // eslint-disable-next-line no-console
    console.debug(`[malv-voice-stt] ${event}`, data);
  }

  private sttError(event: string, data: Record<string, unknown>, err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[malv-voice-stt] ${event}`, { ...data, error: formatErrorForLog(err) });
  }

  /**
   * Fully self-hosted STT.
   *
   * Default implementation: whisper.cpp CLI (MALV-controlled binary + model).
   * - `MALV_LOCAL_STT_PROVIDER=whisper_cpp`
   * - `WHISPER_CPP_BIN=/path/to/main`
   * - `WHISPER_CPP_MODEL=/path/to/ggml-model.bin`
   */
  async transcribeAudio(args: {
    audioBytes: Buffer;
    mimeType?: string | null;
    language?: string | null;
    /** Client voice session id (preferred for logs; avoids random internal ids). */
    sessionId?: string | null;
  }): Promise<LocalSttResult> {
    const provider = (process.env.MALV_LOCAL_STT_PROVIDER ?? "whisper_cpp").toLowerCase();
    if (provider !== "whisper_cpp") {
      const e = new Error(`Unsupported MALV_LOCAL_STT_PROVIDER=${provider} (supported: whisper_cpp)`);
      (e as Error & { code: string }).code = "STT_UNAVAILABLE";
      throw e;
    }

    const sessionId = (args.sessionId && String(args.sessionId).trim()) || randomUUID();
    const requestReceivedAtMs = Date.now();
    const bytesLen = args.audioBytes?.length ?? 0;
    const mimeType = args.mimeType ?? null;
    const ffmpegBin = this.ffmpegService.getFfmpegPath();
    const diag = this.ffmpegService.getDiagnosticsSnapshot();
    this.logger.log(
      `[malv-voice] ffmpeg path resolved sessionId=${sessionId} path=${ffmpegBin} source=${diag.resolutionSource ?? "unknown"} explicitEnv=${diag.explicitEnvSet}`
    );
    this.sttLog("stt_request_received", { sessionId, requestReceivedAtMs, bytesLen, mimeType });

    const MIN_AUDIO_BYTES = 800;
    if (!bytesLen || bytesLen < MIN_AUDIO_BYTES) {
      const err = errWithCode(`Audio too short/empty: bytes=${bytesLen}`, "STT_REQUEST_FAILED");
      this.sttError("stt_audio_rejected_too_small", { sessionId, bytesLen, mimeType }, err);
      throw err;
    }

    if (mimeType && !(mimeType.includes("webm") || mimeType.includes("ogg"))) {
      const err = errWithCode(
        `Unsupported audio mimeType for local STT: ${mimeType} (supported: audio/webm, audio/ogg)`,
        "STT_REQUEST_FAILED"
      );
      this.sttError("stt_audio_rejected_unsupported_mime", { sessionId, bytesLen, mimeType }, err);
      throw err;
    }

    const dir = await fs.mkdtemp(join(tmpdir(), `malv-stt-${sessionId}-`));
    const inputExt = mimeType?.includes("ogg") ? "ogg" : "webm";
    const rawPath = join(dir, `input.${inputExt}`);
    const wavPath = join(dir, "audio.wav");
    const outPath = join(dir, "out.txt");

    try {
      const ffmpegProbeTimeoutMs = Number(process.env.MALV_LOCAL_STT_FFMPEG_PROBE_TIMEOUT_MS ?? 5_000);
      try {
        await execAndCollect({ cmd: ffmpegBin, argv: ["-version"], timeoutMs: ffmpegProbeTimeoutMs });
        this.sttLog("local_stt_dependency_ffmpeg_available", { sessionId, ffmpegBin, probeTimeoutMs: ffmpegProbeTimeoutMs });
      } catch (err) {
        const wrappedErr = withHelpfulFfmpegError(err, "probing ffmpeg for transcription");
        this.sttError("local_stt_dependency_ffmpeg_probe_failed", { sessionId, ffmpegBin }, wrappedErr);
        throw wrappedErr;
      }

      const bin = requireEnv("WHISPER_CPP_BIN").trim();
      const model = requireEnv("WHISPER_CPP_MODEL").trim();
      if (/\.en\./i.test(model) || /base\.en|small\.en|medium\.en|large-v3\.en/i.test(model)) {
        this.logger.warn(
          `[STT] model path looks English-only (${model}); mixed-language speech needs a multilingual ggml-*.bin and MALV_WHISPER_LANGUAGE=auto (default).`
        );
      }
      this.logger.log(`[STT] env resolved sessionId=${sessionId} WHISPER_CPP_BIN=${bin} WHISPER_CPP_MODEL=${model}`);
      try {
        await fs.access(model, fsConstants.R_OK);
      } catch (err) {
        const e = errWithCode(`WHISPER_CPP_MODEL not readable: ${model}`, "STT_UNAVAILABLE", err);
        this.sttError("local_stt_model_unreadable", { sessionId, modelPath: model }, err);
        throw e;
      }

      const whisperProbeTimeoutMs = Number(process.env.MALV_LOCAL_STT_WHISPER_PROBE_TIMEOUT_MS ?? 5_000);
      try {
        const probe = await execProbe({ cmd: bin, argv: ["--help"], timeoutMs: whisperProbeTimeoutMs });
        this.sttLog("local_stt_dependency_whisper_cpp_available", {
          sessionId,
          whisperBin: bin,
          whisperProbeTimeoutMs,
          probeCode: probe.code
        });
      } catch (err) {
        const e = errWithCode(`whisper.cpp binary not runnable: ${bin}`, "STT_UNAVAILABLE", err);
        this.sttError("local_stt_dependency_whisper_cpp_probe_failed", { sessionId, whisperBin: bin }, err);
        throw e;
      }

      this.logger.log(`[malv-voice] preprocess start sessionId=${sessionId} bytes=${bytesLen} mimeType=${mimeType ?? "unknown"}`);
      this.sttLog("stt_decode_start", { sessionId, bytesLen, mimeType, inputExt, dir, rawPath });

      await fs.writeFile(rawPath, args.audioBytes);
      const rawStat = await fs.stat(rawPath).catch(() => null);
      this.logger.log(
        `[STT] raw_input_written sessionId=${sessionId} path=${rawPath} bytes=${rawStat?.size ?? bytesLen}`
      );

      const ffmpegTranscodeMs = ffmpegTimeoutMsForBytes(bytesLen);
      try {
        this.logger.log(`[malv-voice] audio preprocess ffmpeg start sessionId=${sessionId} timeoutMs=${ffmpegTranscodeMs}`);
        await transcodeToWav({ ffmpegBin, inputPath: rawPath, outputPath: wavPath, timeoutMs: ffmpegTranscodeMs });
        this.logger.log(`[malv-voice] audio preprocess success sessionId=${sessionId}`);
        this.sttLog("audio_decoded_success", { sessionId, mimeType, inputExt, wavPath });
      } catch (err) {
        this.logger.error(`[malv-voice] audio preprocess failure sessionId=${sessionId}`);
        this.sttError("audio_decoded_failed", { sessionId, mimeType, inputExt, rawPath, wavPath }, err);
        if (err instanceof FfmpegNotFoundError) throw err;
        if (errorCodeOf(err) === "FFMPEG_NOT_FOUND") throw err;
        const e = errWithCode(
          `Audio preprocess failed: ${err instanceof Error ? err.message : String(err)}`,
          "AUDIO_PREPROCESS_FAILED",
          err
        );
        throw e;
      }

      let wavStat: { size: number };
      try {
        await fs.access(wavPath, fsConstants.R_OK);
        wavStat = await fs.stat(wavPath);
      } catch (err) {
        const e = errWithCode(`WAV missing after ffmpeg: ${wavPath}`, "STT_INPUT_FILE_MISSING", err);
        this.sttError("stt_wav_missing", { sessionId, wavPath }, err);
        throw e;
      }

      const outputPrefix = join(dir, "out");
      const { argv, language, extraFlags } = buildWhisperArgv({
        model,
        wavPath,
        outputPrefix,
        language: args.language
      });
      const whisperTimeoutMs = Number(process.env.MALV_LOCAL_STT_TIMEOUT_MS ?? 300_000);

      this.logger.log(
        `[STT] stt_request sessionId=${sessionId} engine=whisper_cpp wavBytes=${wavStat.size} whisperTimeoutMs=${whisperTimeoutMs} languageFlag=${language} malvWhisperExtraFlags=${JSON.stringify(extraFlags)}`
      );
      this.sttLog("stt_engine_invoked", {
        sessionId,
        whisperBin: bin,
        modelPath: model,
        wavPath,
        wavBytes: wavStat.size,
        timeoutMs: whisperTimeoutMs,
        language,
        extraFlags
      });

      let whisperOut: WhisperRunResult;
      try {
        whisperOut = await execWhisperWithLogs({
          cmd: bin,
          argv,
          timeoutMs: whisperTimeoutMs,
          sessionId,
          logger: this.logger,
          whisperBin: bin,
          modelPath: model,
          wavPath,
          wavBytes: wavStat.size
        });
      } catch (err) {
        const code = errorCodeOf(err) ?? "STT_REQUEST_FAILED";
        if (code !== "STT_REQUEST_FAILED") throw err;
        const e = errWithCode(
          `whisper.cpp STT failed: ${err instanceof Error ? err.message : String(err)}`,
          "STT_REQUEST_FAILED",
          err
        );
        this.sttError("stt_engine_failed", { sessionId, whisperBin: bin }, err);
        throw e;
      }

      const resolveTranscriptText = async (): Promise<{ text: string; source: string }> => {
        const tryRead = async (p: string): Promise<string> => {
          try {
            const raw = await fs.readFile(p, "utf8");
            return raw.replace(/^\uFEFF/, "").trim();
          } catch {
            return "";
          }
        };

        let text = await tryRead(outPath);
        if (text) return { text, source: "out.txt" };

        const names = await fs.readdir(dir).catch(() => [] as string[]);
        this.logger.log(`[STT] out.txt empty/missing; dir listing sessionId=${sessionId} files=${names.join(",") || "(none)"}`);
        for (const n of names) {
          if (!n.toLowerCase().endsWith(".txt")) continue;
          const alt = join(dir, n);
          text = await tryRead(alt);
          if (text) {
            this.logger.log(`[STT] using alternate txt sessionId=${sessionId} path=${alt}`);
            return { text, source: alt };
          }
        }

        const fromSegErr = extractTranscriptFromWhisperSegments(whisperOut.stderr);
        const fromSegOut = extractTranscriptFromWhisperSegments(whisperOut.stdout);
        const mergedSeg = (fromSegErr || fromSegOut).trim();
        if (mergedSeg) {
          this.logger.log(`[STT] transcript from segment lines sessionId=${sessionId} len=${mergedSeg.length}`);
          return { text: mergedSeg, source: "stderr/stdout_segments" };
        }

        const plain = extractPlainTranscriptCandidate(whisperOut.stdout, whisperOut.stderr);
        if (plain) {
          this.logger.log(`[STT] transcript from plain I/O sessionId=${sessionId} len=${plain.length}`);
          return { text: plain, source: "plain_io" };
        }

        return { text: "", source: "none" };
      };

      const resolved = await resolveTranscriptText();
      const text = resolved.text.trim();
      const sttTotalMs = Date.now() - requestReceivedAtMs;
      const wavDurationMs = estimateWavDurationMs(wavStat.size);
      this.logger.log(
        `[malv-voice] stt response sessionId=${sessionId} textLen=${text.length} source=${resolved.source} wavDurationMs=${wavDurationMs} whisperWallMs=${whisperOut.durationMs} sttTotalMs=${sttTotalMs}`
      );
      this.sttLog("stt_result_text", { sessionId, textLen: text.length, transcriptText: text, source: resolved.source });

      if (!text) {
        if (whisperOut.exitCode !== 0) {
          const e = errWithCode("whisper.cpp produced no transcript and exited non-zero (see logs)", "STT_PROCESS_EXIT_NONZERO");
          throw e;
        }
        const emptyErr = errWithCode(
          `whisper.cpp returned empty transcript (sources: out.txt, segment lines, plain I/O; exit=${whisperOut.exitCode})`,
          "STT_EMPTY_RESULT"
        );
        this.sttError(
          "stt_empty_transcript",
          {
            sessionId,
            whisperBin: bin,
            outPath,
            exitCode: whisperOut.exitCode,
            stderrChars: whisperOut.stderr.length,
            stdoutChars: whisperOut.stdout.length
          },
          emptyErr
        );
        throw emptyErr;
      }

      return {
        text,
        diagnostics: {
          wavDurationMs,
          whisperWallMs: whisperOut.durationMs,
          sttTotalMs,
          language,
          modelPath: model
        }
      };
    } catch (err) {
      this.sttError("stt_transcription_failed", { sessionId, mimeType, code: errorCodeOf(err) ?? null }, err);
      throw err;
    } finally {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
  }
}

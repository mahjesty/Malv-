import { Injectable, Logger } from "@nestjs/common";
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

/**
 * Thin STT facade for HTTP voice-test and future non-socket flows.
 * Logs: audio received (caller), transcription started/completed/failure, final text.
 */
@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);

  constructor(private readonly localStt: LocalSttService) {}

  async transcribeUtterance(args: {
    audioBytes: Buffer;
    mimeType: string;
    sessionId: string;
    userId: string;
  }): Promise<
    | { ok: true; text: string; diagnostics?: { wavDurationMs?: number; whisperWallMs?: number } }
    | { ok: false; errorCode: string; message: string }
  > {
    const { audioBytes, mimeType, sessionId, userId } = args;
    this.logger.log(
      `[malv-voice-test] transcription_started userId=${userId} sessionId=${sessionId} bytes=${audioBytes.length} mime=${mimeType}`
    );
    try {
      const res = await this.localStt.transcribeAudio({
        audioBytes,
        mimeType,
        language: null,
        sessionId
      });
      const text = (res.text ?? "").trim();
      this.logger.log(`[malv-voice-test] transcription_completed sessionId=${sessionId} textLen=${text.length}`);
      this.logger.log(`[malv-voice-test] final_transcript sessionId=${sessionId} text=${JSON.stringify(text)}`);
      return { ok: true, text, diagnostics: res.diagnostics };
    } catch (e) {
      const code = errorCodeOf(e) ?? "STT_REQUEST_FAILED";
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `[malv-voice-test] transcription_failure sessionId=${sessionId} code=${code}`,
        formatErrorForLog(e)
      );
      return { ok: false, errorCode: code, message: msg };
    }
  }
}

import { Injectable, Logger } from "@nestjs/common";
import type { BeastInferenceResponse } from "./client/beast-worker.client";

const EMERGENCY_LINE =
  "MALV fallback brain is active. Private inference did not return usable text; the control plane is still up and listening.";

/**
 * API-local MALV operator when beast-worker is unreachable, errors, or returns empty output.
 * Always returns non-empty, structured, context-aware text.
 */
@Injectable()
export class MalvOperatorFallbackBrainService {
  private readonly logger = new Logger(MalvOperatorFallbackBrainService.name);

  synthesize(args: {
    userMessage: string;
    classifiedMode: "light" | "beast";
    workerError?: string;
  }): BeastInferenceResponse {
    const trimmed = args.userMessage.trim();
    const topic = trimmed.slice(0, 400) || "(empty message)";
    const topicDisplay = topic.length > 280 ? topic.slice(0, 280) + "…" : topic;

    const workerNote = args.workerError
      ? `Transport / worker: ${args.workerError.replace(/\s+/g, " ").slice(0, 240)}`
      : "The worker response had no usable body for this turn.";

    const reply = [
      "### MALV operator (fallback path)",
      "",
      "Status: control plane online; model output missing or unreachable. This reply is generated on the API so your thread does not go silent.",
      "",
      "### What you sent",
      topicDisplay,
      "",
      "### Diagnosis",
      workerNote,
      "",
      "### Routing",
      `Classified mode for this turn: ${args.classifiedMode}.`,
      "",
      "### Bring private inference online",
      "1. Run the worker: from repo root `npm run dev -w @malv/beast-worker` (default port 9090).",
      "2. Point the API at it: `BEAST_WORKER_BASE_URL` (e.g. http://127.0.0.1:9090).",
      "3. Bind weights: set `MALV_MODEL_PATH` in `.env` to local weights or a Hugging Face model id, then restart the worker.",
      "4. If `BEAST_WORKER_API_KEY` is set, use the same key on API and worker.",
      "",
      "When the worker answers successfully, this same conversation id and client keep working unchanged.",
      "",
      "— MALV"
    ].join("\n");

    const safeReply = reply.trim().length > 0 ? reply : EMERGENCY_LINE;

    this.logger.log(`[MALV BRAIN] fallback invoked classifiedMode=${args.classifiedMode} replyLen=${safeReply.length}`);

    return {
      reply: safeReply,
      meta: {
        malvReplySource: "api_operator_fallback_brain",
        malvBrainDirectiveVersion: "2",
        classifiedMode: args.classifiedMode,
        workerError: args.workerError ?? null
      }
    };
  }
}

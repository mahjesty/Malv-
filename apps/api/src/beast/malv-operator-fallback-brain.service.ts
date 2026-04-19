import { Injectable, Logger } from "@nestjs/common";
import type { BeastInferenceResponse } from "./client/beast-worker.client";
import { MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE } from "./malv-chat-agent-unavailable.constants";

/**
 * API-local reply when beast-worker is unreachable, errors, returns empty output, or phased steps fail.
 * User text is a single professional notice; diagnostics are logged only.
 */
@Injectable()
export class MalvOperatorFallbackBrainService {
  private readonly logger = new Logger(MalvOperatorFallbackBrainService.name);

  synthesize(args: {
    userMessage: string;
    classifiedMode: "light" | "beast";
    /** Internal-only: transport, HTTP, provider, timeout, model-unavailable, etc. Never echoed to chat. */
    workerError?: string;
    correlationId?: string;
  }): BeastInferenceResponse {
    const internal = (args.workerError ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
    const correlation = args.correlationId ?? "none";
    this.logger.warn(
      `[MALV BRAIN] operator fallback user-notice correlationId=${correlation} classifiedMode=${args.classifiedMode} userMessageLen=${args.userMessage.length}` +
        (internal ? ` internalSummary=${internal}` : "")
    );

    return {
      reply: MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE,
      meta: {
        malvReplySource: "api_operator_fallback_brain",
        malvBrainDirectiveVersion: "3",
        classifiedMode: args.classifiedMode,
        malvAgentUnavailableNotice: true
      }
    };
  }
}

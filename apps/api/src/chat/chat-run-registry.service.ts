import { Injectable, Logger } from "@nestjs/common";

type TurnRegistration = {
  abortController: AbortController;
  userId: string;
  cancelled: boolean;
};

/**
 * Tracks in-flight chat turns for cooperative cancellation (fetch abort + chunk loop stop).
 */
@Injectable()
export class ChatRunRegistryService {
  private readonly logger = new Logger(ChatRunRegistryService.name);
  private readonly byAssistantMessageId = new Map<string, TurnRegistration>();

  registerTurn(args: { assistantMessageId: string; userId: string; abortController: AbortController }) {
    this.byAssistantMessageId.set(args.assistantMessageId, {
      abortController: args.abortController,
      userId: args.userId,
      cancelled: false
    });
    this.logger.log(
      `[MALV RUNTIME] run registry register assistantMessageId=${args.assistantMessageId} userId=${args.userId}`
    );
  }

  unregisterTurn(assistantMessageId: string) {
    this.byAssistantMessageId.delete(assistantMessageId);
    this.logger.log(`[MALV RUNTIME] run registry unregister assistantMessageId=${assistantMessageId}`);
  }

  requestCancel(args: { assistantMessageId: string; userId: string }): boolean {
    const reg = this.byAssistantMessageId.get(args.assistantMessageId);
    if (!reg || reg.userId !== args.userId) {
      this.logger.warn(
        `[MALV RUNTIME] cancel requested but no active turn assistantMessageId=${args.assistantMessageId}`
      );
      return false;
    }
    reg.cancelled = true;
    try {
      reg.abortController.abort();
    } catch (e) {
      this.logger.warn(`[MALV RUNTIME] abort signal error ${e instanceof Error ? e.message : String(e)}`);
    }
    this.logger.log(
      `[MALV RUNTIME] cancel propagated assistantMessageId=${args.assistantMessageId} userId=${args.userId}`
    );
    return true;
  }

  isCancelled(assistantMessageId: string): boolean {
    return this.byAssistantMessageId.get(assistantMessageId)?.cancelled ?? false;
  }

  getAbortSignal(assistantMessageId: string): AbortSignal | undefined {
    return this.byAssistantMessageId.get(assistantMessageId)?.abortController.signal;
  }
}

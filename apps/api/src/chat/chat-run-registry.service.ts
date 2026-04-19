import { Injectable, Logger } from "@nestjs/common";
import { MalvDistributedCoordinationService } from "../common/malv-distributed-coordination.service";

type TurnRegistration = {
  abortController: AbortController;
  userId: string;
  cancelled: boolean;
};

type CancelRequestResult = {
  ok: boolean;
  localAbortApplied: boolean;
  distributedMarkerRecorded: boolean;
};

/**
 * Tracks in-flight chat turns for cooperative cancellation (fetch abort + chunk loop stop).
 */
@Injectable()
export class ChatRunRegistryService {
  private readonly logger = new Logger(ChatRunRegistryService.name);
  private readonly byAssistantMessageId = new Map<string, TurnRegistration>();

  constructor(private readonly distributed: MalvDistributedCoordinationService) {}

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

  async unregisterTurn(assistantMessageId: string) {
    this.byAssistantMessageId.delete(assistantMessageId);
    await this.distributed.clearCancelRequested(assistantMessageId);
    this.logger.log(`[MALV RUNTIME] run registry unregister assistantMessageId=${assistantMessageId}`);
  }

  async requestCancel(args: { assistantMessageId: string; userId: string }): Promise<CancelRequestResult> {
    const distributedMarkerRecorded = await this.distributed.recordCancelRequested(args.assistantMessageId);
    const reg = this.byAssistantMessageId.get(args.assistantMessageId);
    if (!reg || reg.userId !== args.userId) {
      this.logger.warn(
        `[MALV RUNTIME] cancel requested but no local in-flight turn assistantMessageId=${args.assistantMessageId}`
      );
      return { ok: false, localAbortApplied: false, distributedMarkerRecorded };
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
    return { ok: true, localAbortApplied: true, distributedMarkerRecorded };
  }

  async isCancelled(assistantMessageId: string): Promise<boolean> {
    const local = this.byAssistantMessageId.get(assistantMessageId)?.cancelled ?? false;
    if (local) return true;
    return this.distributed.isCancelRequested(assistantMessageId);
  }

  getAbortSignal(assistantMessageId: string): AbortSignal | undefined {
    return this.byAssistantMessageId.get(assistantMessageId)?.abortController.signal;
  }
}

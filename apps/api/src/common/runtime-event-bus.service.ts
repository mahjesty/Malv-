import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MalvDistributedCoordinationService } from "./malv-distributed-coordination.service";

export type RuntimeTruthEvent =
  | {
      source: "sandbox";
      at?: number;
      sandboxRunId: string;
      aiJobId?: string | null;
      commandId?: string | null;
      status: string;
      phase?: string;
      message?: string;
    }
  | {
      source: "job";
      at?: number;
      aiJobId: string;
      sandboxRunId?: string | null;
      status: string;
      progress?: number;
      message?: string;
    };

type Handler = (event: RuntimeTruthEvent) => void;

@Injectable()
export class RuntimeEventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Set<Handler>();
  private unsubscribeDistributed: (() => Promise<void>) | null = null;

  constructor(private readonly distributed: MalvDistributedCoordinationService) {}

  async onModuleInit() {
    this.unsubscribeDistributed = await this.distributed.subscribe("malv:runtime:event_bus", (event) => {
      const normalized = event as RuntimeTruthEvent;
      for (const handler of this.handlers) handler(normalized);
    });
  }

  onModuleDestroy() {
    void this.unsubscribeDistributed?.();
  }

  publish(event: RuntimeTruthEvent) {
    void this.distributed.publish("malv:runtime:event_bus", event as unknown as Record<string, unknown>);
    for (const handler of this.handlers) handler(event);
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}


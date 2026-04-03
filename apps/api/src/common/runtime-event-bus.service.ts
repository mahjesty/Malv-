import { Injectable } from "@nestjs/common";

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
export class RuntimeEventBusService {
  private readonly handlers = new Set<Handler>();

  publish(event: RuntimeTruthEvent) {
    for (const handler of this.handlers) handler(event);
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}


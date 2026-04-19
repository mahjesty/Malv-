import { forwardRef, Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { StudioRuntimeEvent, StudioRuntimeEventMapper } from "./studio-runtime-event.mapper";
import { RuntimeEventBusService } from "../common/runtime-event-bus.service";
import { MalvDistributedCoordinationService } from "../common/malv-distributed-coordination.service";

type StudioSessionCorrelation = {
  sessionId: string;
  sandboxRunId?: string | null;
  aiJobId?: string | null;
  versionId?: string | null;
};

@Injectable()
export class StudioSessionStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly mapper = new StudioRuntimeEventMapper();
  private readonly correlations = new Map<string, StudioSessionCorrelation>();
  private readonly replayEvents = new Map<string, StudioRuntimeEvent[]>();
  private readonly replayBounds = { maxEvents: 120 };
  private unsubscribeRuntime: (() => void) | null = null;
  private unsubscribeStudioDistributed: (() => Promise<void>) | null = null;

  constructor(
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly runtimeBus: RuntimeEventBusService,
    private readonly distributed: MalvDistributedCoordinationService
  ) {}

  async onModuleInit() {
    this.unsubscribeRuntime = this.runtimeBus.subscribe((raw) => {
      const sessionId = this.resolveSessionIdFromRaw(raw);
      if (!sessionId) return;
      const mapped = this.mapper.mapRuntimeTruthRaw({
        sessionId,
        source: raw.source,
        status: raw.status,
        message: raw.message,
        progress: "progress" in raw ? raw.progress : undefined
      });
      for (const event of mapped) this.emit(event);
    });
    this.unsubscribeStudioDistributed = await this.distributed.subscribe("malv:studio:event_stream", (payload) => {
      const event = payload.event as StudioRuntimeEvent | undefined;
      if (!event || typeof event.sessionId !== "string") return;
      this.pushReplay(event.sessionId, event);
      this.realtime.emitToStudioSession(event.sessionId, "studio:runtime_event", {
        ...event,
        correlation: this.correlations.get(event.sessionId) ?? { sessionId: event.sessionId }
      });
    });
  }

  onModuleDestroy() {
    if (this.unsubscribeRuntime) this.unsubscribeRuntime();
    void this.unsubscribeStudioDistributed?.();
    this.unsubscribeRuntime = null;
    this.unsubscribeStudioDistributed = null;
  }

  correlate(args: StudioSessionCorrelation) {
    const current = this.correlations.get(args.sessionId) ?? { sessionId: args.sessionId };
    this.correlations.set(args.sessionId, {
      ...current,
      sandboxRunId: args.sandboxRunId ?? current.sandboxRunId ?? null,
      aiJobId: args.aiJobId ?? current.aiJobId ?? null,
      versionId: args.versionId ?? current.versionId ?? null
    });
  }

  getCorrelation(sessionId: string): StudioSessionCorrelation | null {
    return this.correlations.get(sessionId) ?? null;
  }

  emit(event: StudioRuntimeEvent) {
    const correlation = this.correlations.get(event.sessionId) ?? { sessionId: event.sessionId };
    this.pushReplay(event.sessionId, event);
    void this.distributed.appendStudioReplay(event.sessionId, event as unknown as Record<string, unknown>, this.replayBounds.maxEvents);
    void this.distributed.publish("malv:studio:event_stream", { event });
    this.realtime.emitToStudioSession(event.sessionId, "studio:runtime_event", {
      ...event,
      correlation
    });
  }

  async replayForSession(sessionId: string) {
    const local = [...(this.replayEvents.get(sessionId) ?? [])];
    const distributedReplay = await this.distributed.readStudioReplay(sessionId);
    const distributed = distributedReplay
      .map((event) => event as StudioRuntimeEvent)
      .filter((event) => event && event.sessionId === sessionId && typeof event.type === "string");
    const merged = [...local, ...distributed];
    merged.sort((a, b) => {
      const atDelta = a.at - b.at;
      if (atDelta !== 0) return atDelta;
      const aKey = this.replayIdentityKey(a);
      const bKey = this.replayIdentityKey(b);
      return aKey.localeCompare(bKey);
    });
    const deduped: StudioRuntimeEvent[] = [];
    const seen = new Set<string>();
    for (const event of merged) {
      const key = this.replayIdentityKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(event);
    }
    return deduped.slice(-this.replayBounds.maxEvents);
  }

  emitPreviewRefining(sessionId: string) {
    this.emit(this.mapper.mapPreviewState({ sessionId, state: "refining" }));
  }

  emitPreviewReady(sessionId: string) {
    this.emit(this.mapper.mapPreviewState({ sessionId, state: "ready" }));
  }

  emitPreviewError(sessionId: string, reason: string) {
    this.emit(this.mapper.mapPreviewState({ sessionId, state: "error", reason }));
  }

  emitPhaseUpdate(sessionId: string, phaseId: string, status: string, detail?: string) {
    this.emit(this.mapper.mapPhaseUpdate({ sessionId, phaseId, status, detail }));
  }

  emitConsoleInfo(sessionId: string, group: string, message: string) {
    this.emit(this.mapper.mapConsoleEvent({ sessionId, severity: "info", group, message }));
  }

  emitTerminal(sessionId: string, command: string, group: string, success: boolean) {
    this.emit(this.mapper.mapTerminalEvent({ sessionId, command, group, success }));
  }

  emitApplyState(
    sessionId: string,
    state: "pending_approval" | "applying" | "applied" | "reverted" | "failed",
    meta?: { riskLevel?: string; confidence?: string; message?: string }
  ) {
    this.emit(
      this.mapper.mapApplyState({
        sessionId,
        state,
        riskLevel: meta?.riskLevel,
        confidence: meta?.confidence,
        message: meta?.message
      })
    );
  }

  private resolveSessionIdFromRaw(raw: { sandboxRunId?: string | null; aiJobId?: string | null }) {
    for (const [sessionId, corr] of this.correlations.entries()) {
      if (raw.sandboxRunId && corr.sandboxRunId === raw.sandboxRunId) return sessionId;
      if (raw.aiJobId && corr.aiJobId === raw.aiJobId) return sessionId;
    }
    return null;
  }

  private pushReplay(sessionId: string, event: StudioRuntimeEvent) {
    const next = [...(this.replayEvents.get(sessionId) ?? []), event];
    if (next.length > this.replayBounds.maxEvents) {
      this.replayEvents.set(sessionId, next.slice(next.length - this.replayBounds.maxEvents));
      return;
    }
    this.replayEvents.set(sessionId, next);
  }

  private replayIdentityKey(event: StudioRuntimeEvent): string {
    return `${event.sessionId}|${event.type}|${event.at}|${this.stableStringify(event.payload)}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(obj[key])}`).join(",")}}`;
  }
}


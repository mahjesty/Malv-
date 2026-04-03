import { forwardRef, Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { StudioRuntimeEvent, StudioRuntimeEventMapper } from "./studio-runtime-event.mapper";
import { RuntimeEventBusService } from "../common/runtime-event-bus.service";

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

  constructor(
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly runtimeBus: RuntimeEventBusService
  ) {}

  onModuleInit() {
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
  }

  onModuleDestroy() {
    if (this.unsubscribeRuntime) this.unsubscribeRuntime();
    this.unsubscribeRuntime = null;
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
    this.realtime.emitToStudioSession(event.sessionId, "studio:runtime_event", {
      ...event,
      correlation
    });
  }

  replayForSession(sessionId: string) {
    return [...(this.replayEvents.get(sessionId) ?? [])].sort((a, b) => a.at - b.at);
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
}


import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  malvLoadTestModeEnabled,
  malvTraceVerboseEnabled,
  malvValidationModeEnabled
} from "./malv-validation-flags.util";

type MalvValidationTransport = "http" | "ws";

type MalvValidationTurnState = {
  runId: string;
  requestReceivedAtMs: number;
  transport: MalvValidationTransport;
  promptClass?: string | null;
  pathType?: string | null;
  firstVisibleOutputAtMs?: number;
};

type MalvValidationTurnRecord = {
  runId: string;
  requestReceivedAtMs: number;
  totalCompletionAtMs: number;
  totalDurationMs: number;
  firstVisibleOutputAtMs: number | null;
  timeToFirstVisibleOutputMs: number | null;
  transport: MalvValidationTransport;
  promptClass: string | null;
  pathType: string | null;
  reflexHit: boolean;
  selectedCognitiveTier: number | null;
  tierCorrectionTriggered: boolean;
  clarificationTriggered: boolean;
  refinementTriggered: boolean;
  phasedPlanned: boolean;
  learningHydrationWaitDurationMs: number | null;
  learningSnapshotScope: "global_only" | "user_personalized" | "unknown";
  localInferenceUsed: boolean;
  workerInferenceUsed: boolean;
  fallbackOccurred: boolean;
  policyBlocked: boolean;
  interruptedOrCancelled: boolean;
  deferredLearningCapture: "success" | "failed" | "unknown";
};

@Injectable()
export class MalvValidationTelemetryService {
  private readonly logger = new Logger(MalvValidationTelemetryService.name);
  private readonly activeTurns = new Map<string, MalvValidationTurnState>();
  private readonly recentTurns: MalvValidationTurnRecord[] = [];
  private readonly counters = {
    total: 0,
    reflexHit: 0,
    phasedPlanned: 0,
    fallbackOccurred: 0,
    policyBlocked: 0,
    interruptedOrCancelled: 0,
    deferredLearningCaptureFailed: 0
  };

  constructor(private readonly cfg: ConfigService) {}

  private validationMode(): boolean {
    return malvValidationModeEnabled((k) => this.cfg.get<string>(k));
  }

  startTurn(args: {
    runId: string;
    transport: MalvValidationTransport;
    requestReceivedAtMs?: number;
    promptClass?: string | null;
    pathType?: string | null;
  }): void {
    if (!this.validationMode()) return;
    this.activeTurns.set(args.runId, {
      runId: args.runId,
      requestReceivedAtMs: args.requestReceivedAtMs ?? Date.now(),
      transport: args.transport,
      promptClass: args.promptClass ?? null,
      pathType: args.pathType ?? null
    });
  }

  markFirstVisibleOutput(runId: string, transport: MalvValidationTransport): void {
    if (!this.validationMode()) return;
    const existing = this.activeTurns.get(runId);
    if (!existing) return;
    if (existing.firstVisibleOutputAtMs != null) return;
    existing.firstVisibleOutputAtMs = Date.now();
    existing.transport = transport;
    this.activeTurns.set(runId, existing);
  }

  completeTurn(args: {
    runId: string;
    transport: MalvValidationTransport;
    meta?: Record<string, unknown>;
    requestReceivedAtMs?: number;
    promptClass?: string | null;
    pathType?: string | null;
  }): void {
    if (!this.validationMode()) return;
    const now = Date.now();
    const m = (args.meta ?? {}) as Record<string, unknown>;
    const trace = ((m.malvInferenceTrace ?? {}) as Record<string, unknown>) ?? {};
    const routing = ((trace.malvRouting ?? {}) as Record<string, unknown>) ?? {};
    const retry = ((trace.malvResponseRetry ?? {}) as Record<string, unknown>) ?? {};

    const active = this.activeTurns.get(args.runId);
    const requestReceivedAtMs = active?.requestReceivedAtMs ?? args.requestReceivedAtMs ?? now;
    const firstVisibleOutputAtMs = active?.firstVisibleOutputAtMs ?? null;
    const promptClass = active?.promptClass ?? args.promptClass ?? null;
    const pathType = active?.pathType ?? args.pathType ?? null;

    const selectedTierRaw = trace.malvCognitiveEffortTier;
    const selectedCognitiveTier = typeof selectedTierRaw === "number" ? selectedTierRaw : null;
    const learningScopeRaw = trace.malvLearningSnapshotScope;
    const learningSnapshotScope =
      learningScopeRaw === "global_only" || learningScopeRaw === "user_personalized"
        ? learningScopeRaw
        : ("unknown" as const);
    const deferredRaw = trace.malvDeferredLearningCapture;
    const deferredLearningCapture =
      deferredRaw === "success" || deferredRaw === "failed" ? deferredRaw : ("unknown" as const);

    const transportFromTrace = typeof trace.malvChatInferenceTransport === "string" ? trace.malvChatInferenceTransport : "";
    const record: MalvValidationTurnRecord = {
      runId: args.runId,
      requestReceivedAtMs,
      totalCompletionAtMs: now,
      totalDurationMs: Math.max(0, now - requestReceivedAtMs),
      firstVisibleOutputAtMs,
      timeToFirstVisibleOutputMs:
        firstVisibleOutputAtMs == null ? null : Math.max(0, firstVisibleOutputAtMs - requestReceivedAtMs),
      transport: active?.transport ?? args.transport,
      promptClass,
      pathType,
      reflexHit: Boolean(trace.malvReflexLane),
      selectedCognitiveTier,
      tierCorrectionTriggered: Boolean(trace.malvTierCorrection),
      clarificationTriggered: Boolean(m.malvAutonomousClarification || m.malvConfidenceClarification),
      refinementTriggered: Boolean(retry.triggered || m.malvConfidenceRefineAppend),
      phasedPlanned: Boolean(trace.malvServerPhasedPlanned),
      learningHydrationWaitDurationMs:
        typeof trace.malvLearningHydrationWaitMs === "number" ? trace.malvLearningHydrationWaitMs : null,
      learningSnapshotScope,
      localInferenceUsed: Boolean(trace.malvLocalInferenceUsed),
      workerInferenceUsed: transportFromTrace.includes("beast_worker"),
      fallbackOccurred: Boolean(m.malvUsedApiFallbackBrain || routing.malvFallbackUsed),
      policyBlocked: Boolean(m.policyDenied),
      interruptedOrCancelled: Boolean(m.malvReplySource === "interrupted" || m.malvTerminal === "interrupted"),
      deferredLearningCapture
    };

    this.activeTurns.delete(args.runId);
    this.recentTurns.push(record);
    if (this.recentTurns.length > 250) this.recentTurns.shift();

    this.counters.total += 1;
    if (record.reflexHit) this.counters.reflexHit += 1;
    if (record.phasedPlanned) this.counters.phasedPlanned += 1;
    if (record.fallbackOccurred) this.counters.fallbackOccurred += 1;
    if (record.policyBlocked) this.counters.policyBlocked += 1;
    if (record.interruptedOrCancelled) this.counters.interruptedOrCancelled += 1;
    if (record.deferredLearningCapture === "failed") this.counters.deferredLearningCaptureFailed += 1;

    const verbose = malvTraceVerboseEnabled((k) => this.cfg.get<string>(k));
    this.logger.log(
      JSON.stringify({
        tag: "malv.validation.turn",
        ...record,
        loadTestMode: malvLoadTestModeEnabled((k) => this.cfg.get<string>(k)),
        ...(verbose ? { malvValidationVerbose: true } : {})
      })
    );
  }

  getSummary() {
    return {
      validationModeEnabled: this.validationMode(),
      loadTestModeEnabled: malvLoadTestModeEnabled((k) => this.cfg.get<string>(k)),
      activeTurns: this.activeTurns.size,
      counters: { ...this.counters },
      recentTurns: [...this.recentTurns]
    };
  }
}

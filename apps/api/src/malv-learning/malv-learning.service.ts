import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { MalvControlledConfigEntity } from "../db/entities/malv-controlled-config.entity";
import { MalvLearningSignalEntity } from "../db/entities/malv-learning-signal.entity";
import {
  createEmptyMalvUserLearningProfilePayload,
  MalvUserLearningProfileEntity,
  type MalvUserLearningProfilePayload
} from "../db/entities/malv-user-learning-profile.entity";
import type { MalvCognitiveEffortTier } from "../beast/malv-cognitive-effort-tier";
import type { MalvIntentKind } from "../beast/intent-understanding.types";
import {
  buildLearningAdaptiveSnapshot,
  computeBiasesFromAggregate,
  mergeGlobalAndUserBiases,
  type MalvLearningAdaptiveSnapshot
} from "./malv-adaptive-thresholds.util";
import {
  detectClarificationFrustrationLoop,
  detectImmediateFollowupClarification,
  detectLikelyUserReask,
  detectUserCorrectionPhrase
} from "./malv-implicit-feedback.util";
import type { MalvLearningQueuedSignal, MalvLearningSignalContext } from "./malv-learning.types";
import { malvForceGlobalLearningOnly, malvSimulationEnabled } from "../common/malv-validation-flags.util";

const GLOBAL_AGG_CONFIG_KEY = "malv.phase4.global_aggregate";

function isMissingLearningTable(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const de = (err as QueryFailedError & { driverError?: { errno?: number } }).driverError;
  if (de?.errno === 1146) return true;
  return /malv_learning_signal|malv_user_learning_profile/i.test(String(err.message)) && /doesn't exist/i.test(String(err.message));
}

function malvLearningEnabled(cfg: ConfigService): boolean {
  const v = cfg.get<string>("MALV_LEARNING_ENABLED") ?? process.env.MALV_LEARNING_ENABLED;
  if (v == null || v === "") return true;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

function mergeLearningPayload(
  disk: MalvUserLearningProfilePayload,
  hot: MalvUserLearningProfilePayload
): MalvUserLearningProfilePayload {
  const fail: Record<string, number> = { ...disk.failurePatternCounts };
  for (const [k, v] of Object.entries(hot.failurePatternCounts)) {
    fail[k] = (fail[k] ?? 0) + v;
  }
  return {
    turns: disk.turns + hot.turns,
    tierUpgrade12: disk.tierUpgrade12 + hot.tierUpgrade12,
    tierDowngrade21: disk.tierDowngrade21 + hot.tierDowngrade21,
    refinementTriggered: disk.refinementTriggered + hot.refinementTriggered,
    driftSignals: disk.driftSignals + hot.driftSignals,
    lowResponseConf: disk.lowResponseConf + hot.lowResponseConf,
    clarificationReplies: disk.clarificationReplies + hot.clarificationReplies,
    userCorrectionHeuristic: disk.userCorrectionHeuristic + hot.userCorrectionHeuristic,
    userReask: disk.userReask + hot.userReask,
    clarificationLoop: disk.clarificationLoop + hot.clarificationLoop,
    executionMismatch: disk.executionMismatch + hot.executionMismatch,
    failurePatternCounts: fail
  };
}

export type MalvTurnLearningCaptureInput = {
  userId: string;
  runId: string;
  reflexLane: boolean;
  cognitiveTier: MalvCognitiveEffortTier;
  primaryIntent: MalvIntentKind | "unknown";
  message: string;
  ambiguity: boolean;
  memorySnippetCount: number;
  modelUsed: string | null;
  tierCorrection: { fromTier: MalvCognitiveEffortTier; toTier: MalvCognitiveEffortTier; reason: string } | null;
  responseConfidence: number;
  refinementTriggered: boolean;
  driftKind: string | null;
  replySource: string;
  priorUserMessages: string[];
  lastAssistantContent: string | null;
};

@Injectable()
export class MalvLearningService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MalvLearningService.name);
  private readonly queue: MalvLearningQueuedSignal[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private persistCounter = 0;
  private shuttingDown = false;

  private globalAgg: MalvUserLearningProfilePayload = createEmptyMalvUserLearningProfilePayload();
  private readonly userAgg = new Map<string, MalvUserLearningProfilePayload>();
  private readonly userHydrated = new Set<string>();
  /** Dedupes concurrent hydrations for the same user (chat bursts, snapshot + await). */
  private readonly userHydrateInFlight = new Map<string, Promise<void>>();
  private readonly dirtyUserIds = new Set<string>();

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(MalvLearningSignalEntity) private readonly signals: Repository<MalvLearningSignalEntity>,
    @InjectRepository(MalvUserLearningProfileEntity) private readonly userProfiles: Repository<MalvUserLearningProfileEntity>,
    @InjectRepository(MalvControlledConfigEntity) private readonly controlled: Repository<MalvControlledConfigEntity>
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      void this.hydrateGlobal();
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushSignalsNow(true);
    await this.persistAggregatesNow(true);
  }

  isEnabled(): boolean {
    return malvLearningEnabled(this.cfg);
  }

  /**
   * Phase 5 — first non-reflex turn after cold start: wait up to `budgetMs` for DB-backed user
   * aggregates to load. Deterministic contract: never blocks unbounded; if the budget elapses,
   * `snapshotForUser` still uses global aggregate + any in-memory hot path until hydration finishes.
   */
  async awaitLearningHydrationForTurn(userId: string, budgetMs: number): Promise<void> {
    if (!this.isEnabled() || budgetMs <= 0) return;
    if (this.userHydrated.has(userId)) return;
    await Promise.race([this.hydrateUser(userId), this.sleep(budgetMs)]);
  }

  /** Hot path: in-memory only, never awaits I/O. */
  snapshotForUser(userId: string): MalvLearningAdaptiveSnapshot {
    if (!this.isEnabled()) {
      return buildLearningAdaptiveSnapshot({
        tierBias: 0,
        clarificationBias: 0,
        memoryBias: 0,
        verbosityBias: 0
      });
    }
    if (!this.userHydrated.has(userId)) {
      void this.hydrateUser(userId);
    }
    const g = computeBiasesFromAggregate(this.globalAgg);
    if (malvForceGlobalLearningOnly((k) => this.cfg.get<string>(k))) {
      return buildLearningAdaptiveSnapshot(g);
    }
    const uPayload = this.userAgg.get(userId) ?? createEmptyMalvUserLearningProfilePayload();
    const u = computeBiasesFromAggregate(uPayload);
    const merged = mergeGlobalAndUserBiases(g, u);
    return buildLearningAdaptiveSnapshot(merged);
  }

  snapshotForUserWithSource(userId: string): {
    snapshot: MalvLearningAdaptiveSnapshot;
    scope: "global_only" | "user_personalized";
  } {
    const snapshot = this.snapshotForUser(userId);
    if (malvForceGlobalLearningOnly((k) => this.cfg.get<string>(k))) {
      return { snapshot, scope: "global_only" };
    }
    return { snapshot, scope: this.userHydrated.has(userId) ? "user_personalized" : "global_only" };
  }

  /**
   * Deferred capture — must not block the chat response path.
   */
  scheduleTurnCapture(input: MalvTurnLearningCaptureInput): boolean {
    if (!this.isEnabled()) return false;
    if (malvSimulationEnabled((k) => this.cfg.get<string>(k), "MALV_SIMULATE_DEFERRED_LEARNING_CAPTURE_FAILURE")) {
      this.log.warn(`[MALV_LEARNING] simulated deferred capture failure runId=${input.runId}`);
      return false;
    }
    setImmediate(() => {
      try {
        this.applyTurnCapture(input);
        this.scheduleFlush();
      } catch (e) {
        this.log.warn(`[MALV_LEARNING] capture failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return true;
  }

  private applyTurnCapture(input: MalvTurnLearningCaptureInput): void {
    const uid = input.userId;
    this.dirtyUserIds.add(uid);

    const iso = new Date().toISOString();
    const baseContext = (extra: Partial<MalvLearningSignalContext> = {}): MalvLearningSignalContext & { timestamp: string } => ({
      tier: input.cognitiveTier,
      intentType: input.reflexLane ? "reflex_skipped" : String(input.primaryIntent),
      messageLength: input.message.trim().length,
      ambiguity: input.ambiguity,
      memoryUsed: input.memorySnippetCount > 0,
      modelUsed: input.modelUsed,
      timestamp: iso,
      ...extra
    });

    const push = (eventType: MalvLearningQueuedSignal["eventType"], ctx: MalvLearningSignalContext & { timestamp: string }) => {
      this.queue.push({ eventType, userId: uid, context: ctx });
    };

    const bump = (p: MalvUserLearningProfilePayload) => {
      p.turns += 1;
    };

    bump(this.globalAgg);
    let userPayload = this.userAgg.get(uid);
    if (!userPayload) {
      userPayload = createEmptyMalvUserLearningProfilePayload();
      this.userAgg.set(uid, userPayload);
    }
    bump(userPayload);

    const clar =
      input.replySource === "malv_autonomous_clarification" || input.replySource === "malv_confidence_clarification";
    if (clar) {
      this.globalAgg.clarificationReplies += 1;
      userPayload.clarificationReplies += 1;
    }

    const tc = input.tierCorrection;
    if (tc) {
      if (tc.fromTier === 1 && tc.toTier === 2) {
        this.globalAgg.tierUpgrade12 += 1;
        userPayload.tierUpgrade12 += 1;
        push("tier_upgrade", baseContext({ patternHints: ["wrong_tier_initial", tc.reason] }));
        this.bumpFailure(this.globalAgg, "tier_upgrade");
        this.bumpFailure(userPayload, "tier_upgrade");
      } else if (tc.fromTier === 2 && tc.toTier === 1) {
        this.globalAgg.tierDowngrade21 += 1;
        userPayload.tierDowngrade21 += 1;
        push("tier_downgrade", baseContext({ patternHints: ["over_engineered_shape", tc.reason] }));
        this.bumpFailure(this.globalAgg, "tier_downgrade");
        this.bumpFailure(userPayload, "tier_downgrade");
      }
    }

    if (!input.reflexLane && input.responseConfidence < 0.34) {
      this.globalAgg.lowResponseConf += 1;
      userPayload.lowResponseConf += 1;
      push("low_confidence", baseContext({ patternHints: ["low_response_confidence"] }));
      this.bumpFailure(this.globalAgg, "low_response_confidence");
      this.bumpFailure(userPayload, "low_response_confidence");
    }

    if (input.refinementTriggered) {
      this.globalAgg.refinementTriggered += 1;
      userPayload.refinementTriggered += 1;
      push("refinement", baseContext({ patternHints: ["weak_response_shape"] }));
      this.bumpFailure(this.globalAgg, "refinement");
      this.bumpFailure(userPayload, "refinement");
    }

    if (input.driftKind && input.driftKind !== "none") {
      this.globalAgg.driftSignals += 1;
      userPayload.driftSignals += 1;
      push("intent_drift", baseContext({ patternHints: [`drift_${input.driftKind}`] }));
      this.bumpFailure(this.globalAgg, `drift_${input.driftKind}`);
      this.bumpFailure(userPayload, `drift_${input.driftKind}`);
      if (input.driftKind === "possible_execution_intent") {
        push("execution_mismatch", baseContext({ patternHints: ["answer_vs_action"] }));
        this.globalAgg.executionMismatch += 1;
        userPayload.executionMismatch += 1;
      }
    }

    if (detectUserCorrectionPhrase(input.message)) {
      this.globalAgg.userCorrectionHeuristic += 1;
      userPayload.userCorrectionHeuristic += 1;
      push("user_correction", baseContext({ patternHints: ["user_explicit_fix"] }));
    }

    if (detectLikelyUserReask(input.message, input.priorUserMessages)) {
      this.globalAgg.userReask += 1;
      userPayload.userReask += 1;
      push("user_reask", baseContext({ patternHints: ["repeat_question"] }));
    }

    if (detectClarificationFrustrationLoop(input.message, input.lastAssistantContent)) {
      this.globalAgg.clarificationLoop += 1;
      userPayload.clarificationLoop += 1;
      push("clarification_loop", baseContext({ patternHints: ["clarify_then_correct"] }));
    }

    if (detectImmediateFollowupClarification(input.message)) {
      this.bumpFailure(this.globalAgg, "followup_clarify");
      this.bumpFailure(userPayload, "followup_clarify");
    }

    if (this.shouldSampleThresholdLog()) {
      const snap = this.snapshotForUser(uid);
      this.log.log(
        `[MALV_LEARNING_SAMPLE] user=${uid.slice(0, 8)}… eff_upgradeIntentMax=${snap.tierThresholds.upgradeIntentMax.toFixed(3)} eff_softClar=${snap.tierThresholds.softClarificationIntentMax.toFixed(3)} memLen=${snap.tierThresholds.memoryMinimalLengthThreshold}`
      );
    }

    this.persistCounter += 1;
    if (this.persistCounter % 40 === 0) {
      void this.persistAggregatesNow(false);
    }
  }

  private shouldSampleThresholdLog(): boolean {
    return Math.random() < 0.02;
  }

  private bumpFailure(p: MalvUserLearningProfilePayload, key: string) {
    const next = { ...p.failurePatternCounts };
    next[key] = (next[key] ?? 0) + 1;
    const keys = Object.keys(next);
    if (keys.length > 28) {
      const sorted = keys.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
      for (const k of sorted.slice(0, keys.length - 24)) delete next[k];
    }
    p.failurePatternCounts = next;
  }

  private scheduleFlush(): void {
    if (this.shuttingDown) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushSignalsNow(false);
    }, 400);
  }

  private async flushSignalsNow(drainAll: boolean): Promise<void> {
    do {
      if (this.queue.length === 0) return;
      const take = drainAll ? this.queue.length : Math.min(200, this.queue.length);
      const batch = this.queue.splice(0, take);
      const rows = batch.map((s) => ({
        id: randomUUID(),
        userId: s.userId,
        eventType: s.eventType,
        contextJson: s.context as Record<string, unknown>
      }));
      try {
        await this.signals.insert(rows as never);
      } catch (e) {
        if (isMissingLearningTable(e)) {
          this.log.warn("[MALV_LEARNING] signal table missing; run migrations. Dropping batch.");
          return;
        }
        this.log.warn(`[MALV_LEARNING] signal insert failed: ${e instanceof Error ? e.message : String(e)}`);
        this.queue.unshift(...batch);
        return;
      }
    } while (drainAll && this.queue.length > 0);
  }

  private async persistAggregatesNow(forceAllUsers: boolean): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const existing = await this.controlled.findOne({ where: { configKey: GLOBAL_AGG_CONFIG_KEY } });
      if (existing) {
        existing.valueJson = this.globalAgg as unknown as Record<string, unknown>;
        await this.controlled.save(existing);
      } else {
        await this.controlled.save(
          this.controlled.create({
            configKey: GLOBAL_AGG_CONFIG_KEY,
            valueJson: this.globalAgg as unknown as Record<string, unknown>
          })
        );
      }
    } catch (e) {
      if (!isMissingLearningTable(e)) {
        this.log.warn(`[MALV_LEARNING] global persist failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const targets = forceAllUsers ? [...this.userAgg.keys()] : [...this.dirtyUserIds];
    if (!forceAllUsers) this.dirtyUserIds.clear();

    for (const userId of targets) {
      const payload = this.userAgg.get(userId);
      if (!payload) continue;
      try {
        let row = await this.userProfiles.findOne({ where: { userId } });
        if (!row) {
          row = this.userProfiles.create({ userId, payloadJson: createEmptyMalvUserLearningProfilePayload() });
        }
        row.payloadJson = payload;
        await this.userProfiles.save(row);
      } catch (e) {
        if (isMissingLearningTable(e)) return;
        this.log.warn(`[MALV_LEARNING] user persist failed ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private async hydrateGlobal(): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const row = await this.controlled.findOne({ where: { configKey: GLOBAL_AGG_CONFIG_KEY } });
      const j = row?.valueJson as MalvUserLearningProfilePayload | undefined;
      if (j && typeof j === "object") {
        this.globalAgg = {
          ...createEmptyMalvUserLearningProfilePayload(),
          ...j,
          failurePatternCounts: j.failurePatternCounts ?? {}
        };
      }
    } catch (e) {
      this.log.warn(`[MALV_LEARNING] hydrate global skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async hydrateUser(userId: string): Promise<void> {
    if (!this.isEnabled() || this.userHydrated.has(userId)) return;
    let inflight = this.userHydrateInFlight.get(userId);
    if (!inflight) {
      inflight = this.hydrateUserFromDb(userId).finally(() => {
        this.userHydrateInFlight.delete(userId);
      });
      this.userHydrateInFlight.set(userId, inflight);
    }
    await inflight;
  }

  private async hydrateUserFromDb(userId: string): Promise<void> {
    if (this.userHydrated.has(userId)) return;
    try {
      const row = await this.userProfiles.findOne({ where: { userId } });
      const fromDb = row?.payloadJson
        ? {
            ...createEmptyMalvUserLearningProfilePayload(),
            ...row.payloadJson,
            failurePatternCounts: row.payloadJson.failurePatternCounts ?? {}
          }
        : createEmptyMalvUserLearningProfilePayload();
      const hot = this.userAgg.get(userId);
      if (hot && hot.turns > 0) {
        this.userAgg.set(userId, mergeLearningPayload(fromDb, hot));
      } else {
        this.userAgg.set(userId, fromDb);
      }
    } catch (e) {
      if (!isMissingLearningTable(e)) {
        this.log.warn(`[MALV_LEARNING] hydrate user skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.userHydrated.add(userId);
  }
}

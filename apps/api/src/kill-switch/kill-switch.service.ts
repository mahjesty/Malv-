import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { KillSwitchEventEntity } from "../db/entities/kill-switch-event.entity";
import { KillSwitchClient, type SupervisorKillSwitchState } from "./kill-switch.client";

@Injectable()
export class KillSwitchService {
  private readonly logger = new Logger(KillSwitchService.name);
  private cachedState: SupervisorKillSwitchState | null = null;
  private lastCacheAt = 0;

  constructor(
    private readonly client: KillSwitchClient,
    private readonly cfg: ConfigService,
    @InjectRepository(KillSwitchEventEntity) private readonly killEvents: Repository<KillSwitchEventEntity>
  ) {}

  private cacheTtlMs() {
    return Number(this.cfg.get<string>("KILL_SWITCH_CACHE_TTL_MS") ?? "2000");
  }

  async getState(): Promise<SupervisorKillSwitchState> {
    const now = Date.now();
    if (this.cachedState && now - this.lastCacheAt < this.cacheTtlMs()) {
      return this.cachedState;
    }

    try {
      const state = await this.client.fetchState();
      this.cachedState = state;
      this.lastCacheAt = now;
      return state;
    } catch (e) {
      const nodeEnv = this.cfg.get<string>("NODE_ENV") ?? "development";
      const failOpen =
        (this.cfg.get<string>("KILL_SWITCH_FAIL_OPEN") ??
          (nodeEnv === "development" ? "true" : "false")) === "true";

      if (!failOpen) {
        throw new ServiceUnavailableException(
          `Kill-switch unavailable: ${e instanceof Error ? e.message : String(e)}`
        );
      }

      this.logger.warn(
        `Kill-switch state fetch failed; failing open for dev. Error: ${e instanceof Error ? e.message : String(e)}`
      );
      const state: SupervisorKillSwitchState = { systemOn: true, occurredAt: Date.now() };
      this.cachedState = state;
      this.lastCacheAt = now;
      return state;
    }
  }

  async persistRecentEventsIfNeeded(): Promise<void> {
    const events = await this.client.fetchRecentEvents(25);

    for (const evt of events) {
      const exists = await this.killEvents.findOne({ where: { externalEventId: evt.id } });
      if (exists) continue;

      const entity = this.killEvents.create({
        externalEventId: evt.id,
        systemOn: evt.systemOn,
        previousSystemOn: evt.previousSystemOn,
        reason: evt.reason,
        actor: evt.actor,
        occurredAt: new Date(evt.occurredAt)
      });
      await this.killEvents.save(entity);
    }
  }

  async ensureSystemOnOrThrow(args?: { reason?: string }) {
    const state = await this.getState();
    if (state.systemOn) return;

    // Best effort persistence of supervisor events for audit trail.
    try {
      await this.persistRecentEventsIfNeeded();
    } catch (e) {
      this.logger.warn(`Kill-switch audit persistence failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    throw new ServiceUnavailableException(
      `System is OFF by external supervisor kill-switch. ${args?.reason ? `(${args.reason})` : ""}`.trim()
    );
  }
}


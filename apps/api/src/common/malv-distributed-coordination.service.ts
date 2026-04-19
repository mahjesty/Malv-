import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

type DistributedHandler = (payload: Record<string, unknown>) => void;

@Injectable()
export class MalvDistributedCoordinationService implements OnModuleDestroy {
  private readonly logger = new Logger(MalvDistributedCoordinationService.name);
  private readonly redisUrl: string;
  private readonly redisEnabled: boolean;
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private readonly instanceId = `${process.env.HOSTNAME ?? "node"}:${process.pid}`;
  private readonly handlers = new Map<string, Set<DistributedHandler>>();
  private readonly activeSubscriptions = new Set<string>();
  private readonly cancelFallback = new Set<string>();

  constructor(private readonly cfg: ConfigService) {
    this.redisUrl = (this.cfg.get<string>("REDIS_COORDINATION_URL") ?? this.cfg.get<string>("REDIS_URL") ?? "").trim();
    this.redisEnabled = this.redisUrl.length > 0;
    if (!this.redisEnabled) return;
    this.pub = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true });
    this.sub = this.pub.duplicate();
    this.sub.on("message", (channel, message) => this.onMessage(channel, message));
    this.pub.on("error", (err) => this.logger.warn(`coordination publish degraded: ${err.message}`));
    this.sub.on("error", (err) => this.logger.warn(`coordination subscribe degraded: ${err.message}`));
    this.sub.on("ready", () => {
      void this.restoreSubscriptions();
    });
    void this.pub.connect().catch(() => undefined);
    void this.sub.connect().catch(() => undefined);
  }

  onModuleDestroy(): void {
    void this.pub?.quit().catch(() => undefined);
    void this.sub?.quit().catch(() => undefined);
  }

  isRedisBacked(): boolean {
    return this.redisEnabled && this.pub?.status === "ready";
  }

  async publish(channel: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.isRedisBacked()) return;
    const body = JSON.stringify({ ...payload, __originInstanceId: this.instanceId });
    await this.pub!.publish(channel, body);
  }

  async subscribe(channel: string, handler: DistributedHandler): Promise<() => Promise<void>> {
    const set = this.handlers.get(channel) ?? new Set<DistributedHandler>();
    set.add(handler);
    this.handlers.set(channel, set);
    this.activeSubscriptions.add(channel);
    await this.safeSubscribe(channel);
    return async () => {
      const next = this.handlers.get(channel);
      if (!next) return;
      next.delete(handler);
      if (next.size === 0) {
        this.handlers.delete(channel);
        this.activeSubscriptions.delete(channel);
        await this.safeUnsubscribe(channel);
      }
    };
  }

  private onMessage(channel: string, message: string) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return;
    }
    if (payload.__originInstanceId === this.instanceId) return;
    const handlers = this.handlers.get(channel);
    if (!handlers) return;
    for (const h of handlers) h(payload);
  }

  async markCancelRequested(assistantMessageId: string, ttlSeconds = 900): Promise<void> {
    await this.recordCancelRequested(assistantMessageId, ttlSeconds);
  }

  async recordCancelRequested(assistantMessageId: string, ttlSeconds = 900): Promise<boolean> {
    if (!assistantMessageId) return false;
    if (!this.isRedisBacked()) {
      this.cancelFallback.add(assistantMessageId);
      return true;
    }
    try {
      await this.pub!.set(`malv:chat:cancel:${assistantMessageId}`, "1", "EX", Math.max(30, ttlSeconds));
      return true;
    } catch (err) {
      this.logger.warn(
        `coordination cancel marker write failed assistantMessageId=${assistantMessageId} err=${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return false;
    }
  }

  async isCancelRequested(assistantMessageId: string): Promise<boolean> {
    if (!assistantMessageId) return false;
    if (!this.isRedisBacked()) return this.cancelFallback.has(assistantMessageId);
    const val = await this.pub!.get(`malv:chat:cancel:${assistantMessageId}`);
    return val === "1";
  }

  async clearCancelRequested(assistantMessageId: string): Promise<void> {
    if (!assistantMessageId) return;
    this.cancelFallback.delete(assistantMessageId);
    if (!this.isRedisBacked()) return;
    await this.pub!.del(`malv:chat:cancel:${assistantMessageId}`);
  }

  private async restoreSubscriptions(): Promise<void> {
    if (!this.isRedisBacked()) return;
    for (const channel of this.activeSubscriptions) {
      await this.safeSubscribe(channel);
    }
  }

  private async safeSubscribe(channel: string): Promise<void> {
    if (!this.isRedisBacked()) return;
    if (!this.handlers.has(channel)) return;
    try {
      await this.sub!.subscribe(channel);
    } catch (err) {
      this.logger.warn(
        `coordination subscribe failed channel=${channel} err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async safeUnsubscribe(channel: string): Promise<void> {
    if (!this.isRedisBacked()) return;
    try {
      await this.sub!.unsubscribe(channel);
    } catch (err) {
      this.logger.warn(
        `coordination unsubscribe failed channel=${channel} err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async appendStudioReplay(sessionId: string, event: Record<string, unknown>, maxEvents: number): Promise<void> {
    if (!this.isRedisBacked()) return;
    const key = `malv:studio:replay:${sessionId}`;
    const tx = this.pub!.multi();
    tx.rpush(key, JSON.stringify(event));
    tx.ltrim(key, -Math.max(20, maxEvents), -1);
    tx.expire(key, 60 * 60 * 6);
    await tx.exec();
  }

  async readStudioReplay(sessionId: string): Promise<Record<string, unknown>[]> {
    if (!this.isRedisBacked()) return [];
    const key = `malv:studio:replay:${sessionId}`;
    const rows = await this.pub!.lrange(key, 0, -1);
    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row) as Record<string, unknown>);
      } catch {
        // ignore malformed entries
      }
    }
    return out;
  }
}

import { Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RateLimitEventEntity } from "../../db/entities/rate-limit-event.entity";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { ObservabilityService } from "../observability.service";
import { SecurityEventService } from "../../security/security-event.service";
import { SecuritySignalService } from "../../security/security-signal.service";

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly redis: Redis | null;
  private fallbackLogged = false;
  private readonly counters = {
    fallbackChecks: 0,
    rateLimitHits: 0,
    rateLimitBlocks: 0
  };

  constructor(
    @InjectRepository(RateLimitEventEntity) private readonly events: Repository<RateLimitEventEntity>,
    private readonly cfg: ConfigService,
    private readonly observability: ObservabilityService,
    @Optional() private readonly securityEvents?: SecurityEventService,
    @Optional() private readonly securitySignals?: SecuritySignalService
  ) {
    const redisUrl = this.cfg.get<string>("REDIS_RATE_LIMIT_URL") || this.cfg.get<string>("REDIS_URL") || "";
    if (!redisUrl) {
      this.redis = null;
      this.logger.warn("Rate limiter running in in-memory fallback mode (Redis URL not configured).");
      this.fallbackLogged = true;
      return;
    }
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true
    });
    this.redis.on("error", (err) => {
      this.logger.warn(`Redis rate-limit degraded to memory fallback: ${err.message}`);
    });
    void this.redis.connect().catch((err) => {
      this.logger.warn(`Redis rate-limit connect failed; using memory fallback: ${err.message}`);
    });
  }

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => void 0);
  }

  private checkInMemory(args: { routeKey: string; limitKey: string; limit: number; windowSeconds: number }) {
    this.counters.fallbackChecks += 1;
    this.observability.incRateLimit({ routeKey: args.routeKey, backend: "memory", outcome: "fallback" });
    if (!this.fallbackLogged) {
      this.logger.warn("Rate limiter using in-memory fallback mode (Redis unavailable).");
      this.fallbackLogged = true;
    }
    const key = `${args.routeKey}:${args.limitKey}`;
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + args.windowSeconds * 1000 });
      return { allowed: true, remaining: args.limit - 1, resetAt: now + args.windowSeconds * 1000 };
    }
    if (existing.count >= args.limit) {
      this.counters.rateLimitBlocks += 1;
      this.observability.incRateLimit({ routeKey: args.routeKey, backend: "memory", outcome: "blocked" });
      this.emitRateLimitSecurityEvent(args);
      this.logger.warn(
        JSON.stringify({
          tag: "rate_limit.blocked",
          backend: "memory",
          routeKey: args.routeKey,
          limitKey: args.limitKey,
          limit: args.limit,
          windowSeconds: args.windowSeconds,
          metrics: this.counters
        })
      );
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    this.buckets.set(key, existing);
    return { allowed: true, remaining: Math.max(0, args.limit - existing.count), resetAt: existing.resetAt };
  }

  async check(args: { routeKey: string; limitKey: string; limit: number; windowSeconds: number }) {
    this.counters.rateLimitHits += 1;
    this.observability.incRateLimit({
      routeKey: args.routeKey,
      backend: this.redis?.status === "ready" ? "redis" : "memory",
      outcome: "hit"
    });
    if (!this.redis || this.redis.status !== "ready") {
      return this.checkInMemory(args);
    }
    const key = `ratelimit:${args.routeKey}:${args.limitKey}`;
    const now = Date.now();
    const ttlSec = Math.max(1, Math.floor(args.windowSeconds));
    try {
      const tx = this.redis.multi();
      tx.incr(key);
      tx.ttl(key);
      const out = await tx.exec();
      const countRaw = Number(out?.[0]?.[1] ?? 0);
      let ttlRaw = Number(out?.[1]?.[1] ?? -1);
      if (countRaw === 1) {
        await this.redis.expire(key, ttlSec);
        ttlRaw = ttlSec;
      } else if (ttlRaw < 0) {
        await this.redis.expire(key, ttlSec);
        ttlRaw = ttlSec;
      }
      const resetAt = now + Math.max(1, ttlRaw) * 1000;
      if (countRaw > args.limit) {
        this.counters.rateLimitBlocks += 1;
        this.observability.incRateLimit({ routeKey: args.routeKey, backend: "redis", outcome: "blocked" });
        this.emitRateLimitSecurityEvent(args);
        this.logger.warn(
          JSON.stringify({
            tag: "rate_limit.blocked",
            backend: "redis",
            routeKey: args.routeKey,
            limitKey: args.limitKey,
            limit: args.limit,
            windowSeconds: args.windowSeconds,
            metrics: this.counters
          })
        );
        return { allowed: false, remaining: 0, resetAt };
      }
      return { allowed: true, remaining: Math.max(0, args.limit - countRaw), resetAt };
    } catch {
      return this.checkInMemory(args);
    }
  }

  async recordHit(args: { userId?: string | null; routeKey: string; limitKey: string; windowSeconds: number; hitCount: number }) {
    await this.events.save(
      this.events.create({
        user: args.userId ? ({ id: args.userId } as any) : null,
        routeKey: args.routeKey,
        limitKey: args.limitKey,
        windowSeconds: args.windowSeconds,
        hitCount: args.hitCount
      })
    );
  }

  getMetricsSnapshot() {
    return { ...this.counters, redisReady: this.redis?.status === "ready" };
  }

  private emitRateLimitSecurityEvent(args: { routeKey: string; limitKey: string; limit: number; windowSeconds: number }) {
    const uid = args.limitKey.startsWith("user:") ? args.limitKey.slice("user:".length) : null;
    void this.securityEvents?.emitBestEffort({
      eventType: "rate_limit.blocked",
      severity: "medium",
      subsystem: "rate_limit",
      summary: `Rate limit exceeded: ${args.routeKey}`,
      details: {
        routeKey: args.routeKey,
        limitKey: args.limitKey,
        limit: args.limit,
        windowSeconds: args.windowSeconds
      },
      actorUserId: uid,
      correlationId: args.routeKey
    });
    this.securitySignals?.record({
      signalType: `rate_limit_block:${args.routeKey}`,
      severity: "high",
      detail: { limitKey: args.limitKey }
    });
  }
}

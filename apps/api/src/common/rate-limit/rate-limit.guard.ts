import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { RATE_LIMIT_KEY, type RateLimitConfig } from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
    private readonly cfg: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!config) return true;
    const req = context.switchToHttp().getRequest();
    const userId = (req?.user as any)?.userId as string | undefined;
    const ip = (req?.ip as string | undefined) ?? "unknown-ip";
    const limitKey = userId ? `user:${userId}` : `ip:${ip}`;
    const limitRaw = config.limitEnvKey ? this.cfg.get<string>(config.limitEnvKey) : undefined;
    const winRaw = config.windowEnvKey ? this.cfg.get<string>(config.windowEnvKey) : undefined;
    const limit = limitRaw != null && limitRaw !== "" && !Number.isNaN(Number(limitRaw)) ? Number(limitRaw) : config.limit;
    const windowSeconds =
      winRaw != null && winRaw !== "" && !Number.isNaN(Number(winRaw)) ? Number(winRaw) : config.windowSeconds;
    const result = await this.limits.check({
      routeKey: config.key,
      limitKey,
      limit,
      windowSeconds
    });
    if (!result.allowed) {
      await this.limits.recordHit({
        userId: userId ?? null,
        routeKey: config.key,
        limitKey,
        windowSeconds,
        hitCount: 1
      });
      throw new HttpException(
        {
          ok: false,
          error: "Rate limit exceeded",
          routeKey: config.key,
          retryAfterMs: Math.max(0, result.resetAt - Date.now())
        },
        429
      );
    }
    return true;
  }
}

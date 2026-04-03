import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "malv_rate_limit";

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowSeconds: number;
  /** When set, `ConfigService.get(limitEnvKey)` overrides `limit` if numeric. */
  limitEnvKey?: string;
  windowEnvKey?: string;
};

export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

import { HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { RateLimitGuard } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  it("blocks when over limit", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ key: "sandbox.patches.apply", limit: 1, windowSeconds: 60 })
    } as unknown as Reflector;
    const service: any = {
      check: jest
        .fn()
        .mockReturnValueOnce({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })
        .mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }),
      recordHit: jest.fn()
    };
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const guard = new RateLimitGuard(reflector, service, cfg);
    const ctx: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: "u1" }, ip: "127.0.0.1" })
      })
    };
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});

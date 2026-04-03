import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { SmartHomeService } from "./smart-home.service";

@Controller("v1/smart-home")
export class SmartHomeController {
  constructor(private readonly smartHome: SmartHomeService) {}

  @Get("bridge/health")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "smart_home.bridge.health", limit: 60, windowSeconds: 60 })
  async bridgeHealth(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, bridge: this.smartHome.getBridgeHealth() };
  }
}

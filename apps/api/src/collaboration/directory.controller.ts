import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { DirectoryService } from "./directory.service";

@Controller("v1/directory")
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get("users")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "directory.users.search", limit: 45, windowSeconds: 60 })
  async searchUsers(@Req() req: Request, @Query("q") q?: string, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = limitRaw !== undefined ? Number(limitRaw) : 15;
    const out = await this.directory.searchUsers({
      actorUserId: auth.userId,
      query: q ?? "",
      limit: Number.isFinite(limit) ? limit : 15
    });
    return { ok: true, ...out };
  }
}

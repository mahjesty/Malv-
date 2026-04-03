import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength, IsUUID } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RoomsService } from "./rooms.service";
import { CollaborationSummaryService } from "./collaboration-summary.service";

class CreateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;
}

class AddRoomMemberDto {
  @IsUUID()
  userId!: string;
}

@Controller("v1/rooms")
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly summaries: CollaborationSummaryService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.create", limit: 30, windowSeconds: 60 })
  async create(@Req() req: Request, @Body() dto: CreateRoomDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const room = await this.rooms.createRoom({ ownerUserId: auth.userId, title: dto.title ?? null });
    return { ok: true, room };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.list", limit: 120, windowSeconds: 60 })
  async list(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.rooms.listRoomsForUser({ userId: auth.userId });
    return { ok: true, ...out };
  }

  @Get(":roomId")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.get", limit: 120, windowSeconds: 60 })
  async getOne(@Req() req: Request, @Param("roomId") roomId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.rooms.getRoom({ userId: auth.userId, roomId });
    return { ok: true, ...out };
  }

  @Post(":roomId/members")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.add_member", limit: 40, windowSeconds: 60 })
  async addMember(@Req() req: Request, @Param("roomId") roomId: string, @Body() dto: AddRoomMemberDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.rooms.addMember({ actorUserId: auth.userId, roomId, targetUserId: dto.userId });
    return { ok: true };
  }

  @Delete(":roomId/members/me")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.leave", limit: 40, windowSeconds: 60 })
  async leave(@Req() req: Request, @Param("roomId") roomId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.rooms.leaveRoom({ userId: auth.userId, roomId });
    return { ok: true };
  }

  @Delete(":roomId")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.delete", limit: 20, windowSeconds: 60 })
  async remove(@Req() req: Request, @Param("roomId") roomId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.rooms.deleteRoom({ userId: auth.userId, roomId });
    return { ok: true };
  }

  @Get(":roomId/summaries")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "rooms.summaries", limit: 120, windowSeconds: 60 })
  async listSummaries(@Req() req: Request, @Param("roomId") roomId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.rooms.assertMember({ userId: auth.userId, roomId });
    const items = await this.summaries.listForRoom({ roomId, limit: 30 });
    return { ok: true, summaries: items };
  }
}

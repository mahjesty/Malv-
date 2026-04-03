import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ConversationsService } from "./conversations.service";
import { clampInt } from "./query-params.util";

class RenameConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;
}

class ForkConversationDto {
  @IsUUID()
  anchorMessageId!: string;
}

/**
 * Route order: static `GET /` (list) MUST be registered before `GET /:id` so `/v1/conversations`
 * is not captured by the param route (Nest/Express matching).
 */
@Controller("v1/conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: Request,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = clampInt(Number(limitRaw ?? 30), 30, 1, 100);
    const offset = clampInt(Number(offsetRaw ?? 0), 0, 0, 1_000_000);
    const out = await this.conversations.listForUser({ userId: auth.userId, limit, offset });
    return { ok: true, ...out };
  }

  @Get(":id/outputs")
  @UseGuards(JwtAuthGuard)
  async listOutputs(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("limit") limitRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = clampInt(Number(limitRaw ?? 25), 25, 1, 100);
    const data = await this.conversations.listOutputsForUser({ userId: auth.userId, conversationId: id, limit });
    return { ok: true, ...data };
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("id") id: string, @Query("messageLimit") messageLimitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const messageLimit = clampInt(Number(messageLimitRaw ?? 200), 200, 1, 500);
    const data = await this.conversations.getById({ userId: auth.userId, conversationId: id, messageLimit });
    return { ok: true, ...data };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async renameOne(@Req() req: Request, @Param("id") id: string, @Body() body: RenameConversationDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    await this.conversations.renameForUser({ userId: auth.userId, conversationId: id, title: body.title });
    return { ok: true };
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async deleteOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    await this.conversations.deleteForUser({ userId: auth.userId, conversationId: id });
    return { ok: true };
  }

  @Post(":id/fork")
  @UseGuards(JwtAuthGuard)
  async forkOne(@Req() req: Request, @Param("id") id: string, @Body() body: ForkConversationDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    const out = await this.conversations.forkForUser({
      userId: auth.userId,
      sourceConversationId: id,
      anchorMessageId: body.anchorMessageId
    });
    return { ok: true, ...out };
  }

  @Post(":id/duplicate")
  @UseGuards(JwtAuthGuard)
  async duplicateOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    const out = await this.conversations.duplicateForUser({
      userId: auth.userId,
      sourceConversationId: id
    });
    return { ok: true, ...out };
  }
}

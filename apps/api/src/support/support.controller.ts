import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SupportService } from "./support.service";
import type { SupportTicketPriority } from "../db/entities/support-ticket.entity";

class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  subject!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsIn(["low", "normal", "high"])
  priority?: SupportTicketPriority;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  message!: string;
}

class AddMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content!: string;
}

@Controller("v1/support")
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get("categories")
  @UseGuards(JwtAuthGuard)
  async categories(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const items = await this.support.listCategories();
    return { ok: true, categories: items };
  }

  @Post("tickets")
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateTicketDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const ticket = await this.support.createTicket({
      userId: auth.userId,
      subject: dto.subject,
      categoryId: dto.categoryId ?? null,
      priority: dto.priority ?? "normal",
      initialMessage: dto.message
    });
    return { ok: true, ticketId: ticket.id };
  }

  @Get("tickets")
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: Request,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 30)));
    const offset = Math.max(0, Number(offsetRaw ?? 0));
    const out = await this.support.listTickets({ userId: auth.userId, limit, offset });
    return { ok: true, ...out };
  }

  @Get("tickets/:id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const data = await this.support.getTicketDetail({ userId: auth.userId, ticketId: id });
    return { ok: true, ...data };
  }

  @Post("tickets/:id/messages")
  @UseGuards(JwtAuthGuard)
  async addMessage(@Req() req: Request, @Param("id") id: string, @Body() dto: AddMessageDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const msg = await this.support.addMessage({ userId: auth.userId, ticketId: id, content: dto.content });
    return { ok: true, messageId: msg.id, createdAt: msg.createdAt };
  }
}

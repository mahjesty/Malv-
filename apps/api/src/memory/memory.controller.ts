import { Body, Controller, Delete, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MemoryService } from "./memory.service";
import type { MemoryScope } from "../db/entities/memory-entry.entity";

class PatchMemoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  memoryType?: string;
}

class ContextPackDto {
  @IsString()
  @MaxLength(8000)
  query!: string;

  @IsOptional()
  includeVaultOnly?: boolean;

  @IsOptional()
  take?: number;
}

@Controller("v1/memory")
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: Request,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string,
    @Query("scope") scope?: MemoryScope
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 40)));
    const offset = Math.max(0, Number(offsetRaw ?? 0));
    const out = await this.memory.listEntries({ userId: auth.userId, limit, offset, scope });
    return { ok: true, ...out };
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.memory.getEntry({ userId: auth.userId, id });
    return {
      ok: true,
      entry: {
        id: row.id,
        memoryScope: row.memoryScope,
        memoryType: row.memoryType,
        title: row.title ?? null,
        content: row.content,
        tags: row.tags ?? null,
        source: row.source,
        sourceRefs: row.sourceRefs ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }
    };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async patch(@Req() req: Request, @Param("id") id: string, @Body() dto: PatchMemoryDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.memory.updateEntry({
      userId: auth.userId,
      id,
      title: dto.title,
      content: dto.content,
      tags: dto.tags,
      memoryType: dto.memoryType
    });
    return { ok: true, entry: { id: row.id, updatedAt: row.updatedAt } };
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.memory.deleteEntry({ userId: auth.userId, id });
    return { ok: true };
  }

  @Patch("context-pack/query")
  @UseGuards(JwtAuthGuard)
  async contextPack(@Req() req: Request, @Body() dto: ContextPackDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const query = (dto.query ?? "").trim();
    if (!query) return { ok: false, error: "Query is required" };
    const out = await this.memory.buildContextPack({
      userId: auth.userId,
      query,
      includeVaultOnly: Boolean(dto.includeVaultOnly),
      take: Number(dto.take ?? 10)
    });
    return { ok: true, ...out };
  }
}

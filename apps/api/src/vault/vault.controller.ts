import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { VaultService } from "./vault.service";
import type { VaultEntryType } from "../db/entities/vault-entry.entity";

class OpenVaultDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  secretPhrase!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  accessLabel?: string | null;
}

class AddVaultEntryDto {
  @IsString()
  @IsNotEmpty()
  vaultSessionId!: string;

  @IsIn(["secret", "note", "document", "media"])
  entryType!: VaultEntryType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content!: string;
}

class CloseVaultDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

@Controller("v1/vault")
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Post("sessions/open")
  @UseGuards(JwtAuthGuard)
  async open(@Req() req: Request, @Body() dto: OpenVaultDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.vault.openSession({
      userId: auth.userId,
      secretPhrase: dto.secretPhrase,
      accessLabel: dto.accessLabel ?? null
    });
    return { ok: true, sessionId: session.id, status: session.status, openedAt: session.openedAt };
  }

  @Post("sessions/close")
  @UseGuards(JwtAuthGuard)
  async close(@Req() req: Request, @Body() dto: CloseVaultDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.vault.closeSession({ userId: auth.userId, sessionId: dto.sessionId });
    return { ok: true, sessionId: session.id, status: session.status, closedAt: session.closedAt };
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(@Req() req: Request, @Query("limit") limitRaw?: string, @Query("offset") offsetRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 30)));
    const offset = Math.max(0, Number(offsetRaw ?? 0));
    const out = await this.vault.listSessions({ userId: auth.userId, limit, offset });
    return { ok: true, ...out };
  }

  @Get("entries")
  @UseGuards(JwtAuthGuard)
  async listEntries(
    @Req() req: Request,
    @Query("vaultSessionId") vaultSessionId?: string,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50)));
    const offset = Math.max(0, Number(offsetRaw ?? 0));
    const out = await this.vault.listEntries({
      userId: auth.userId,
      vaultSessionId: vaultSessionId ?? null,
      limit,
      offset
    });
    return { ok: true, ...out };
  }

  @Post("entries")
  @UseGuards(JwtAuthGuard)
  async addEntry(@Req() req: Request, @Body() dto: AddVaultEntryDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const entry = await this.vault.addEntry({
      userId: auth.userId,
      vaultSessionId: dto.vaultSessionId,
      entryType: dto.entryType,
      label: dto.label ?? null,
      content: dto.content
    });
    return { ok: true, entryId: entry.id, createdAt: entry.createdAt };
  }
}

import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkspaceRuntimeSessionService } from "./workspace-runtime-session.service";
import { CreateWorkspaceRuntimeSessionDto } from "./dto/workspace-runtime-session.dto";

@Controller("v1/workspaces/runtime-sessions")
export class WorkspaceRuntimeSessionController {
  constructor(private readonly runtimeSessions: WorkspaceRuntimeSessionService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: Request, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const n = limitRaw ? Number(limitRaw) : undefined;
    const limit = Number.isFinite(n) ? n : undefined;
    const rows = await this.runtimeSessions.listSessionsForUser({ userId: auth.userId, limit });
    const sessions = rows.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      status: s.status,
      activeRunId: s.activeRunId ?? null,
      lastEventAt: s.lastEventAt ? s.lastEventAt.toISOString() : null,
      metadata: s.metadata ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    }));
    return { ok: true, sessions };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() body: CreateWorkspaceRuntimeSessionDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.runtimeSessions.createSession({
      userId: auth.userId,
      sourceType: body.sourceType,
      sourceId: body.sourceId
    });
    return { ok: true, sessionId: session.id };
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async get(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const hydrated = await this.runtimeSessions.getSession({ userId: auth.userId, sessionId: id });
    return { ok: true, ...hydrated };
  }
}


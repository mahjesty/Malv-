import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CallsService } from "./calls.service";
import type { CallSessionKind, CallSessionStatus } from "../db/entities/call-session.entity";
import type { TranscriptSpeakerRole } from "../db/entities/call-transcript.entity";

const callKinds: CallSessionKind[] = ["voice", "video"];
const callStatuses: CallSessionStatus[] = ["active", "ended"];
const speakerRoles: TranscriptSpeakerRole[] = ["user", "malv", "support", "system"];

class CreateCallDto {
  @IsIn(callKinds)
  kind!: CallSessionKind;

  @IsOptional()
  @IsString()
  vaultSessionId?: string | null;

  /** Optional workspace conversation to link for chat ↔ call continuity. */
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  /** `group` = collaboration stability mode (avatar switching restricted in clients). */
  @IsOptional()
  @IsIn(["direct", "group"])
  participationScope?: "direct" | "group";
}

class UpdateCallControlsDto {
  @IsOptional()
  @IsBoolean()
  micMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  malvPaused?: boolean;

  @IsOptional()
  @IsBoolean()
  cameraAssistEnabled?: boolean;
}

class HeartbeatDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  observedRttMs?: number | null;
}

class UpdateCallStateDto {
  @IsIn(callStatuses)
  status!: CallSessionStatus;
}

class AddTranscriptDto {
  @IsIn(speakerRoles)
  speakerRole!: TranscriptSpeakerRole;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  startTimeMs?: number | null;

  @IsOptional()
  @IsBoolean()
  vaultTriggerCandidate?: boolean;
}

class PatchCallRecapDto {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actionItems?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  decisions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unresolvedQuestions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedFollowUps?: string[];
}

@Controller("v1/calls")
export class CallsController {
  private readonly logger = new Logger(CallsController.name);

  constructor(private readonly calls: CallsService) {}

  @Get("history")
  @UseGuards(JwtAuthGuard)
  async listHistory(@Req() req: Request, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = limitRaw !== undefined ? Number(limitRaw) : 15;
    const out = await this.calls.listRecentSessions({
      userId: auth.userId,
      limit: Number.isFinite(limit) ? limit : 15
    });
    return { ok: true, ...out };
  }

  @Get("active")
  @UseGuards(JwtAuthGuard)
  async getActive(@Req() req: Request, @Query("kind") kind?: CallSessionKind) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const active = await this.calls.getActiveCall({ userId: auth.userId, kind: kind === "video" ? "video" : "voice" });
    if (!active) return { ok: true, active: null };
    return {
      ok: true,
      active: {
        callSessionId: active.session.id,
        status: active.session.status,
        kind: active.session.kind,
        runtime: active.runtime
      }
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateCallDto) {
    const payloadSummary = {
      kind: dto?.kind,
      vaultSessionId: dto?.vaultSessionId ?? null,
      conversationId: dto?.conversationId ?? null,
      participationScope: dto?.participationScope ?? "direct"
    };
    this.logger.log(`POST /v1/calls create: request payload=${JSON.stringify(payloadSummary)}`);

    const auth = (req as any).user as { userId: string } | undefined;
    this.logger.log(`POST /v1/calls create: auth userId=${auth?.userId ?? "undefined"} (present=${Boolean(auth?.userId)})`);

    if (!auth?.userId) {
      this.logger.warn("POST /v1/calls create: rejected - missing userId on JWT context");
      return { ok: false, error: "Unauthorized" };
    }

    try {
      this.logger.log(`POST /v1/calls create: invoking CallsService.createCall userId=${auth.userId}`);
      const call = await this.calls.createCall({
        userId: auth.userId,
        kind: dto.kind,
        vaultSessionId: dto.vaultSessionId ?? null,
        conversationId: dto.conversationId ?? null,
        participationScope: dto.participationScope === "group" ? "group" : "direct"
      });
      this.logger.log(
        `POST /v1/calls create: success callSessionId=${call.session.id} resumed=${call.resumed} kind=${call.session.kind}`
      );
      return {
        ok: true,
        callSessionId: call.session.id,
        status: call.session.status,
        kind: call.session.kind,
        runtime: call.runtime,
        resumed: call.resumed
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`POST /v1/calls create: FAILED message=${message}`, stack);

      const exposeDetails = process.env.NODE_ENV !== "production" || process.env.MALV_EXPOSE_ERROR_STACK === "true";
      if (exposeDetails) {
        throw new InternalServerErrorException({
          ok: false,
          error: message,
          stack,
          hint:
            "Common causes: DB missing columns (run migrations, e.g. voice_flow_mode / call_transcript_enabled), kill switch off, or vault validation failure."
        });
      }
      throw new InternalServerErrorException({ ok: false, error: "Call creation failed" });
    }
  }

  @Get(":callSessionId/transcripts")
  @UseGuards(JwtAuthGuard)
  async listTranscripts(
    @Req() req: Request,
    @Param("callSessionId") callSessionId: string,
    @Query("limit") limitRaw?: string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = limitRaw !== undefined ? Number(limitRaw) : undefined;
    const transcripts = await this.calls.listTranscripts({
      userId: auth.userId,
      callSessionId,
      limit: Number.isFinite(limit) ? limit : undefined
    });
    return { ok: true, transcripts };
  }

  @Patch(":callSessionId/recap")
  @UseGuards(JwtAuthGuard)
  async patchRecap(@Req() req: Request, @Param("callSessionId") callSessionId: string, @Body() dto: PatchCallRecapDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.patchCallRecap({
      userId: auth.userId,
      callSessionId,
      body: {
        summary: dto.summary,
        actionItems: dto.actionItems,
        decisions: dto.decisions,
        unresolvedQuestions: dto.unresolvedQuestions,
        suggestedFollowUps: dto.suggestedFollowUps
      }
    });
    return { ok: true, callSessionId: call.session.id, runtime: call.runtime };
  }

  @Get(":callSessionId")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("callSessionId") callSessionId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.getCall({ userId: auth.userId, callSessionId });
    return { ok: true, callSessionId: call.session.id, status: call.session.status, kind: call.session.kind, runtime: call.runtime };
  }

  @Post(":callSessionId/join")
  @UseGuards(JwtAuthGuard)
  async join(@Req() req: Request, @Param("callSessionId") callSessionId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.joinCall({ userId: auth.userId, callSessionId });
    return { ok: true, callSessionId: call.session.id, status: call.session.status, kind: call.session.kind, runtime: call.runtime };
  }

  @Post(":callSessionId/heartbeat")
  @UseGuards(JwtAuthGuard)
  async heartbeat(@Req() req: Request, @Param("callSessionId") callSessionId: string, @Body() dto: HeartbeatDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.heartbeat({
      userId: auth.userId,
      callSessionId,
      observedRttMs: dto.observedRttMs ?? null
    });
    return { ok: true, runtime: call.runtime };
  }

  @Patch(":callSessionId/controls")
  @UseGuards(JwtAuthGuard)
  async updateControls(@Req() req: Request, @Param("callSessionId") callSessionId: string, @Body() dto: UpdateCallControlsDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.updateControls({
      userId: auth.userId,
      callSessionId,
      micMuted: dto.micMuted,
      malvPaused: dto.malvPaused,
      cameraAssistEnabled: dto.cameraAssistEnabled
    });
    return { ok: true, runtime: call.runtime };
  }

  @Patch(":callSessionId/state")
  @UseGuards(JwtAuthGuard)
  async updateState(@Req() req: Request, @Param("callSessionId") callSessionId: string, @Body() dto: UpdateCallStateDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const call = await this.calls.updateCallState({ userId: auth.userId, callSessionId, status: dto.status });
    return { ok: true, callSessionId: call.session.id, status: call.session.status, endedAt: call.session.endedAt?.getTime() ?? null, runtime: call.runtime };
  }

  @Post(":callSessionId/transcripts")
  @UseGuards(JwtAuthGuard)
  async addTranscript(@Req() req: Request, @Param("callSessionId") callSessionId: string, @Body() dto: AddTranscriptDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const tx = await this.calls.addTranscript({
      userId: auth.userId,
      callSessionId,
      speakerRole: dto.speakerRole,
      content: dto.content,
      startTimeMs: dto.startTimeMs ?? null,
      vaultTriggerCandidate: dto.vaultTriggerCandidate
    });
    return { ok: true, transcriptId: tx.id };
  }
}


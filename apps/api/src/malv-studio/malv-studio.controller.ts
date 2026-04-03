import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MalvStudioService } from "./malv-studio.service";

class CreateStudioSessionBody {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string | null;
}

class TargetCaptureBody {
  @IsObject()
  target!: Record<string, unknown>;
}

class StudioInstructionBody {
  @IsString()
  @MaxLength(3000)
  instruction!: string;

  @IsOptional()
  @IsString()
  workspaceId?: string | null;
}

class ApplyStudioBody {
  @IsOptional()
  riskAcknowledged?: boolean;
}

@Controller("v1/studio")
export class MalvStudioController {
  constructor(private readonly studio: MalvStudioService) {}

  @Post("sessions")
  @UseGuards(JwtAuthGuard)
  async createSession(@Req() req: Request, @Body() body: CreateStudioSessionBody) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.studio.createSession({ userId: auth.userId, workspaceId: body.workspaceId ?? null, title: body.title });
    return { ok: true, session };
  }

  @Get("sessions/:id")
  @UseGuards(JwtAuthGuard)
  async getSession(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, session: await this.studio.getSession(auth.userId, id) };
  }

  @Post("sessions/:id/targets")
  @UseGuards(JwtAuthGuard)
  async captureTarget(@Req() req: Request, @Param("id") id: string, @Body() body: TargetCaptureBody) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, session: await this.studio.captureTarget({ userId: auth.userId, sessionId: id, target: body.target }) };
  }

  @Post("sessions/:id/chat")
  @UseGuards(JwtAuthGuard)
  async chat(@Req() req: Request, @Param("id") id: string, @Body() body: StudioInstructionBody) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.studio.iterateWithInstruction({
      userId: auth.userId,
      sessionId: id,
      instruction: body.instruction,
      workspaceId: body.workspaceId ?? null
    });
    return { ok: true, session };
  }

  @Get("sessions/:id/versions")
  @UseGuards(JwtAuthGuard)
  async versions(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.studio.getSession(auth.userId, id);
    return { ok: true, versions: session.versions ?? [] };
  }

  @Post("sessions/:id/apply")
  @UseGuards(JwtAuthGuard)
  async apply(@Req() req: Request, @Param("id") id: string, @Body() body: ApplyStudioBody) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const actor = auth.role === "admin" ? auth.userId : auth.userId;
    return this.studio.apply(auth.userId, id, actor, { riskAcknowledged: Boolean(body?.riskAcknowledged) });
  }

  @Post("sessions/:id/revert")
  @UseGuards(JwtAuthGuard)
  async revert(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return this.studio.revert(auth.userId, id);
  }

  @Post("sessions/:id/versions/:versionId/restore")
  @UseGuards(JwtAuthGuard)
  async restoreVersion(@Req() req: Request, @Param("id") id: string, @Param("versionId") versionId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, session: await this.studio.restoreVersion(auth.userId, id, versionId) };
  }

  @Post("sessions/:id/versions/compare")
  @UseGuards(JwtAuthGuard)
  async compareVersions(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { leftVersionId?: string; rightVersionId?: string }
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!body?.leftVersionId || !body?.rightVersionId) return { ok: false, error: "Both versions are required." };
    return {
      ok: true,
      compare: await this.studio.compareVersions(auth.userId, id, { leftVersionId: body.leftVersionId, rightVersionId: body.rightVersionId })
    };
  }
}

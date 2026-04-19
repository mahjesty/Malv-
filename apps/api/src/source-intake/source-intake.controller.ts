import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { PublishSourceIntakeDto } from "./dto/publish-source-intake.dto";
import { SourceIntakeService } from "./source-intake.service";
import {
  attachBuildUnitPreviewFeasibility,
  attachSourceIntakeClientEnvelope,
  livePreviewPipelineV1FromEnv
} from "../preview-feasibility/preview-feasibility.attach";
import { LivePreviewDeliveryService } from "../build-units/live-preview-delivery.service";
import { withPreviewPipelineStatus } from "../build-units/preview-pipeline-status.util";
import { SOURCE_INTAKE_MAX_BYTES } from "./source-intake-upload.constants";

@Controller("v1/workspaces/source-intakes")
export class SourceIntakeController {
  constructor(
    private readonly intakes: SourceIntakeService,
    private readonly livePreviewDelivery: LivePreviewDeliveryService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: SOURCE_INTAKE_MAX_BYTES } }))
  @RateLimit({ key: "source-intake.create", limit: 24, windowSeconds: 60 })
  async create(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined
  ) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    const session = await this.intakes.createSession({
      userId: auth.userId,
      globalRole: auth.role,
      buffer: file.buffer,
      originalName: file.originalname || "source.zip",
      mimeType: file.mimetype || null
    });
    return { ok: true, session: attachSourceIntakeClientEnvelope(session) };
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const session = await this.intakes.getSession(auth.userId, id);
    return { ok: true, session: attachSourceIntakeClientEnvelope(session) };
  }

  /**
   * Creates a user-owned build unit from an approved intake and sets session.buildUnitId.
   */
  @Post(":id/publish")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "source-intake.publish", limit: 30, windowSeconds: 60 })
  async publish(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: PublishSourceIntakeDto
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const { buildUnit, session } = await this.intakes.publishSession(auth.userId, id, body ?? {});
    const pipe = livePreviewPipelineV1FromEnv();
    const withF = attachBuildUnitPreviewFeasibility(buildUnit, pipe);
    const buildUnitOut = withPreviewPipelineStatus(
      await this.livePreviewDelivery.attachToBuildUnitResponse(auth.userId, withF)
    );
    return {
      ok: true,
      buildUnit: buildUnitOut,
      session: attachSourceIntakeClientEnvelope(session)
    };
  }
}

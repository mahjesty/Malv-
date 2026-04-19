import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf
} from "class-validator";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { BuildUnitService } from "./build-unit.service";
import { LivePreviewDeliveryService } from "./live-preview-delivery.service";
import { withPreviewPipelineStatus } from "./preview-pipeline-status.util";
import type { BuildUnitEntity, BuildUnitPreviewKind, BuildUnitVisibility } from "../db/entities/build-unit.entity";
import {
  attachBuildUnitPreviewFeasibility,
  livePreviewPipelineV1FromEnv
} from "../preview-feasibility/preview-feasibility.attach";
import { normalizePublishedPreviewImageUrl } from "./published-preview-image-url.util";
import {
  BUILD_UNIT_PREVIEW_HTML_MIMES,
  BUILD_UNIT_PREVIEW_MAX_BYTES,
  BUILD_UNIT_SOURCE_MAX_BYTES,
  normalizeMime
} from "./build-unit-upload.constants";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsString()
  @IsNotEmpty()
  @IsIn(["template", "component", "behavior", "workflow", "plugin", "blueprint", "ai_generated"])
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  prompt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  codeSnippet?: string | null;

  @IsOptional()
  @IsIn(["public", "private", "team"])
  visibility?: BuildUnitVisibility;

  @IsOptional()
  @IsBoolean()
  forkable?: boolean;

  @IsOptional()
  @IsBoolean()
  downloadable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accent?: string | null;

  @IsOptional()
  @IsIn(["image", "code", "rendered", "animation", "mixed", "none"])
  previewKind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewImageUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  previewFileId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  sourceFileId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceFileMime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceFileUrl?: string | null;
}

class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  prompt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  codeSnippet?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsIn(["public", "private", "team"])
  visibility?: BuildUnitVisibility;

  @IsOptional()
  @IsBoolean()
  forkable?: boolean;

  @IsOptional()
  @IsBoolean()
  downloadable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accent?: string | null;

  @IsOptional()
  @IsIn(["image", "code", "rendered", "animation", "mixed", "none"])
  previewKind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewImageUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  previewFileId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  sourceFileId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceFileMime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceFileUrl?: string | null;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller("v1/workspaces/units")
export class BuildUnitController {
  constructor(
    private readonly buildUnits: BuildUnitService,
    private readonly livePreviewDelivery: LivePreviewDeliveryService
  ) {}

  private async formatUnitResponse(userId: string, unit: BuildUnitEntity) {
    const pipe = livePreviewPipelineV1FromEnv();
    const forClient = Object.assign({}, unit, {
      previewImageUrl: normalizePublishedPreviewImageUrl(unit.previewImageUrl)
    });
    const withF = attachBuildUnitPreviewFeasibility(forClient, pipe);
    const out = await this.livePreviewDelivery.attachToBuildUnitResponse(userId, withF);
    return withPreviewPipelineStatus(out);
  }

  // ── GET /v1/workspaces/units ──────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  async listUnits(
    @Req() req: Request,
    @Query("type")     type?:     string,
    @Query("category") category?: string,
    @Query("section")  section?:  string,
    @Query("mine")     mineRaw?:  string,
    @Query("forked")   forkedRaw?: string,
    @Query("search")   search?:   string,
    @Query("limit")    limitRaw?: string,
    @Query("page")     pageRaw?:  string
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw) || 50)) : 50;
    const page  = pageRaw  ? Math.max(1, Number(pageRaw) || 1) : 1;

    const validSections = ["trending", "recommended", "new"] as const;
    const validatedSection = validSections.includes(section as any)
      ? (section as "trending" | "recommended" | "new")
      : undefined;

    const result = await this.buildUnits.listUnits({
      userId:   auth.userId,
      type:     type     || undefined,
      category: category || undefined,
      section:  validatedSection,
      mine:     mineRaw   === "true",
      forked:   forkedRaw === "true",
      search:   search    || undefined,
      limit,
      page
    });

    const units = await Promise.all(result.units.map((u) => this.formatUnitResponse(auth.userId, u)));
    return {
      ok: true,
      units,
      total: result.total,
      hasMore: result.hasMore
    };
  }

  // ── POST /v1/workspaces/units ────────────────────────────────────────────
  // Create a new user-authored Build Unit.
  // Must be declared before /:id routes to avoid route collision.

  @Post()
  @UseGuards(JwtAuthGuard)
  async createUnit(@Req() req: Request, @Body() body: CreateUnitDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.createUnit({
      userId: auth.userId,
      ...body,
      previewKind: body.previewKind as BuildUnitPreviewKind | undefined
    });
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── POST /v1/workspaces/units/uploads/preview ─────────────────────────────

  @Post("uploads/preview")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: BUILD_UNIT_PREVIEW_MAX_BYTES } }))
  @RateLimit({ key: "units.upload.preview", limit: 24, windowSeconds: 60 })
  async uploadPreview(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined
  ) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    const out = await this.buildUnits.uploadCatalogPreview({
      userId:       auth.userId,
      globalRole:   auth.role,
      buffer:       file.buffer,
      originalName: file.originalname || "preview.png",
      mimeType:     file.mimetype || null
    });
    return { ok: true, fileId: out.fileId, storageUri: out.storageUri, mimeType: out.mimeType };
  }

  // ── POST /v1/workspaces/units/uploads/source ───────────────────────────────

  @Post("uploads/source")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: BUILD_UNIT_SOURCE_MAX_BYTES } }))
  @RateLimit({ key: "units.upload.source", limit: 24, windowSeconds: 60 })
  async uploadSource(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined
  ) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    const out = await this.buildUnits.uploadCatalogSource({
      userId:       auth.userId,
      globalRole:   auth.role,
      buffer:       file.buffer,
      originalName: file.originalname || "source.txt",
      mimeType:     file.mimetype || null
    });
    return { ok: true, fileId: out.fileId, storageUri: out.storageUri, mimeType: out.mimeType };
  }

  // ── GET /v1/workspaces/units/mine ─────────────────────────────────────────
  // Convenience alias — returns only the current user's owned + forked units.

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() req: Request, @Query("type") type?: string, @Query("category") category?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const result = await this.buildUnits.listUnits({ userId: auth.userId, mine: true, type, category });
    const units = await Promise.all(result.units.map((u) => this.formatUnitResponse(auth.userId, u)));
    return {
      ok: true,
      units,
      total: result.total,
      hasMore: result.hasMore
    };
  }

  // ── POST /v1/workspaces/units/seed ────────────────────────────────────────
  // Admin-only: idempotent re-seed of system units.
  // Must be declared before /:id to avoid route collision.

  @Post("seed")
  @UseGuards(JwtAuthGuard)
  async seedUnits(@Req() req: Request) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Forbidden — admin role required." };
    const result = await this.buildUnits.seedSystemUnits();
    return { ok: true, ...result };
  }

  // ── GET /v1/workspaces/units/:id/versions ─────────────────────────────────
  // Declared before :id so routing stays unambiguous.

  @Get(":id/versions")
  @UseGuards(JwtAuthGuard)
  async listVersions(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const versions = await this.buildUnits.listVersions(auth.userId, id);
    return { ok: true, versions };
  }

  // ── POST /v1/workspaces/units/:id/improve ──────────────────────────────────

  @Post(":id/improve")
  @UseGuards(JwtAuthGuard)
  async improveUnit(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body?: { improveIntent?: string }
  ) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.improveUnit(auth.userId, id, {
      improveIntent: typeof body?.improveIntent === "string" ? body.improveIntent : undefined
    });
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── GET /v1/workspaces/units/:id/preview-content ───────────────────────────

  @Get(":id/preview-content")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "units.preview.read", limit: 120, windowSeconds: 60 })
  async previewContent(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("fileId") fileId: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) throw new BadRequestException("Unauthorized");
    const { buffer, mimeType } = await this.buildUnits.getPreviewContentBytes(auth.userId, id, {
      explicitFileId: typeof fileId === "string" ? fileId : undefined
    });
    const m = normalizeMime(mimeType);
    if (BUILD_UNIT_PREVIEW_HTML_MIMES.has(m)) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *; " +
          "img-src data: blob: https: http:; style-src 'unsafe-inline'; font-src data:; " +
          "script-src 'unsafe-inline' 'unsafe-eval'"
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
    return new StreamableFile(buffer, {
      type:        mimeType ?? "application/octet-stream",
      disposition: 'inline; filename="preview"'
    });
  }

  // ── GET /v1/workspaces/units/:id/source-download ───────────────────────────

  @Get(":id/source-download")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "units.source.download", limit: 60, windowSeconds: 60 })
  async sourceDownload(@Req() req: Request, @Param("id") id: string): Promise<StreamableFile> {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) throw new BadRequestException("Unauthorized");
    const { buffer, mimeType, fileName } = await this.buildUnits.getSourceDownloadBytes(auth.userId, id);
    const safe = fileName.replace(/[^\w.\-()+@ ]/g, "_").slice(0, 180) || "source";
    return new StreamableFile(buffer, {
      type:        mimeType ?? "application/octet-stream",
      disposition: `attachment; filename="${safe}"`
    });
  }

  // ── GET /v1/workspaces/units/:id ──────────────────────────────────────────

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getUnit(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.getUnit(auth.userId, id);
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── POST /v1/workspaces/units/:id/fork ───────────────────────────────────

  @Post(":id/fork")
  @UseGuards(JwtAuthGuard)
  async forkUnit(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.forkUnit(auth.userId, id);
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── PATCH /v1/workspaces/units/:id ───────────────────────────────────────

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async updateUnit(@Req() req: Request, @Param("id") id: string, @Body() body: UpdateUnitDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.updateUnit({
      userId: auth.userId,
      unitId: id,
      ...body,
      previewKind: body.previewKind as BuildUnitPreviewKind | undefined
    });
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── DELETE /v1/workspaces/units/:id ──────────────────────────────────────

  @Delete(":id")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async deleteUnit(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.buildUnits.deleteUnit(auth.userId, id);
    return { ok: true };
  }

  // ── POST /v1/workspaces/units/:id/unfork ──────────────────────────────────

  @Post(":id/unfork")
  @UseGuards(JwtAuthGuard)
  async unforkUnit(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const unit = await this.buildUnits.unforkUnit(auth.userId, id);
    return { ok: true, unit: await this.formatUnitResponse(auth.userId, unit) };
  }

  // ── POST /v1/workspaces/units/:id/send-to-task ───────────────────────────

  @Post(":id/send-to-task")
  @UseGuards(JwtAuthGuard)
  async sendToTask(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const { task, taskLinkId } = await this.buildUnits.sendToTask(auth.userId, id);
    return {
      ok: true,
      task: {
        id:     task.id,
        title:  task.title,
        status: task.status
      },
      taskLinkId
    };
  }
}

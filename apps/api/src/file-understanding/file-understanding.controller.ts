import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { FileUnderstandingService } from "./file-understanding.service";
import { RetrievalService } from "./retrieval.service";
import { MultimodalDeepExtractService } from "./multimodal-deep-extract.service";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";
import { FILE_UPLOAD_KIND_VALUES, FileUploadMultipartDto } from "./dto/file-upload-multipart.dto";

const fileKindValues = FILE_UPLOAD_KIND_VALUES;

class RegisterFileDto {
  @IsIn(fileKindValues as any)
  fileKind!: (typeof fileKindValues)[number];

  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @IsOptional()
  @IsString()
  mimeType?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeBytes?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  storageUri?: string;

  @IsOptional()
  @IsUUID()
  uploadHandle?: string;

  @IsOptional()
  @IsString()
  checksum?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  workspaceId?: string | null;

  @IsOptional()
  metadata?: Record<string, unknown> | null;
}

class EnqueueFileUnderstandingDto {
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  vaultSessionId?: string | null;

  @IsOptional()
  @IsString()
  supportTicketId?: string | null;

  @IsBoolean()
  requiresApproval!: boolean;

  @IsOptional()
  @IsString()
  requestedMode?: string;
}

class RetrieveDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;
}

class SimulateMultimodalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  scenario?: string;
}

@Controller("v1/files")
export class FileUnderstandingController {
  constructor(
    private readonly files: FileUnderstandingService,
    private readonly retrieval: RetrievalService,
    private readonly multimodal: MultimodalDeepExtractService,
    private readonly flags: MalvFeatureFlagsService
  ) {}

  /** Production: local storage writable + configured root (object storage adapters can extend this). */
  @Get("storage/health")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "files.storage.health", limit: 30, windowSeconds: 60 })
  async storageHealth(@Req() req: Request) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (auth.role !== "admin") return { ok: false, error: "Forbidden" };
    const h = await this.files.getLocalStorageHealth();
    return { ok: true, storage: { backend: h.backend, writable: h.writable, error: h.error ?? null } };
  }

  @Post("upload")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 52_428_800 } }))
  @RateLimit({
    key: "files.upload",
    limit: 30,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_UPLOAD_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_UPLOAD_WINDOW_SECONDS"
  })
  async upload(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
    @Body() body: FileUploadMultipartDto
  ) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!file?.buffer?.length) return { ok: false, error: "Missing file" };
    const fk = body.fileKind;
    const out = await this.files.persistUploadAndRegister({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      workspaceId: body.workspaceId && body.workspaceId !== "" ? body.workspaceId : null,
      roomId: body.roomId && body.roomId !== "" ? body.roomId : null,
      fileKind: fk,
      originalName: file.originalname || "upload",
      mimeType: file.mimetype || null,
      buffer: file.buffer
    });
    return { ok: true, fileId: out.file.id, storageUri: out.file.storageUri, uploadHandle: out.uploadHandle };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "files.list", limit: 60, windowSeconds: 60 })
  async list(@Req() req: Request, @Query("limit") limitRaw?: string, @Query("offset") offsetRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 40)));
    const offset = Math.max(0, Number(offsetRaw ?? 0));
    const out = await this.files.listFilesForUser({ userId: auth.userId, limit, offset });
    return { ok: true, ...out };
  }

  @Get(":fileId")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ key: "files.detail", limit: 120, windowSeconds: 60 })
  async detail(@Req() req: Request, @Param("fileId") fileId: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const data = await this.files.getFileDetailForUser({ userId: auth.userId, fileId });
    if (!data) return { ok: false, error: "Not found" };
    return { ok: true, ...data };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.register",
    limit: 40,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_REGISTER_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_REGISTER_WINDOW_SECONDS"
  })
  async registerFile(@Req() req: Request, @Body() dto: RegisterFileDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    const file = await this.files.registerFile({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      workspaceId: dto.workspaceId ?? null,
      fileKind: dto.fileKind,
      originalName: dto.originalName,
      mimeType: dto.mimeType ?? null,
      sizeBytes: dto.sizeBytes ?? null,
      uploadHandle: dto.uploadHandle ?? null,
      storageUri: dto.storageUri ?? null,
      checksum: dto.checksum ?? null,
      metadata: dto.metadata ?? null
    });

    return { ok: true, fileId: file.id };
  }

  @Post(":fileId/understand")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.understand",
    limit: 25,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_UNDERSTAND_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_UNDERSTAND_WINDOW_SECONDS"
  })
  async enqueue(@Req() req: Request, @Param("fileId") fileId: string, @Body() dto: EnqueueFileUnderstandingDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };

    const job = await this.files.enqueueFileUnderstanding({
      userId: auth.userId,
      userRole: auth.role === "admin" ? "admin" : "user",
      fileId,
      conversationId: dto.conversationId ?? null,
      vaultSessionId: dto.vaultSessionId ?? null,
      supportTicketId: dto.supportTicketId ?? null,
      requiresApproval: dto.requiresApproval,
      requestedMode: dto.requestedMode
    });

    return { ok: true, aiJobId: job.id, status: job.status, progress: job.progress };
  }

  @Post(":fileId/multimodal/deep")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.multimodal.deep",
    limit: 12,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_MULTIMODAL_DEEP_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_MULTIMODAL_DEEP_WINDOW_SECONDS"
  })
  async enqueueMultimodal(@Req() req: Request, @Param("fileId") fileId: string) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.multimodal.enqueueDeepExtraction({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      fileId
    });
    return { ok: true, ...out };
  }

  @Get(":fileId/multimodal/deep")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.multimodal.deep.read",
    limit: 60,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_MULTIMODAL_READ_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_MULTIMODAL_READ_WINDOW_SECONDS"
  })
  async getMultimodal(@Req() req: Request, @Param("fileId") fileId: string) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const row = await this.multimodal.getLatestExtractionForFile({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      fileId
    });
    if (!row) return { ok: false, error: "No extraction yet" };
    return {
      ok: true,
      extraction: {
        id: row.id,
        status: row.status,
        modality: row.modality,
        unifiedResult: row.unifiedResult ?? null,
        retrievalText: row.retrievalText ?? null,
        sectionsJson: row.sectionsJson ?? null,
        pageMetaJson: row.pageMetaJson ?? null,
        tablesFiguresJson: row.tablesFiguresJson ?? null,
        segmentMetaJson: row.segmentMetaJson ?? null,
        imageAnalysisJson: row.imageAnalysisJson ?? null,
        processorVersion: row.processorVersion ?? null,
        errorMessage: row.errorMessage ?? null,
        aiJobId: (row.aiJob as any)?.id ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }
    };
  }

  /**
   * Dev-harness only: synthetic fixture rows. Production path is POST .../multimodal/deep after real upload.
   */
  @Post(":fileId/multimodal/deep/dev-harness")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.multimodal.deep.dev_harness",
    limit: 20,
    windowSeconds: 60
  })
  async devHarnessMultimodal(@Req() req: Request, @Param("fileId") fileId: string, @Body() dto: SimulateMultimodalDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!this.flags.devHarnessEnabled()) {
      throw new ForbiddenException(
        "Dev harness disabled. Production: POST /v1/files/upload then POST /v1/files/:fileId/multimodal/deep"
      );
    }
    const out = await this.multimodal.createSimulatedExtraction({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      fileId,
      scenario: dto.scenario
    });
    return { ok: true, ...out };
  }

  /** @deprecated Use POST .../multimodal/deep/dev-harness */
  @Post(":fileId/multimodal/deep/simulate")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.multimodal.deep.simulate",
    limit: 20,
    windowSeconds: 60
  })
  async simulateMultimodal(@Req() req: Request, @Param("fileId") fileId: string, @Body() dto: SimulateMultimodalDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    if (!this.flags.devHarnessEnabled()) {
      throw new ForbiddenException(
        "Dev harness disabled. Production: POST /v1/files/upload then POST /v1/files/:fileId/multimodal/deep"
      );
    }
    const out = await this.multimodal.createSimulatedExtraction({
      userId: auth.userId,
      globalRole: auth.role === "admin" ? "admin" : "user",
      fileId,
      scenario: dto.scenario
    });
    return { ok: true, ...out };
  }

  @Post("retrieve")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.retrieve.global",
    limit: 45,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_RETRIEVE_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_RETRIEVE_WINDOW_SECONDS"
  })
  async retrieve(@Req() req: Request, @Body() dto: RetrieveDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const hits = await this.retrieval.semanticRetrieve({
      userId: auth.userId,
      query: dto.query,
      topK: dto.topK
    });
    return { ok: true, hits };
  }

  @Post(":fileId/retrieve")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    key: "files.retrieve.scoped",
    limit: 45,
    windowSeconds: 60,
    limitEnvKey: "RATE_LIMIT_FILES_RETRIEVE_PER_MINUTE",
    windowEnvKey: "RATE_LIMIT_FILES_RETRIEVE_WINDOW_SECONDS"
  })
  async retrieveForFile(@Req() req: Request, @Param("fileId") fileId: string, @Body() dto: RetrieveDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const hits = await this.retrieval.semanticRetrieve({
      userId: auth.userId,
      fileId,
      query: dto.query,
      topK: dto.topK
    });
    return { ok: true, hits };
  }
}

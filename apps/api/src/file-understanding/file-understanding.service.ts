import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { In, Repository } from "typeorm";

import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AiJobEntity, type AiJobStatus, type AiJobType } from "../db/entities/ai-job.entity";
import { FileEntity, type FileKind } from "../db/entities/file.entity";
import { FileContextEntity, type FileContextType } from "../db/entities/file-context.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { VaultSessionEntity, type VaultSessionStatus } from "../db/entities/vault-session.entity";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { WorkspaceAccessService, type GlobalRole } from "../workspace/workspace-access.service";
import { UploadHandleEntity } from "../db/entities/upload-handle.entity";
import { AuthorizationService } from "../common/authorization/authorization.service";
import { ObservabilityService } from "../common/observability.service";

type FileUnderstandPayload = {
  fileId: string;
  fileContextIds: string[];
  requiresApproval: boolean;
  maxExtractBytes: number;
  // Helps the sandbox executor with policy-gating later.
  requestedBy: "api";
};

@Injectable()
export class FileUnderstandingService {
  private readonly logger = new Logger(FileUnderstandingService.name);
  private readonly uploadMetrics = {
    uploadHandleRegistrations: 0,
    legacyStorageUriRegistrations: 0
  };

  constructor(
    private readonly killSwitch: KillSwitchService,
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    @InjectRepository(FileEntity) private readonly files: Repository<FileEntity>,
    @InjectRepository(FileContextEntity) private readonly fileContexts: Repository<FileContextEntity>,
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(VaultSessionEntity) private readonly vaultSessions: Repository<VaultSessionEntity>,
    @InjectRepository(SupportTicketEntity) private readonly tickets: Repository<SupportTicketEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(RoomMemberEntity) private readonly roomMembers: Repository<RoomMemberEntity>,
    @InjectRepository(UploadHandleEntity) private readonly uploadHandles: Repository<UploadHandleEntity>,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly authz: AuthorizationService,
    private readonly observability: ObservabilityService
  ) {}

  private storageRoot(): string {
    return this.cfg.get<string>("PRIVATE_STORAGE_ROOT") ?? "/tmp/malv-storage";
  }

  private assertStorageBackendSafeForDeployment() {
    const mode = (this.cfg.get<string>("MALV_DEPLOYMENT_MODE") ?? "single_instance").toLowerCase();
    if (mode !== "multi_instance") return;
    const backend = (this.cfg.get<string>("MALV_STORAGE_BACKEND") ?? "local_private").toLowerCase();
    if (backend === "local_private") {
      const shared = (this.cfg.get<string>("MALV_SHARED_FILESYSTEM_CONFIRMED") ?? "false").toLowerCase() === "true";
      if (!shared) {
        throw new BadRequestException(
          "MALV multi-instance requires shared/object storage. Set MALV_SHARED_FILESYSTEM_CONFIRMED=true or use an object-backed storage backend."
        );
      }
    }
  }

  private safeOriginalName(name: string): string {
    const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
    return base.slice(0, 200) || "upload.bin";
  }

  private async assertStorageUriOwnedByUser(args: { userId: string; storageUri: string }) {
    const rel = String(args.storageUri ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel) throw new BadRequestException("Invalid storage URI.");
    const ownerPrefix = `users/${args.userId}/`;
    if (!rel.startsWith(ownerPrefix)) {
      throw new BadRequestException("Invalid storage URI.");
    }
    const root = path.resolve(this.storageRoot());
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) {
      throw new BadRequestException("Invalid storage URI.");
    }
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonicalFull = await fs.realpath(full).catch(() => null);
    if (!canonicalRoot || !canonicalFull) throw new BadRequestException("Storage object not found.");
    if (!canonicalFull.startsWith(canonicalRoot + path.sep)) {
      throw new BadRequestException("Invalid storage URI.");
    }
    const lstat = await fs.lstat(canonicalFull).catch(() => null);
    if (!lstat || lstat.isSymbolicLink()) {
      throw new BadRequestException("Storage object not found.");
    }
    const stat = await fs.stat(canonicalFull).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new BadRequestException("Storage object not found.");
    }
  }

  private async mintUploadHandle(args: {
    userId: string;
    storageUri: string;
    originalName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksum?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const ttlSec = Number(this.cfg.get<string>("MALV_UPLOAD_HANDLE_TTL_SECONDS") ?? 900);
    const row = this.uploadHandles.create({
      user: { id: args.userId } as any,
      status: "pending",
      storageUri: args.storageUri,
      originalName: args.originalName,
      mimeType: args.mimeType ?? null,
      sizeBytes: args.sizeBytes != null ? String(args.sizeBytes) : null,
      checksum: args.checksum ?? null,
      metadata: args.metadata ?? null,
      expiresAt: new Date(Date.now() + Math.max(60, ttlSec) * 1000)
    });
    await this.uploadHandles.save(row);
    return row;
  }

  private async resolveUploadHandle(args: { userId: string; uploadHandle: string }) {
    const handle = await this.uploadHandles.findOne({
      where: { id: args.uploadHandle, user: { id: args.userId } }
    });
    if (!handle) throw new BadRequestException("Upload handle not found.");
    if (handle.status !== "pending") throw new BadRequestException("Upload handle is not usable.");
    if (handle.expiresAt.getTime() < Date.now()) {
      handle.status = "expired";
      await this.uploadHandles.save(handle);
      throw new BadRequestException("Upload handle expired.");
    }
    await this.assertStorageUriOwnedByUser({ userId: args.userId, storageUri: handle.storageUri });
    this.logger.log(
      JSON.stringify({
        tag: "upload_handle.resolved",
        userId: args.userId,
        uploadHandleId: handle.id,
        expiresAt: handle.expiresAt.toISOString()
      })
    );
    return handle;
  }

  /**
   * Production path: persist bytes under PRIVATE_STORAGE_ROOT and register a file row.
   * storageUri is the relative path under the storage root (same contract as multimodal extraction).
   */
  async persistUploadAndRegister(args: {
    userId: string;
    globalRole?: GlobalRole;
    workspaceId?: string | null;
    roomId?: string | null;
    fileKind: FileKind;
    originalName: string;
    mimeType?: string | null;
    buffer: Buffer;
  }): Promise<{ file: FileEntity; uploadHandle: string }> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "file_register_mutation" });
    this.assertStorageBackendSafeForDeployment();

    const maxBytes = Number(this.cfg.get<string>("MALV_UPLOAD_MAX_BYTES") ?? String(52_428_800));
    if (args.buffer.length > maxBytes) {
      throw new BadRequestException(`File exceeds maximum size (${maxBytes} bytes).`);
    }

    const relDir = path.join("users", args.userId, "uploads");
    const relPath = path.join(relDir, `${randomUUID()}_${this.safeOriginalName(args.originalName)}`);
    const root = path.resolve(this.storageRoot());
    const full = path.resolve(root, relPath);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new BadRequestException("Invalid storage path.");
    }
    await fs.mkdir(path.dirname(full), { recursive: true });
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonicalParent = await fs.realpath(path.dirname(full)).catch(() => null);
    if (!canonicalRoot || !canonicalParent || !canonicalParent.startsWith(canonicalRoot + path.sep)) {
      throw new BadRequestException("Invalid storage path.");
    }
    const writePath = path.resolve(canonicalParent, path.basename(full));
    const lst = await fs.lstat(writePath).catch(() => null);
    if (lst?.isSymbolicLink()) {
      throw new BadRequestException("Invalid storage path.");
    }
    await fs.writeFile(writePath, args.buffer);

    const checksum = createHash("sha256").update(args.buffer).digest("hex");

    const handle = await this.mintUploadHandle({
      userId: args.userId,
      storageUri: relPath.replace(/\\/g, "/"),
      originalName: args.originalName,
      mimeType: args.mimeType ?? null,
      sizeBytes: args.buffer.length,
      checksum,
      metadata: { ingest: "multipart_upload", storageBackend: "local_private" }
    });

    const file = await this.registerFile({
      userId: args.userId,
      globalRole: args.globalRole ?? "user",
      workspaceId: args.workspaceId ?? null,
      roomId: args.roomId ?? null,
      fileKind: args.fileKind,
      originalName: args.originalName,
      mimeType: args.mimeType ?? null,
      sizeBytes: args.buffer.length,
      uploadHandle: handle.id
    });
    return { file, uploadHandle: handle.id };
  }

  async getLocalStorageHealth(): Promise<{
    backend: "local_private";
    root: string;
    writable: boolean;
    error?: string;
  }> {
    const root = path.resolve(this.storageRoot());
    try {
      await fs.mkdir(root, { recursive: true });
      const probe = path.join(root, ".malv_write_probe");
      await fs.writeFile(probe, `ok-${Date.now()}`);
      await fs.rm(probe, { force: true });
      return { backend: "local_private", root, writable: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { backend: "local_private", root, writable: false, error: msg };
    }
  }

  async registerFile(args: {
    userId: string;
    globalRole?: GlobalRole;
    workspaceId?: string | null;
    roomId?: string | null;
    fileKind: FileKind;
    originalName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    uploadHandle?: string | null;
    storageUri?: string | null;
    checksum?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<FileEntity> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "file_register_mutation" });

    if (args.workspaceId) {
      await this.workspaceAccess.assertWorkspacePermissionOrThrow({
        userId: args.userId,
        globalRole: args.globalRole ?? "user",
        workspaceId: args.workspaceId,
        requiredPermissions: ["workspace.files.write"],
        route: "POST /v1/files",
        method: "POST"
      });
    }
    if (args.roomId) {
      await this.authz.assertRoomMemberOrThrow({ userId: args.userId, roomId: args.roomId });
    }

    let storageUri = (args.storageUri ?? "").trim();
    let checksum = args.checksum ?? null;
    let metadata = args.metadata ?? null;
    if (args.uploadHandle) {
      const handle = await this.resolveUploadHandle({ userId: args.userId, uploadHandle: args.uploadHandle });
      storageUri = handle.storageUri;
      checksum = handle.checksum ?? checksum;
      metadata = { ...(metadata ?? {}), ...(handle.metadata ?? {}), uploadHandle: handle.id };
      handle.status = "consumed";
      handle.consumedAt = new Date();
      await this.uploadHandles.save(handle);
      this.uploadMetrics.uploadHandleRegistrations += 1;
      this.observability.incUploadRegisterPath("upload_handle");
      this.logger.log(
        JSON.stringify({
          tag: "file.register",
          mode: "upload_handle",
          userId: args.userId,
          uploadHandleId: handle.id,
          metrics: this.uploadMetrics
        })
      );
    } else if ((args.globalRole ?? "user") !== "admin") {
      const allowLegacy = (this.cfg.get<string>("MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER") ?? "false").toLowerCase() === "true";
      if (!allowLegacy) {
        throw new BadRequestException("uploadHandle is required.");
      }
      if (!storageUri) throw new BadRequestException("uploadHandle is required.");
      await this.assertStorageUriOwnedByUser({ userId: args.userId, storageUri });
      this.uploadMetrics.legacyStorageUriRegistrations += 1;
      this.observability.incUploadRegisterPath("legacy_storage_uri");
      this.observability.incLegacyPathUsage("file_register_storage_uri");
      this.logger.warn(
        JSON.stringify({
          tag: "file.register.legacy_storage_uri",
          mode: "legacy_storage_uri",
          userId: args.userId,
          deprecation: "use_upload_handle",
          removeAfter: "2026-09-30",
          metrics: this.uploadMetrics
        })
      );
    }

    const entity = this.files.create({
      user: { id: args.userId } as any,
      workspace: args.workspaceId ? ({ id: args.workspaceId } as any) : null,
      collaborationRoom: args.roomId ? ({ id: args.roomId } as any) : null,
      fileKind: args.fileKind,
      originalName: args.originalName,
      mimeType: args.mimeType ?? null,
      sizeBytes: args.sizeBytes != null ? String(args.sizeBytes) : null,
      storageUri,
      checksum,
      metadata
    });

    await this.files.save(entity);
    return entity;
  }

  async enqueueFileUnderstanding(args: {
    userId: string;
    userRole?: GlobalRole;
    fileId: string;
    conversationId?: string | null;
    vaultSessionId?: string | null;
    supportTicketId?: string | null;
    requiresApproval: boolean;
    requestedMode?: string;
  }): Promise<AiJobEntity> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "file_understand_schedule" });

    const file = await this.authz.assertFileReadableOrThrow({ userId: args.userId, fileId: args.fileId });

    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: args.userRole ?? "user",
      workspaceId: file.workspace?.id ?? null,
      requiredPermissions: file.workspace ? ["workspace.files.read"] : [],
      route: "POST /v1/files/:fileId/understand",
      method: "POST"
    });

    const contextIds: string[] = [];

    if (args.conversationId) {
      const conv = await this.conversations.findOne({ where: { id: args.conversationId }, relations: { user: true } });
      if (!conv) throw new BadRequestException("Conversation not found.");
      if (conv.mode !== "collaboration") {
        if (conv.user?.id !== args.userId) throw new BadRequestException("Conversation not found.");
      } else {
        const room = await this.rooms.findOne({ where: { conversationId: conv.id } });
        if (!room) throw new BadRequestException("Conversation not found.");
        const membership = await this.roomMembers.findOne({
          where: { room: { id: room.id }, user: { id: args.userId } }
        });
        if (!membership) throw new BadRequestException("Conversation not found.");
      }
      const ctx = this.fileContexts.create({
        user: { id: args.userId } as any,
        file: { id: file.id } as any,
        contextType: "chat" as FileContextType,
        contextId: args.conversationId,
        metadata: { linkedBy: "chat", conversationMode: conv.mode }
      });
      await this.fileContexts.save(ctx);
      contextIds.push(ctx.id);
    }

    if (args.vaultSessionId) {
      const vs = await this.vaultSessions.findOne({
        where: { id: args.vaultSessionId, user: { id: args.userId }, status: "open" as VaultSessionStatus }
      });
      if (!vs) throw new BadRequestException("Vault session not found/open or not owned by user.");
      const ctx = this.fileContexts.create({
        user: { id: args.userId } as any,
        file: { id: file.id } as any,
        contextType: "vault" as FileContextType,
        contextId: args.vaultSessionId,
        metadata: { linkedBy: "vault", accessLabel: vs.accessLabel ?? null }
      });
      await this.fileContexts.save(ctx);
      contextIds.push(ctx.id);
    }

    if (args.supportTicketId) {
      const ticket = await this.tickets.findOne({ where: { id: args.supportTicketId, user: { id: args.userId } } });
      if (!ticket) throw new BadRequestException("Support ticket not found or not owned by user.");
      const ctx = this.fileContexts.create({
        user: { id: args.userId } as any,
        file: { id: file.id } as any,
        contextType: "support" as FileContextType,
        contextId: args.supportTicketId,
        metadata: { linkedBy: "support", priority: ticket.priority, status: ticket.status }
      });
      await this.fileContexts.save(ctx);
      contextIds.push(ctx.id);
    }

    if (contextIds.length === 0) throw new BadRequestException("At least one context link is required.");

    const maxExtractBytes = Number(this.cfg.get<string>("SANDBOX_MAX_EXTRACT_BYTES") ?? "200000");

    const aiJob = this.aiJobs.create({
      user: { id: args.userId } as any,
      conversation: (args.conversationId ? ({ id: args.conversationId } as any) : null) as any,
      jobType: "file_understand" as AiJobType,
      requestedMode: args.requestedMode ?? "cpu",
      classifiedMode: "extract",
      status: "queued" as AiJobStatus,
      progress: 0,
      shardKey: "file_understand:normal",
      queuePriority: 60,
      payload: {
        fileId: file.id,
        fileContextIds: contextIds,
        requiresApproval: args.requiresApproval,
        maxExtractBytes,
        requestedBy: "api"
      } satisfies FileUnderstandPayload
    });

    await this.aiJobs.save(aiJob);

    this.realtime.emitToUser(args.userId, "job:update", {
      aiJobId: aiJob.id,
      status: aiJob.status,
      progress: aiJob.progress
    });

    return aiJob;
  }

  async listFilesForUser(args: { userId: string; limit: number; offset: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "files_read" });
    const [ownedRows, ownedTotal] = await this.files.findAndCount({
      where: { user: { id: args.userId } },
      relations: ["collaborationRoom"],
      order: { createdAt: "DESC" },
      take: args.limit + args.offset
    });
    const memberships = await this.roomMembers.find({
      where: { user: { id: args.userId } },
      relations: { room: true }
    });
    const roomIds = memberships.map((m) => m.room?.id).filter((id): id is string => Boolean(id));
    const [sharedRows, sharedTotal] =
      roomIds.length > 0
        ? await this.files.findAndCount({
            where: roomIds.map((id) => ({ collaborationRoom: { id } })) as any,
            relations: ["collaborationRoom"],
            order: { createdAt: "DESC" },
            take: args.limit + args.offset
          })
        : [[], 0];
    const merged = [...ownedRows, ...sharedRows]
      .filter((f, i, all) => all.findIndex((x) => x.id === f.id) === i)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const rows = merged.slice(args.offset, args.offset + args.limit);
    const overlapCount =
      roomIds.length > 0
        ? await this.files.count({ where: { user: { id: args.userId }, collaborationRoom: In(roomIds) } as any })
        : 0;
    const total = ownedTotal + sharedTotal - overlapCount;
    return {
      items: rows.map((f) => ({
        id: f.id,
        fileKind: f.fileKind,
        originalName: f.originalName,
        mimeType: f.mimeType ?? null,
        sizeBytes: f.sizeBytes ?? null,
        storageUri: f.storageUri,
        collaborationRoomId: (f.collaborationRoom as any)?.id ?? null,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
      })),
      total
    };
  }

  /**
   * Ensures a file row exists and is owned by the given user (for attaching to user-owned entities).
   */
  async assertUserOwnsFile(userId: string, fileId: string): Promise<FileEntity> {
    const file = await this.files.findOne({ where: { id: fileId }, relations: ["user"] });
    if (!file || (file.user as { id: string }).id !== userId) {
      throw new BadRequestException("Invalid or inaccessible file reference.");
    }
    return file;
  }

  /**
   * Read bytes for a file that must belong to authorUserId (e.g. build unit preview owned by unit author).
   */
  async readBinaryForAuthorFile(args: {
    fileId: string;
    authorUserId: string;
  }): Promise<{ buffer: Buffer; mimeType: string | null; fileName: string }> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "files_read" });
    this.assertStorageBackendSafeForDeployment();
    const file = await this.files.findOne({ where: { id: args.fileId }, relations: ["user"] });
    if (!file || (file.user as { id: string }).id !== args.authorUserId) {
      throw new NotFoundException("File not found.");
    }
    const root = path.resolve(this.storageRoot());
    const rel = file.storageUri.replace(/\\/g, "/").replace(/^\/+/, "");
    const full = path.resolve(root, rel);
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonicalFull = await fs.realpath(full).catch(() => null);
    if (!canonicalRoot || !canonicalFull || !canonicalFull.startsWith(canonicalRoot + path.sep)) {
      throw new NotFoundException("File not found.");
    }
    const lst = await fs.lstat(canonicalFull).catch(() => null);
    if (lst?.isSymbolicLink()) {
      throw new NotFoundException("File not found.");
    }
    const buffer = await fs.readFile(canonicalFull);
    return { buffer, mimeType: file.mimeType ?? null, fileName: file.originalName };
  }

  /**
   * Read stored bytes by file id without an ownership check.
   * Caller must prove the file is an allowed build-unit preview artifact (e.g. linked on a public system unit
   * or already scoped via getPreviewContentBytes).
   */
  async readBinaryForBuildUnitPreviewArtifact(fileId: string): Promise<{
    buffer: Buffer;
    mimeType: string | null;
    fileName: string;
  }> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "files_read" });
    this.assertStorageBackendSafeForDeployment();
    const file = await this.files.findOne({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException("File not found.");
    }
    const root = path.resolve(this.storageRoot());
    const rel = file.storageUri.replace(/\\/g, "/").replace(/^\/+/, "");
    const full = path.resolve(root, rel);
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonicalFull = await fs.realpath(full).catch(() => null);
    if (!canonicalRoot || !canonicalFull || !canonicalFull.startsWith(canonicalRoot + path.sep)) {
      throw new NotFoundException("File not found.");
    }
    const lst = await fs.lstat(canonicalFull).catch(() => null);
    if (lst?.isSymbolicLink()) {
      throw new NotFoundException("File not found.");
    }
    const buffer = await fs.readFile(canonicalFull);
    return { buffer, mimeType: file.mimeType ?? null, fileName: file.originalName };
  }

  async getFileDetailForUser(args: { userId: string; fileId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "files_read" });
    let file: FileEntity;
    try {
      file = await this.authz.assertFileReadableOrThrow({ userId: args.userId, fileId: args.fileId });
    } catch {
      return null;
    }

    const jobsRaw = await this.aiJobs.find({
      where: { user: { id: args.userId } },
      order: { createdAt: "DESC" },
      take: 80
    });
    const relatedJobs = jobsRaw.filter((j) => {
      const fid = (j.payload as { fileId?: string } | null)?.fileId;
      return fid === args.fileId;
    });

    return {
      file: {
        id: file.id,
        fileKind: file.fileKind,
        originalName: file.originalName,
        mimeType: file.mimeType ?? null,
        sizeBytes: file.sizeBytes ?? null,
        storageUri: file.storageUri,
        metadata: file.metadata ?? null,
        workspaceId: file.workspace?.id ?? null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
      },
      relatedJobs: relatedJobs.slice(0, 20).map((j) => ({
        id: j.id,
        jobType: j.jobType,
        status: j.status,
        progress: j.progress,
        shardKey: j.shardKey,
        errorMessage: j.errorMessage ?? null,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt ?? null
      }))
    };
  }
}


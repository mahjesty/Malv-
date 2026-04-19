import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, EntityManager, IsNull, Repository } from "typeorm";
import { randomUUID } from "crypto";
import {
  BuildUnitEntity,
  type BuildUnitPreviewKind,
  type BuildUnitType,
  type BuildUnitVisibility
} from "../db/entities/build-unit.entity";
import { BuildUnitTaskLinkEntity } from "../db/entities/build-unit-task-link.entity";
import { BuildUnitVersionEntity } from "../db/entities/build-unit-version.entity";
import { BuildUnitCompositionEntity } from "../db/entities/build-unit-composition.entity";
import { WorkspaceProductivityService } from "../workspace/workspace-productivity.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { computeExecutionProfile } from "./build-unit-execution-profile.util";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import {
  assertPreviewUploadAllowed,
  assertSourceUploadAllowed,
  BUILD_UNIT_PREVIEW_ALL_MIMES,
  BUILD_UNIT_PREVIEW_HTML_MIMES,
  BUILD_UNIT_PREVIEW_MIMES,
  BUILD_UNIT_SOURCE_EXTENSIONS,
  BUILD_UNIT_SOURCE_MIMES,
  extFromName,
  normalizeMime
} from "./build-unit-upload.constants";
import { buildCatalogPreviewSnapshotSvg } from "./build-unit-preview-snapshot.svg";
import { tryRenderHtmlCatalogSnapshotPng } from "./catalog-html-to-png.util";
import { SYSTEM_UNITS } from "./system-catalog.definitions";
import { sanitizePreviewImageUrlForPersistence } from "./published-preview-image-url.util";
import type { FrontendPreviewBuilderService } from "./frontend-preview-builder.service";
import { extractIntakeSourceFiles } from "../source-intake/source-intake-static-audit.util";
// ─── Query args ───────────────────────────────────────────────────────────────

export interface ListUnitsArgs {
  userId:    string;
  type?:     string;
  category?: string;
  section?:  "trending" | "recommended" | "new";
  mine?:     boolean;
  forked?:   boolean;
  search?:   string;
  limit?:    number;
  page?:     number;
}

export interface UpdateUnitArgs {
  userId:      string;
  unitId:      string;
  title?:      string;
  description?: string | null;
  tags?:        string[] | null;
  prompt?:      string | null;
  codeSnippet?: string | null;
  category?:    string;
  visibility?:  BuildUnitVisibility;
  forkable?:    boolean;
  downloadable?: boolean;
  accent?:      string | null;
  previewKind?:       BuildUnitPreviewKind;
  previewImageUrl?:   string | null;
  previewFileId?:     string | null;
  sourceFileId?:      string | null;
  sourceFileName?:    string | null;
  sourceFileMime?:    string | null;
  sourceFileUrl?:     string | null;
}

export interface CreateUnitArgs {
  userId:       string;
  title:        string;
  description?: string | null;
  type:         string;
  category:     string;
  tags?:        string[] | null;
  prompt?:      string | null;
  codeSnippet?: string | null;
  visibility?:  BuildUnitVisibility;
  forkable?:    boolean;
  downloadable?: boolean;
  accent?:      string | null;
  metadataJson?: Record<string, unknown> | null;
  previewKind?:       BuildUnitPreviewKind;
  previewImageUrl?:   string | null;
  previewFileId?:     string | null;
  sourceFileId?:      string | null;
  sourceFileName?:    string | null;
  sourceFileMime?:    string | null;
  sourceFileUrl?:     string | null;
}

export interface CreateCompositionArgs {
  userId:       string;
  name:         string;
  unitIds:      string[];
  metadataJson?: Record<string, unknown> | null;
}


// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BuildUnitService implements OnModuleInit {
  private readonly logger = new Logger(BuildUnitService.name);

  constructor(
    @InjectRepository(BuildUnitEntity)
    private readonly units: Repository<BuildUnitEntity>,
    @InjectRepository(BuildUnitTaskLinkEntity)
    private readonly taskLinks: Repository<BuildUnitTaskLinkEntity>,
    private readonly productivity: WorkspaceProductivityService,
    @InjectRepository(BuildUnitVersionEntity)
    private readonly versions: Repository<BuildUnitVersionEntity>,
    @InjectRepository(BuildUnitCompositionEntity)
    private readonly compositions: Repository<BuildUnitCompositionEntity>,
    private readonly fileUnderstanding: FileUnderstandingService,
    @Optional() private readonly beastWorker?: BeastWorkerClient,
    @Optional() private readonly frontendPreviewBuilder?: FrontendPreviewBuilderService
  ) {}

  /** Seeds the system catalog on every boot (idempotent — skips existing slugs). */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.seedSystemUnits();
      if (result.seeded > 0) {
        this.logger.log(`Build Units: seeded ${result.seeded} system unit(s), skipped ${result.skipped}`);
      }
      const sync = await this.reconcileSystemCatalogRowsFromDefinitions();
      if (sync.updated > 0) {
        this.logger.log(`Build Units: reconciled ${sync.updated} system catalog row(s) with definitions`);
      }
    } catch (err) {
      this.logger.error(`Build Units seed failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Applies `SYSTEM_UNITS` definitions to existing `sourceKind=system` rows (titles, flags, previews, metadata).
   * Keeps usage counters and ids stable across deploys.
   */
  async reconcileSystemCatalogRowsFromDefinitions(): Promise<{ updated: number }> {
    let updated = 0;
    for (const def of SYSTEM_UNITS) {
      const row = await this.units.findOne({
        where: { slug: def.slug, sourceKind: "system", archivedAt: IsNull() }
      });
      if (!row) continue;

      let dirty = false;
      const r = row as unknown as Record<string, unknown>;
      for (const [rawKey, val] of Object.entries(def)) {
        if (rawKey === "slug") continue;
        const cur = r[rawKey];
        if (JSON.stringify(cur) !== JSON.stringify(val)) {
          r[rawKey] = val;
          dirty = true;
        }
      }

      if (dirty) {
        row.executionProfileJson = computeExecutionProfile(row) as Record<string, unknown> | null;
        await this.units.save(row);
        updated++;
      }
    }
    return { updated };
  }

  // ── Listing ────────────────────────────────────────────────────────────────

  async listUnits(args: ListUnitsArgs): Promise<{ units: BuildUnitEntity[]; total: number; hasMore: boolean }> {
    const limit = Math.min(100, Math.max(1, args.limit ?? 50));
    const page  = Math.max(0, (args.page ?? 1) - 1);
    const skip  = page * limit;

    const qb = this.units.createQueryBuilder("u")
      .where("u.archived_at IS NULL");

    if (args.mine) {
      // Owner's own units
      qb.andWhere("u.author_user_id = :userId", { userId: args.userId });
    } else if (args.forked) {
      // User's forks (have originalBuildUnitId set and belong to user)
      qb.andWhere("u.author_user_id = :userId", { userId: args.userId })
        .andWhere("u.original_build_unit_id IS NOT NULL");
    } else {
      // Public catalog: system units + user's own private units + public user units
      qb.andWhere(
        "(u.visibility = 'public' OR u.author_user_id = :userId)",
        { userId: args.userId }
      );
    }

    if (args.type && args.type !== "all") {
      qb.andWhere("u.type = :type", { type: args.type });
    }
    if (args.category && args.category !== "all") {
      qb.andWhere("u.category = :category", { category: args.category });
    }
    if (args.section === "trending") {
      qb.andWhere("u.trending = 1");
    } else if (args.section === "recommended") {
      qb.andWhere("u.recommended = 1").andWhere("u.trending = 0");
    } else if (args.section === "new") {
      qb.andWhere("u.is_new = 1").andWhere("u.trending = 0").andWhere("u.recommended = 0");
    }
    if (args.search) {
      const raw = args.search.trim().slice(0, 500);
      const words = raw
        .split(/\s+/)
        .map((w) => w.replace(/[%_\\]/g, "\\$&"))
        .filter((w) => w.length >= 2)
        .slice(0, 12);
      if (words.length) {
        qb.andWhere(
          new Brackets((outer) => {
            for (let i = 0; i < words.length; i++) {
              const key = `sw${i}`;
              const term = `%${words[i]}%`;
              outer.andWhere(
                new Brackets((inner) => {
                  inner
                    .where(`u.title LIKE :${key}`, { [key]: term })
                    .orWhere(`u.description LIKE :${key}`, { [key]: term })
                    .orWhere(`u.slug LIKE :${key}`, { [key]: term })
                    .orWhere(`u.category LIKE :${key}`, { [key]: term })
                    .orWhere(`u.prompt LIKE :${key}`, { [key]: term })
                    .orWhere(`u.code_snippet LIKE :${key}`, { [key]: term })
                    .orWhere(`CAST(u.tags AS CHAR) LIKE :${key}`, { [key]: term });
                })
              );
            }
          })
        );
      }
    }

    const searchTrim = (args.search ?? "").trim();
    const catalogBrowse = !args.mine && !args.forked && searchTrim.length === 0;
    if (catalogBrowse) {
      qb.andWhere(
        "(u.metadata_json IS NULL OR JSON_EXTRACT(u.metadata_json, '$.malvExploreBrowseExclude') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(u.metadata_json, '$.malvExploreBrowseExclude')) <> :browseExTrue)",
        { browseExTrue: "true" }
      );
    }

    const total = await qb.clone().getCount();

    if (catalogBrowse) {
      qb.orderBy(
        "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(u.metadata_json, '$.malvExploreFeaturedRank')) AS UNSIGNED), 999)",
        "ASC"
      )
        .addOrderBy("u.uses_count", "DESC")
        .addOrderBy("u.created_at", "DESC");
    } else {
      qb.orderBy("u.uses_count", "DESC").addOrderBy("u.created_at", "DESC");
    }

    qb.skip(skip).take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    return { units: rows.slice(0, limit), total, hasMore };
  }

  // ── Single unit ────────────────────────────────────────────────────────────

  async getUnit(userId: string, unitId: string): Promise<BuildUnitEntity> {
    const unit = await this.units.findOne({ where: { id: unitId, archivedAt: IsNull() } });
    if (!unit) throw new NotFoundException("Build unit not found.");
    if (unit.visibility === "private" && unit.authorUserId !== userId) {
      throw new ForbiddenException("Access denied.");
    }
    if (unit.executionProfileJson == null) {
      const profile = computeExecutionProfile(unit);
      await this.units.update({ id: unit.id }, { executionProfileJson: profile as object | null });
      unit.executionProfileJson = profile as Record<string, unknown>;
    }
    return unit;
  }

  // ── Catalog uploads (bytes → files row; referenced from build_units) ───────

  async uploadCatalogPreview(args: {
    userId: string;
    globalRole?: string;
    buffer: Buffer;
    originalName: string;
    mimeType?: string | null;
  }): Promise<{ fileId: string; storageUri: string; mimeType: string | null }> {
    try {
      assertPreviewUploadAllowed({ mimeType: args.mimeType, sizeBytes: args.buffer.length });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
    const m = normalizeMime(args.mimeType);
    const out = await this.fileUnderstanding.persistUploadAndRegister({
      userId: args.userId,
      globalRole: args.globalRole === "admin" ? "admin" : "user",
      workspaceId: null,
      roomId: null,
      fileKind: BUILD_UNIT_PREVIEW_HTML_MIMES.has(m) ? "text" : "image",
      originalName: args.originalName || (BUILD_UNIT_PREVIEW_HTML_MIMES.has(m) ? "preview.html" : "preview.png"),
      mimeType: args.mimeType ?? null,
      buffer: args.buffer
    });
    return {
      fileId:     out.file.id,
      storageUri: out.file.storageUri,
      mimeType:   out.file.mimeType ?? null
    };
  }

  async uploadCatalogSource(args: {
    userId: string;
    globalRole?: string;
    buffer: Buffer;
    originalName: string;
    mimeType?: string | null;
  }): Promise<{ fileId: string; storageUri: string; mimeType: string | null }> {
    try {
      assertSourceUploadAllowed({
        mimeType:     args.mimeType,
        originalName: args.originalName || "source.txt",
        sizeBytes:    args.buffer.length
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
    const out = await this.fileUnderstanding.persistUploadAndRegister({
      userId: args.userId,
      globalRole: args.globalRole === "admin" ? "admin" : "user",
      workspaceId: null,
      roomId: null,
      fileKind: "text",
      originalName: args.originalName || "source.txt",
      mimeType: args.mimeType ?? null,
      buffer: args.buffer
    });
    return {
      fileId:     out.file.id,
      storageUri: out.file.storageUri,
      mimeType:   out.file.mimeType ?? null
    };
  }

  /**
   * Ensures a persisted Explore grid snapshot exists for a user-owned unit.
   * Idempotent: aligns snapshot with raster/SVG `preview_file_id` when suitable; rasterizes HTML when
   * `MALV_EXPLORE_HTML_GRID_SNAPSHOT` + Playwright are available; otherwise prefers the real HTML
   * `preview_file_id` over a synthetic SVG; only then generates the SVG placeholder.
   */
  async ensureCatalogPreviewSnapshotForUnit(userId: string, unitId: string): Promise<void> {
    let unit: BuildUnitEntity;
    try {
      unit = await this.getUnit(userId, unitId);
    } catch {
      return;
    }
    if (!unit.authorUserId || unit.authorUserId !== userId) return;

    const extUrl = unit.previewImageUrl?.trim() ?? "";
    if (/^https?:\/\//i.test(extUrl)) return;

    if (unit.previewFileId) {
      try {
        const f = await this.fileUnderstanding.assertUserOwnsFile(unit.authorUserId, unit.previewFileId);
        const m = normalizeMime(f.mimeType);
        if (m === "image/svg+xml" || BUILD_UNIT_PREVIEW_MIMES.has(m)) {
          if (unit.previewSnapshotId !== unit.previewFileId) {
            await this.units.update({ id: unit.id }, { previewSnapshotId: unit.previewFileId });
          }
          return;
        }
        if (BUILD_UNIT_PREVIEW_HTML_MIMES.has(m)) {
          const replaceSnapshotWithHtmlRaster =
            !unit.previewSnapshotId ||
            (await (async () => {
              try {
                const snapFile = await this.fileUnderstanding.assertUserOwnsFile(
                  unit.authorUserId!,
                  unit.previewSnapshotId!
                );
                return snapFile.originalName === "explore-preview-snapshot.svg";
              } catch {
                return true;
              }
            })());
          if (replaceSnapshotWithHtmlRaster) {
            const { buffer: htmlBuf } = await this.fileUnderstanding.readBinaryForAuthorFile({
              fileId:       unit.previewFileId,
              authorUserId: unit.authorUserId
            });
            const png = await tryRenderHtmlCatalogSnapshotPng(htmlBuf.toString("utf8"), (msg) =>
              this.logger.debug(msg)
            );
            if (png) {
              const out = await this.fileUnderstanding.persistUploadAndRegister({
                userId:       unit.authorUserId,
                globalRole:   "user",
                workspaceId:  null,
                roomId:       null,
                fileKind:     "image",
                originalName: "explore-preview-snapshot-grid.png",
                mimeType:     "image/png",
                buffer:       png
              });
              await this.units.update({ id: unit.id }, { previewSnapshotId: out.file.id });
              return;
            }
            // No PNG grid snapshot (feature off, Playwright missing, or render failed): prefer the
            // real HTML artifact for `preview-content` over a synthetic SVG placeholder.
            if (unit.previewSnapshotId !== unit.previewFileId) {
              await this.units.update({ id: unit.id }, { previewSnapshotId: unit.previewFileId });
            }
            return;
          }
        }
      } catch {
        /* fall through to generated snapshot */
      }
    }

    if (unit.previewSnapshotId) return;

    const buf = buildCatalogPreviewSnapshotSvg({
      title:    unit.title,
      type:     unit.type,
      category: unit.category,
      accent:   unit.accent ?? "oklch(0.65 0.14 220)",
      subtitle: unit.description
    });

    const out = await this.fileUnderstanding.persistUploadAndRegister({
      userId:       unit.authorUserId,
      globalRole:   "user",
      workspaceId:  null,
      roomId:       null,
      fileKind:     "image",
      originalName: "explore-preview-snapshot.svg",
      mimeType:     "image/svg+xml",
      buffer:       buf
    });

    await this.units.update({ id: unit.id }, { previewSnapshotId: out.file.id });
  }

  /**
   * Runs the frontend preview build pipeline for a unit that has a source file.
   * Called fire-and-forget after publish. Sets `previewFileId` and `intakePreviewState: "ready"` on success.
   *
   * Only runs when:
   * - Unit has a sourceFileId but no previewFileId (or previewFileId is the raw source, not a built artifact)
   * - Unit's intakeDetectionJson indicates the source is previewable
   * - FrontendPreviewBuilderService is wired in (optional dep)
   */
  async triggerPreviewBuildForUnit(userId: string, unitId: string): Promise<void> {
    if (!this.frontendPreviewBuilder) return;

    let unit: BuildUnitEntity;
    try {
      unit = await this.getUnit(userId, unitId);
    } catch {
      return;
    }
    if (!unit.authorUserId || unit.authorUserId !== userId) return;
    if (!unit.sourceFileId) return;

    // Already has a built preview artifact — skip to avoid duplicate rebuilds.
    if (unit.previewFileId && unit.intakePreviewState === "ready") return;

    // Check detection for previewability hint
    const det = unit.intakeDetectionJson;
    const frontendPreviewable =
      det && typeof det === "object" && det !== null
        ? Boolean((det as Record<string, unknown>).frontendPreviewable)
        : false;

    // Standalone HTML sources are handled in createFromSourceIntakeTransactional
    const sourceMime = normalizeMime(unit.sourceFileMime);
    const isHtmlSource = BUILD_UNIT_PREVIEW_HTML_MIMES.has(sourceMime) || /\.html?$/i.test(unit.sourceFileName ?? "");
    if (isHtmlSource) return; // Already handled

    if (!frontendPreviewable) {
      this.logger.debug(`[preview-build] unit ${unitId} not previewable per detection — skip`);
      return;
    }

    this.logger.log(`[preview-build] starting preview build for unit ${unitId}`);

    try {
      const { buffer } = await this.fileUnderstanding.readBinaryForAuthorFile({
        fileId: unit.sourceFileId,
        authorUserId: unit.authorUserId
      });

      const originalName = unit.sourceFileName ?? "upload";
      const extracted = extractIntakeSourceFiles(buffer, originalName);

      if (extracted.sources.length === 0) {
        this.logger.warn(`[preview-build] no scannable sources for unit ${unitId}`);
        await this.units.update(
          { id: unit.id },
          {
            intakePreviewState: "unavailable",
            intakePreviewUnavailableReason: "No scannable source files found in the uploaded archive."
          }
        );
        return;
      }

      const result = await this.frontendPreviewBuilder.buildPreview(
        extracted.sources,
        unit.title
      );

      this.logger.debug(`[preview-build] unit ${unitId} build result`, {
        success: result.success,
        class: result.buildDiag.previewClass,
        supportLevel: result.buildDiag.supportLevel,
        entry: result.buildDiag.primaryEntry,
        error: result.buildDiag.buildError,
        outputBytes: result.buildDiag.outputBytes
      });

      if (!result.success) {
        await this.units.update(
          { id: unit.id },
          {
            intakePreviewState: "unavailable",
            intakePreviewUnavailableReason: result.reason.slice(0, 2000)
          }
        );
        return;
      }

      // Store the built HTML as a preview file
      const stored = await this.fileUnderstanding.persistUploadAndRegister({
        userId: unit.authorUserId,
        globalRole: "user",
        workspaceId: null,
        roomId: null,
        fileKind: "text",
        originalName: "preview.html",
        mimeType: "text/html",
        buffer: result.html
      });

      await this.units.update(
        { id: unit.id },
        {
          previewFileId: stored.file.id,
          previewKind: "rendered",
          intakePreviewState: "ready",
          intakePreviewUnavailableReason: null
        }
      );

      this.logger.log(`[preview-build] unit ${unitId} preview built — fileId=${stored.file.id} bytes=${result.html.length}`);

      // Trigger snapshot generation for the new HTML preview
      void this.ensureCatalogPreviewSnapshotForUnit(userId, unitId).catch((e: unknown) => {
        this.logger.warn(`[preview-build] snapshot after build failed: ${String(e)}`);
      });
    } catch (err) {
      this.logger.warn(`[preview-build] unit ${unitId} build error: ${err instanceof Error ? err.message : String(err)}`);
      try {
        await this.units.update(
          { id: unit.id },
          {
            intakePreviewState: "unavailable",
            intakePreviewUnavailableReason: `Preview build error: ${err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400)}`
          }
        );
      } catch {
        // Ignore update failure
      }
    }
  }

  /** Anyone who can view the unit may load the stored preview bytes. */
  async getPreviewContentBytes(
    userId: string,
    unitId: string,
    opts?: { explicitFileId?: string | null }
  ): Promise<{ buffer: Buffer; mimeType: string | null }> {
    const unit = await this.getUnit(userId, unitId);
    const snap = unit.previewSnapshotId ?? null;
    const liveFile = unit.previewFileId ?? null;
    const allowed = new Set([snap, liveFile].filter(Boolean) as string[]);
    const req = opts?.explicitFileId?.trim();
    const fileId =
      req && allowed.has(req) ? req : snap ?? liveFile;
    if (!fileId) {
      throw new NotFoundException("This unit has no stored preview artifact.");
    }
    if (unit.authorUserId) {
      const bin = await this.fileUnderstanding.readBinaryForAuthorFile({
        fileId,
        authorUserId: unit.authorUserId
      });
      return { buffer: bin.buffer, mimeType: bin.mimeType };
    }
    if (unit.sourceKind === "system" && unit.visibility === "public") {
      const bin = await this.fileUnderstanding.readBinaryForBuildUnitPreviewArtifact(fileId);
      return { buffer: bin.buffer, mimeType: bin.mimeType };
    }
    throw new NotFoundException("This unit has no stored preview artifact.");
  }

  /** Owner-only: uploaded source asset attached to the unit. */
  async getSourceDownloadBytes(
    userId: string,
    unitId: string
  ): Promise<{ buffer: Buffer; mimeType: string | null; fileName: string }> {
    const unit = await this.getUnit(userId, unitId);
    if (unit.authorUserId !== userId) {
      throw new ForbiddenException("Only the unit owner can download the source file.");
    }
    if (!unit.sourceFileId || !unit.authorUserId) {
      throw new NotFoundException("This unit has no uploaded source file.");
    }
    const bin = await this.fileUnderstanding.readBinaryForAuthorFile({
      fileId:       unit.sourceFileId,
      authorUserId: unit.authorUserId
    });
    const fileName = unit.sourceFileName?.trim() || bin.fileName || "source";
    return { buffer: bin.buffer, mimeType: bin.mimeType, fileName };
  }

  private async assertOwnedPreviewFile(userId: string, fileId: string): Promise<void> {
    const f = await this.fileUnderstanding.assertUserOwnsFile(userId, fileId);
    const m = normalizeMime(f.mimeType);
    if (!BUILD_UNIT_PREVIEW_ALL_MIMES.has(m)) {
      throw new BadRequestException("Preview file must be PNG, JPEG, WebP, or HTML.");
    }
  }

  private async assertOwnedSourceFile(userId: string, fileId: string): Promise<void> {
    const f = await this.fileUnderstanding.assertUserOwnsFile(userId, fileId);
    const m = normalizeMime(f.mimeType);
    const ext = extFromName(f.originalName);
    const mimeOk = Boolean(m && BUILD_UNIT_SOURCE_MIMES.has(m));
    const extOk = Boolean(ext && BUILD_UNIT_SOURCE_EXTENSIONS.has(ext));
    if (!mimeOk && !extOk) {
      throw new BadRequestException("Source file type is not allowed for build units.");
    }
  }

  // ── Fork ───────────────────────────────────────────────────────────────────

  async forkUnit(userId: string, unitId: string): Promise<BuildUnitEntity> {
    const source = await this.getUnit(userId, unitId);
    if (!source.forkable) {
      throw new BadRequestException("This unit does not allow forking.");
    }

    // Idempotent: return existing fork if user already has one for this source
    const existing = await this.units.findOne({
      where: { authorUserId: userId, originalBuildUnitId: unitId, archivedAt: IsNull() }
    });
    if (existing) return existing;

    const fork = this.units.create({
      id:                  randomUUID(),
      slug:                `${source.slug}-fork-${Date.now()}`,
      title:               source.title,
      description:         source.description,
      type:                source.type,
      category:            source.category,
      tags:                source.tags ? [...source.tags] : null,
      prompt:              source.prompt,
      codeSnippet:         source.codeSnippet,
      previewImageUrl:     source.previewFileId ? null : source.previewImageUrl,
      previewKind:         source.previewFileId
        ? "none"
        : (source.previewKind ?? (source.previewImageUrl ? "image" : "none")),
      previewFileId:       null,
      previewSnapshotId:   null,
      sourceFileId:        null,
      sourceFileName:      null,
      sourceFileMime:      null,
      sourceFileUrl:       null,
      authorUserId:        userId,
      authorLabel:         null,
      visibility:          "private",
      sourceKind:          "user",
      originalBuildUnitId: source.id,
      forkable:            true,
      downloadable:        true,
      verified:            false,
      trending:            false,
      recommended:         false,
      isNew:               false,
      accent:              source.accent,
      usesCount:           0,
      forksCount:          0,
      downloadsCount:      0,
      metadataJson:        null,
      archivedAt:          null,
      intakePreviewState:            source.intakePreviewState ?? null,
      intakePreviewUnavailableReason: source.intakePreviewUnavailableReason ?? null,
      intakeAuditDecision:           source.intakeAuditDecision ?? null,
      intakeDetectionJson:           source.intakeDetectionJson
        ? ({ ...source.intakeDetectionJson } as Record<string, unknown>)
        : null
    });
    fork.executionProfileJson = computeExecutionProfile(fork) as Record<string, unknown>;

    const saved = await this.units.save(fork);

    // Increment source fork count
    await this.units.increment({ id: source.id }, "forksCount", 1);

    void this.ensureCatalogPreviewSnapshotForUnit(userId, saved.id).catch((e: unknown) => {
      this.logger.warn(`catalog preview snapshot: ${String(e)}`);
    });

    return saved;
  }

  /**
   * Server-only: create a user build unit from an approved source intake session.
   * Does not accept client-supplied preview images or URLs. Source file must already
   * belong to the user (intake upload).
   */
  async createFromSourceIntakeTransactional(
    em: EntityManager,
    args: {
      userId: string;
      sourceFileId: string;
      sourceFileName: string | null;
      sourceFileMime: string | null;
      intakePreviewState: NonNullable<BuildUnitEntity["intakePreviewState"]>;
      intakePreviewUnavailableReason: string | null;
      intakeAuditDecision: "approved" | "approved_with_warnings";
      intakeDetectionJson: Record<string, unknown> | null;
      title: string;
      description: string | null;
      type: BuildUnitType;
      category: string;
      tags: string[] | null;
      metadataJson: Record<string, unknown> | null;
    }
  ): Promise<BuildUnitEntity> {
    const title = args.title.trim().slice(0, 220);
    if (!title) throw new BadRequestException("Title is required.");

    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const slug = `${baseSlug}-${Date.now()}`;

    const det = args.intakeDetectionJson;
    const framework =
      det && typeof det.framework === "string" ? det.framework.trim() : "";
    const promptHint = framework
      ? `Imported ${framework} source. Open in Studio or send to MALV to execute against this archive.`
      : "Imported source archive. Open in Studio or send to MALV to execute.";

    // Standalone HTML files are directly previewable: use the source file as the preview artifact.
    const normalizedSourceMime = normalizeMime(args.sourceFileMime);
    const isStandaloneHtml =
      BUILD_UNIT_PREVIEW_HTML_MIMES.has(normalizedSourceMime) ||
      /\.(html?|htm)$/i.test(args.sourceFileName ?? "");
    const previewFileId = isStandaloneHtml ? args.sourceFileId : null;
    const previewKindForUnit: BuildUnitPreviewKind = isStandaloneHtml ? "rendered" : "none";

    const uRepo = em.getRepository(BuildUnitEntity);
    const unit = uRepo.create({
      id: randomUUID(),
      slug,
      title,
      description: args.description,
      type: args.type,
      category: args.category.trim().slice(0, 60),
      tags: args.tags,
      prompt: promptHint.slice(0, 16000),
      codeSnippet: null,
      previewImageUrl: null,
      previewKind: previewKindForUnit,
      previewFileId,
      previewSnapshotId: null,
      sourceFileId: args.sourceFileId,
      sourceFileName: args.sourceFileName,
      sourceFileMime: args.sourceFileMime,
      sourceFileUrl: null,
      authorUserId: args.userId,
      authorLabel: null,
      visibility: "private",
      sourceKind: "user",
      originalBuildUnitId: null,
      forkable: true,
      downloadable: true,
      verified: false,
      trending: false,
      recommended: false,
      isNew: false,
      accent: null,
      usesCount: 0,
      forksCount: 0,
      downloadsCount: 0,
      metadataJson: args.metadataJson,
      archivedAt: null,
      intakePreviewState: isStandaloneHtml ? "ready" : args.intakePreviewState,
      intakePreviewUnavailableReason: isStandaloneHtml ? null : args.intakePreviewUnavailableReason,
      intakeAuditDecision: args.intakeAuditDecision,
      intakeDetectionJson: args.intakeDetectionJson
        ? ({ ...args.intakeDetectionJson } as Record<string, unknown>)
        : null
    });
    unit.executionProfileJson = computeExecutionProfile(unit) as Record<string, unknown>;
    return uRepo.save(unit);
  }

  // ── Create (user-authored) ─────────────────────────────────────────────────

  async createUnit(args: CreateUnitArgs): Promise<BuildUnitEntity> {
    const title = args.title.trim();
    if (!title) throw new BadRequestException("Title is required.");

    const validTypes = ["template", "component", "behavior", "workflow", "plugin", "blueprint", "ai_generated"];
    if (!validTypes.includes(args.type)) {
      throw new BadRequestException(`Invalid type. Must be one of: ${validTypes.join(", ")}.`);
    }
    if (!args.category?.trim()) throw new BadRequestException("Category is required.");

    // Generate a slug from title + timestamp to avoid collisions
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const slug = `${baseSlug}-${Date.now()}`;

    let previewFileId = args.previewFileId ?? null;
    let sourceFileId = args.sourceFileId ?? null;
    let previewImageUrl = sanitizePreviewImageUrlForPersistence(
      args.previewImageUrl != null && String(args.previewImageUrl).trim()
        ? String(args.previewImageUrl).trim().slice(0, 500)
        : null
    );
    let sourceFileUrl =
      args.sourceFileUrl != null && String(args.sourceFileUrl).trim()
        ? String(args.sourceFileUrl).trim().slice(0, 512)
        : null;
    let sourceFileName =
      args.sourceFileName != null && String(args.sourceFileName).trim()
        ? String(args.sourceFileName).trim().slice(0, 255)
        : null;
    let sourceFileMime =
      args.sourceFileMime != null && String(args.sourceFileMime).trim()
        ? String(args.sourceFileMime).trim().slice(0, 100)
        : null;

    if (previewFileId) {
      await this.assertOwnedPreviewFile(args.userId, previewFileId);
      previewImageUrl = null;
    }
    if (sourceFileId) {
      await this.assertOwnedSourceFile(args.userId, sourceFileId);
      const sf = await this.fileUnderstanding.assertUserOwnsFile(args.userId, sourceFileId);
      sourceFileName = sourceFileName ?? sf.originalName;
      sourceFileMime = sourceFileMime ?? (normalizeMime(sf.mimeType) || null);
    }

    let previewKind: BuildUnitPreviewKind = args.previewKind ?? "none";
    if (args.previewKind === undefined && (previewFileId || previewImageUrl)) {
      previewKind = "image";
    }

    const unit = this.units.create({
      id:          randomUUID(),
      slug,
      title:       title.slice(0, 220),
      description: args.description ?? null,
      type:        args.type as any,
      category:    args.category.trim().slice(0, 60),
      tags:        args.tags ?? null,
      prompt:      args.prompt ?? null,
      codeSnippet: args.codeSnippet ?? null,
      previewImageUrl,
      previewKind,
      previewFileId,
      sourceFileId,
      sourceFileName,
      sourceFileMime,
      sourceFileUrl,
      authorUserId:    args.userId,
      authorLabel:     null,
      visibility:      args.visibility ?? "private",
      sourceKind:      "user",
      originalBuildUnitId: null,
      forkable:        args.forkable  ?? true,
      downloadable:    args.downloadable ?? true,
      verified:        false,
      trending:        false,
      recommended:     false,
      isNew:           false,
      accent:          args.accent ?? null,
      usesCount:       0,
      forksCount:      0,
      downloadsCount:  0,
      metadataJson:    args.metadataJson ?? null,
      archivedAt:      null
    });
    unit.executionProfileJson = computeExecutionProfile(unit) as Record<string, unknown>;

    const saved = await this.units.save(unit);
    void this.ensureCatalogPreviewSnapshotForUnit(args.userId, saved.id).catch((e: unknown) => {
      this.logger.warn(`catalog preview snapshot: ${String(e)}`);
    });
    return saved;
  }

  // ── Update (owner only) ────────────────────────────────────────────────────

  async updateUnit(args: UpdateUnitArgs): Promise<BuildUnitEntity> {
    const versionKeys: (keyof UpdateUnitArgs)[] = [
      "title",
      "description",
      "tags",
      "prompt",
      "codeSnippet",
      "category",
      "visibility",
      "forkable",
      "downloadable",
      "accent",
      "previewKind",
      "previewImageUrl",
      "previewFileId",
      "sourceFileId",
      "sourceFileName",
      "sourceFileMime",
      "sourceFileUrl"
    ];
    const hasPatchFields = versionKeys.some((k) => args[k] !== undefined);

    await this.units.manager.transaction(async (em) => {
      const uRepo = em.getRepository(BuildUnitEntity);
      const vRepo = em.getRepository(BuildUnitVersionEntity);

      const unit = await uRepo.findOne({ where: { id: args.unitId, archivedAt: IsNull() } });
      if (!unit) throw new NotFoundException("Build unit not found.");
      if (unit.authorUserId !== args.userId) {
        throw new ForbiddenException("You can only edit units you own.");
      }
      if (unit.sourceKind === "system") {
        throw new ForbiddenException("System units are read-only. Fork this unit to customize it.");
      }

      if (hasPatchFields) {
        const prev = await vRepo.find({
          where: { buildUnitId: unit.id },
          order: { versionNumber: "DESC" },
          take: 1
        });
        const nextNum = (prev[0]?.versionNumber ?? 0) + 1;
        const ver = vRepo.create({
          id:            randomUUID(),
          buildUnitId:   unit.id,
          versionNumber: nextNum,
          snapshotJson:  this.snapshotUnitState(unit)
        });
        await vRepo.save(ver);
      }

      if (args.title        !== undefined) unit.title       = args.title.trim().slice(0, 220);
      if (args.description  !== undefined) unit.description = args.description;
      if (args.tags         !== undefined) unit.tags        = args.tags;
      if (args.prompt       !== undefined) unit.prompt      = args.prompt;
      if (args.codeSnippet  !== undefined) unit.codeSnippet = args.codeSnippet;
      if (args.category     !== undefined) unit.category    = args.category.slice(0, 60);
      if (args.visibility   !== undefined) unit.visibility  = args.visibility;
      if (args.forkable     !== undefined) unit.forkable    = args.forkable;
      if (args.downloadable !== undefined) unit.downloadable = args.downloadable;
      if (args.accent       !== undefined) unit.accent      = args.accent;

      if (args.previewKind !== undefined) unit.previewKind = args.previewKind;
      if (args.previewImageUrl !== undefined) {
        unit.previewImageUrl = sanitizePreviewImageUrlForPersistence(
          args.previewImageUrl != null && String(args.previewImageUrl).trim()
            ? String(args.previewImageUrl).trim().slice(0, 500)
            : null
        );
      }
      if (args.previewFileId !== undefined) {
        if (args.previewFileId === null) {
          unit.previewFileId = null;
        } else {
          await this.assertOwnedPreviewFile(args.userId, args.previewFileId);
          unit.previewFileId = args.previewFileId;
          unit.previewImageUrl = null;
        }
      }
      if (args.sourceFileId !== undefined) {
        if (args.sourceFileId === null) {
          unit.sourceFileId = null;
          if (args.sourceFileName === undefined) unit.sourceFileName = null;
          if (args.sourceFileMime === undefined) unit.sourceFileMime = null;
        } else {
          await this.assertOwnedSourceFile(args.userId, args.sourceFileId);
          unit.sourceFileId = args.sourceFileId;
          const sf = await this.fileUnderstanding.assertUserOwnsFile(args.userId, args.sourceFileId);
          if (args.sourceFileName === undefined) unit.sourceFileName = sf.originalName;
          if (args.sourceFileMime === undefined) unit.sourceFileMime = normalizeMime(sf.mimeType) || null;
        }
      }
      if (args.sourceFileName !== undefined) {
        unit.sourceFileName =
          args.sourceFileName != null && args.sourceFileName.trim()
            ? args.sourceFileName.trim().slice(0, 255)
            : null;
      }
      if (args.sourceFileMime !== undefined) {
        unit.sourceFileMime =
          args.sourceFileMime != null && args.sourceFileMime.trim()
            ? args.sourceFileMime.trim().slice(0, 100)
            : null;
      }
      if (args.sourceFileUrl !== undefined) {
        unit.sourceFileUrl =
          args.sourceFileUrl != null && String(args.sourceFileUrl).trim()
            ? String(args.sourceFileUrl).trim().slice(0, 512)
            : null;
      }

      unit.executionProfileJson = computeExecutionProfile(unit) as Record<string, unknown>;
      return uRepo.save(unit);
    });

    void this.ensureCatalogPreviewSnapshotForUnit(args.userId, args.unitId).catch((e: unknown) => {
      this.logger.warn(`catalog preview snapshot: ${String(e)}`);
    });

    return this.getUnit(args.userId, args.unitId);
  }

  /** JSON snapshot of mutable / display fields before a versioned update. */
  private snapshotUnitState(unit: BuildUnitEntity): Record<string, unknown> {
    return {
      id:                   unit.id,
      slug:                 unit.slug,
      title:                unit.title,
      description:          unit.description,
      type:                 unit.type,
      category:             unit.category,
      tags:                 unit.tags,
      prompt:               unit.prompt,
      codeSnippet:          unit.codeSnippet,
      visibility:           unit.visibility,
      forkable:             unit.forkable,
      downloadable:         unit.downloadable,
      accent:               unit.accent,
      previewKind:          unit.previewKind,
      previewImageUrl:      unit.previewImageUrl,
      previewFileId:        unit.previewFileId,
      previewSnapshotId:    unit.previewSnapshotId,
      sourceFileId:         unit.sourceFileId,
      sourceFileName:       unit.sourceFileName,
      sourceFileMime:       unit.sourceFileMime,
      sourceFileUrl:        unit.sourceFileUrl,
      metadataJson:         unit.metadataJson,
      executionProfileJson: unit.executionProfileJson,
      updatedAt:            unit.updatedAt instanceof Date ? unit.updatedAt.toISOString() : String(unit.updatedAt)
    };
  }

  async listVersions(userId: string, unitId: string): Promise<BuildUnitVersionEntity[]> {
    await this.getUnit(userId, unitId);
    return this.versions.find({
      where: { buildUnitId: unitId },
      order: { versionNumber: "DESC" }
    });
  }

  async createComposition(args: CreateCompositionArgs): Promise<BuildUnitCompositionEntity> {
    const name = args.name.trim();
    if (!name) throw new BadRequestException("Name is required.");
    const seen = new Set<string>();
    const orderedIds: string[] = [];
    for (const raw of args.unitIds) {
      const id = String(raw ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
    if (orderedIds.length < 2) throw new BadRequestException("Select at least two units.");

    for (const id of orderedIds) {
      await this.getUnit(args.userId, id);
    }

    const row = this.compositions.create({
      id:           randomUUID(),
      name:         name.slice(0, 220),
      userId:       args.userId,
      unitIds:      orderedIds,
      metadataJson: args.metadataJson ?? null
    });
    return this.compositions.save(row);
  }

  async getComposition(userId: string, compositionId: string): Promise<BuildUnitCompositionEntity> {
    const row = await this.compositions.findOne({ where: { id: compositionId } });
    if (!row) throw new NotFoundException("Composition not found.");
    if (row.userId !== userId) throw new ForbiddenException("Access denied.");
    return row;
  }

  async updateComposition(args: {
    userId:         string;
    compositionId:  string;
    name:           string;
  }): Promise<BuildUnitCompositionEntity> {
    const row = await this.getComposition(args.userId, args.compositionId);
    const name = args.name.trim();
    if (!name) throw new BadRequestException("Name is required.");
    row.name = name.slice(0, 220);
    return this.compositions.save(row);
  }

  async deleteComposition(userId: string, compositionId: string): Promise<void> {
    const row = await this.getComposition(userId, compositionId);
    await this.compositions.remove(row);
  }

  async listMyCompositions(userId: string): Promise<BuildUnitCompositionEntity[]> {
    return this.compositions.find({
      where: { userId },
      order: { createdAt: "DESC" }
    });
  }

  /** Creates a workspace task that aggregates all units in the composition (ordered). */
  async sendCompositionToTask(userId: string, compositionId: string): Promise<{ task: { id: string; title: string; status: string } }> {
    const comp = await this.getComposition(userId, compositionId);
    const blocks: string[] = [];
    for (const uid of comp.unitIds) {
      const u = await this.getUnit(userId, uid);
      const head = `### ${u.title} (${u.type})`;
      const body = [u.description, u.prompt].filter(Boolean).join("\n\n");
      blocks.push([head, body].filter(Boolean).join("\n"));
    }
    const description = [`Composition "${comp.name}" — ${comp.unitIds.length} build units (order preserved).`, "", ...blocks]
      .join("\n\n")
      .slice(0, 65000);

    const task = await this.productivity.createTask({
      userId,
      title:               comp.name.slice(0, 220),
      description,
      status:              "todo",
      priority:            "normal",
      source:              "studio",
      sourceSurface:       "studio",
      sourceType:          "explore_composition",
      sourceReferenceId:   comp.id,
      executionType:       "manual",
      metadata:            { compositionId: comp.id, unitIds: comp.unitIds }
    });

    return { task: { id: task.id, title: task.title, status: task.status } };
  }

  async improveUnit(
    userId: string,
    unitId: string,
    opts?: { improveIntent?: string }
  ): Promise<BuildUnitEntity> {
    const source = await this.getUnit(userId, unitId);

    const det = this.buildDeterministicImprovement(source);
    let aiPatch: Partial<{ title: string; description: string; prompt: string; codeSnippet: string }> = {};
    if (this.beastWorker) {
      try {
        const intentHint = this.exploreImproveIntentPromptHint(opts?.improveIntent);
        const inferUser = JSON.stringify({
          title:           source.title,
          description:     source.description,
          type:            source.type,
          category:        source.category,
          prompt:          source.prompt,
          codeSnippetHead: (source.codeSnippet ?? "").slice(0, 4000)
        });
        const res = await this.beastWorker.infer({
          mode: "beast",
          prompt:
            `You improve MALV Build Units. Reply with ONLY valid JSON (no markdown fences) and optional keys: ` +
            `"title","description","prompt","codeSnippet". Strings must be production-ready.` +
            (intentHint ? `\n${intentHint}` : "") +
            `\nInput:\n${inferUser}`,
          context: {
            malvPromptAlreadyExpanded: true,
            malvOperatorMode:          "analyze",
            malvBuildUnitImprove:      true
          },
          correlationId: randomUUID()
        });
        aiPatch = this.parseImproveReply(res.reply ?? "");
      } catch (e) {
        this.logger.warn(`improveUnit infer skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const merged = { ...det, ...aiPatch };
    const baseSlug = source.slug.replace(/-fork-\d+$/, "").replace(/-improved-\d+$/, "");
    const slug = `${baseSlug}-improved-${Date.now()}`;

    const improved = this.units.create({
      id:                  randomUUID(),
      slug,
      title:               (merged.title ?? det.title).slice(0, 220),
      description:         merged.description ?? det.description,
      type:                source.type,
      category:            source.category,
      tags:                source.tags ? [...source.tags] : null,
      prompt:              merged.prompt ?? det.prompt,
      codeSnippet:         merged.codeSnippet ?? det.codeSnippet,
      previewImageUrl:     source.previewFileId ? null : source.previewImageUrl,
      previewKind:         source.previewFileId
        ? "none"
        : (source.previewKind ?? (source.previewImageUrl ? "image" : "none")),
      previewFileId:       null,
      previewSnapshotId:   null,
      sourceFileId:        null,
      sourceFileName:      null,
      sourceFileMime:      null,
      sourceFileUrl:       null,
      authorUserId:        userId,
      authorLabel:         null,
      visibility:          "private",
      sourceKind:          "user",
      originalBuildUnitId: source.id,
      forkable:            true,
      downloadable:        true,
      verified:            false,
      trending:            false,
      recommended:         false,
      isNew:               false,
      accent:              source.accent,
      usesCount:           0,
      forksCount:          0,
      downloadsCount:      0,
      metadataJson:        (() => {
        const base =
          source.metadataJson !== null &&
          typeof source.metadataJson === "object" &&
          !Array.isArray(source.metadataJson)
            ? { ...(source.metadataJson as Record<string, unknown>) }
            : {};
        return {
          ...base,
          improvedFromUnitId: source.id,
          improvedAt:         new Date().toISOString(),
          malvImproved:       true
        };
      })(),
      archivedAt:          null,
      intakePreviewState:             source.intakePreviewState ?? null,
      intakePreviewUnavailableReason: source.intakePreviewUnavailableReason ?? null,
      intakeAuditDecision:            source.intakeAuditDecision ?? null,
      intakeDetectionJson:            source.intakeDetectionJson
        ? ({ ...source.intakeDetectionJson } as Record<string, unknown>)
        : null
    });
    improved.executionProfileJson = computeExecutionProfile(improved) as Record<string, unknown>;

    const saved = await this.units.save(improved);
    await this.units.increment({ id: source.id }, "forksCount", 1);
    void this.ensureCatalogPreviewSnapshotForUnit(userId, saved.id).catch((e: unknown) => {
      this.logger.warn(`catalog preview snapshot: ${String(e)}`);
    });
    return saved;
  }

  /** Optional Explore preview intent — biases the model without changing the response schema. */
  private exploreImproveIntentPromptHint(intent: string | undefined): string | null {
    if (!intent || !intent.trim()) return null;
    switch (intent.trim()) {
      case "optimize_mobile":
        return (
          "Review focus: the user is checking this unit in mobile / narrow viewport context. " +
          "Prioritize touch targets, readable type scale, overflow/scroll behavior, and safe-area spacing."
        );
      case "tighten_spacing_typography":
        return (
          "Review focus: the user asked for polish. Prioritize consistent spacing rhythm, typographic hierarchy, " +
          "line length, and alignment — without large structural rewrites unless necessary."
        );
      case "generic_improve":
        return "Review focus: general quality pass — clarity, structure, and practical improvements.";
      default:
        return null;
    }
  }

  private buildDeterministicImprovement(source: BuildUnitEntity): {
    title: string;
    description: string | null;
    prompt: string | null;
    codeSnippet: string | null;
  } {
    const desc = source.description ?? "";
    const note = "\n\n— MALV refinement —\nTightened scope, success criteria, and implementation notes.";
    const newDesc = desc.includes("MALV refinement") ? desc : `${desc}${note}`.slice(0, 8000);
    let prompt = (source.prompt ?? "").trim();
    if (prompt && !/success criteria/i.test(prompt)) {
      prompt =
        `${prompt}\n\nSuccess criteria: ship a working outcome, document assumptions, list open questions.`.slice(0, 16000);
    } else if (!prompt) {
      prompt = `Execute this build unit: ${source.title}.\n\nSuccess criteria: deliver a concrete, verifiable result.`;
    }
    return {
      title:       `${source.title} (improved)`,
      description: newDesc || null,
      prompt,
      codeSnippet: source.codeSnippet
    };
  }

  private parseImproveReply(reply: string): Partial<{
    title: string;
    description: string;
    prompt: string;
    codeSnippet: string;
  }> {
    const trimmed = reply.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    try {
      const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      const out: Partial<{ title: string; description: string; prompt: string; codeSnippet: string }> = {};
      if (typeof o.title === "string") out.title = o.title.slice(0, 220);
      if (typeof o.description === "string") out.description = o.description.slice(0, 8000);
      if (typeof o.prompt === "string") out.prompt = o.prompt.slice(0, 16000);
      if (typeof o.codeSnippet === "string") out.codeSnippet = o.codeSnippet.slice(0, 32000);
      return out;
    } catch {
      return {};
    }
  }

  // ── Send to task ───────────────────────────────────────────────────────────

  async sendToTask(userId: string, unitId: string): Promise<{ task: any; taskLinkId: string }> {
    const unit = await this.getUnit(userId, unitId);

    const task = await this.productivity.createTask({
      userId,
      title:             unit.title.slice(0, 220),
      description:       [unit.description, unit.prompt].filter(Boolean).join("\n\n") || null,
      status:            "todo",
      priority:          "normal",
      source:            "studio",
      sourceSurface:     "studio",
      sourceType:        "explore_unit",
      sourceReferenceId: unit.id,
      executionType:     "manual"
    });

    const link = this.taskLinks.create({
      id:          randomUUID(),
      buildUnitId: unit.id,
      taskId:      task.id,
      userId
    });
    const savedLink = await this.taskLinks.save(link);

    // Increment usage counter
    await this.units.increment({ id: unit.id }, "usesCount", 1);

    return { task, taskLinkId: savedLink.id };
  }

  // ── Ownership actions ─────────────────────────────────────────────────────

  /**
   * Soft-deletes a user-owned unit by setting archivedAt. Only the owner can delete.
   * System units cannot be deleted via this path.
   */
  async deleteUnit(userId: string, unitId: string): Promise<void> {
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit) throw new NotFoundException("Build unit not found.");
    if (unit.sourceKind === "system") {
      throw new ForbiddenException("System catalog units cannot be deleted.");
    }
    if (unit.authorUserId !== userId) {
      throw new ForbiddenException("Only the unit owner can delete this unit.");
    }
    await this.units.update({ id: unit.id }, { archivedAt: new Date() });
  }

  /**
   * Removes a user's fork: detaches from the parent (clears originalBuildUnitId).
   * If the user wants to remove it entirely, use deleteUnit after unfork.
   * Only the fork owner can unfork.
   */
  async unforkUnit(userId: string, unitId: string): Promise<BuildUnitEntity> {
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit) throw new NotFoundException("Build unit not found.");
    if (unit.authorUserId !== userId) {
      throw new ForbiddenException("Only the fork owner can unfork this unit.");
    }
    if (!unit.originalBuildUnitId) {
      throw new BadRequestException("This unit is not a fork.");
    }
    await this.units
      .createQueryBuilder()
      .update(BuildUnitEntity)
      .set({ originalBuildUnitId: () => "NULL" })
      .where("id = :id", { id: unit.id })
      .execute();
    const updated = await this.units.findOne({ where: { id: unit.id } });
    if (!updated) throw new NotFoundException("Build unit not found after unfork.");
    return updated;
  }

  // ── Seeding ────────────────────────────────────────────────────────────────

  async seedSystemUnits(): Promise<{ seeded: number; skipped: number }> {
    let seeded = 0;
    let skipped = 0;

    for (const def of SYSTEM_UNITS) {
      const existing = await this.units.findOne({ where: { slug: def.slug, sourceKind: "system" } });
      if (existing) {
        skipped++;
        continue;
      }
      const unit = this.units.create({
        id:                   randomUUID(),
        usesCount:            0,
        forksCount:           0,
        downloadsCount:       0,
        archivedAt:           null,
        executionProfileJson: null,
        ...def
      });
      await this.units.save(unit);
      seeded++;
    }

    return { seeded, skipped };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { setTimeout as delay } from "timers/promises";
import {
  SourceIntakeSessionEntity,
  type SourceIntakeAuditDecision,
  type SourceIntakePreviewState,
  type SourceIntakeSessionStatus
} from "../db/entities/source-intake-session.entity";
import type { BuildUnitEntity, BuildUnitType } from "../db/entities/build-unit.entity";
import { BuildUnitService } from "../build-units/build-unit.service";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import { assertSourceIntakeUploadAllowed } from "./source-intake-upload.constants";
import {
  INTAKE_AUDIT_DISCLAIMER,
  INTAKE_SCANNER_VERSION,
  previewUnavailableReasonForDecision,
  runStaticIntakeAnalysis,
  type IntakeTerminalDecision
} from "./source-intake-static-audit.util";
import type { PublishSourceIntakeDto } from "./dto/publish-source-intake.dto";
import { loadPublishWithWarningsPolicyFromEnv } from "./review/source-model-review.config";
import { SourceIntakeModelReviewAdapterService } from "./review/source-intake-model-review-adapter.service";
import { buildSourceModelReviewInput } from "./review/source-intake-model-review-input.builder";
import {
  assembleStaticPolicyModelReview,
  buildReviewPolicySnapshot,
  flattenReviewIntoAuditJson,
  mergeModelReviewEnrichment
} from "./review/source-intake-review-policy.helper";
import { inferDefaultPublishedBuildUnitTypeFromOriginalName } from "./source-intake-publish-type.util";

const PUBLISHABLE_AUDIT: SourceIntakeAuditDecision[] = ["approved", "approved_with_warnings"];

const VALID_UNIT_TYPES: BuildUnitType[] = [
  "template",
  "component",
  "behavior",
  "workflow",
  "plugin",
  "blueprint",
  "ai_generated"
];

@Injectable()
export class SourceIntakeService {
  private readonly logger = new Logger(SourceIntakeService.name);

  constructor(
    @InjectRepository(SourceIntakeSessionEntity)
    private readonly sessions: Repository<SourceIntakeSessionEntity>,
    private readonly files: FileUnderstandingService,
    private readonly buildUnits: BuildUnitService,
    private readonly modelReviewAdapter: SourceIntakeModelReviewAdapterService
  ) {}

  async createSession(args: {
    userId: string;
    globalRole?: string;
    buffer: Buffer;
    originalName: string;
    mimeType?: string | null;
  }): Promise<SourceIntakeSessionEntity> {
    try {
      assertSourceIntakeUploadAllowed({
        mimeType: args.mimeType,
        originalName: args.originalName || "source.zip",
        sizeBytes: args.buffer.length
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }

    const ext = (args.originalName || "").toLowerCase().split(".").pop() || "";
    const isZip = ext === "zip" || String(args.mimeType || "").includes("zip");
    const out = await this.files.persistUploadAndRegister({
      userId: args.userId,
      globalRole: args.globalRole === "admin" ? "admin" : "user",
      workspaceId: null,
      roomId: null,
      fileKind: isZip ? "doc" : "text",
      originalName: args.originalName || "source",
      mimeType: args.mimeType ?? null,
      buffer: args.buffer
    });

    const row = this.sessions.create({
      id: randomUUID(),
      userId: args.userId,
      status: "uploaded",
      auditDecision: "pending",
      sourceFileId: out.file.id,
      detectionJson: null,
      auditJson: null,
      auditSummary: null,
      previewState: "not_requested",
      previewUnavailableReason: null,
      buildUnitId: null
    });
    const saved = await this.sessions.save(row);
    void this.runIntakePipeline(saved.id).catch((err: unknown) => {
      this.logger.error(`source intake pipeline failed for ${saved.id}: ${String(err)}`);
    });
    return saved;
  }

  /**
   * Static detection + rule-based audit. No LLM, no live preview.
   * Does not create build_units.
   */
  private async runIntakePipeline(sessionId: string): Promise<void> {
    const load = () => this.sessions.findOne({ where: { id: sessionId } });

    const setStatus = async (status: SourceIntakeSessionStatus) => {
      const row = await load();
      if (!row) return;
      row.status = status;
      await this.sessions.save(row);
    };

    await delay(80);
    await setStatus("detecting");

    const row0 = await load();
    if (!row0) return;

    let analysis: ReturnType<typeof runStaticIntakeAnalysis> | undefined;
    let binaryMeta: { sizeBytes: number; label: string; mimeType: string | null } | undefined;
    try {
      const fileMeta = await this.files.assertUserOwnsFile(row0.userId, row0.sourceFileId);
      const bin = await this.files.readBinaryForAuthorFile({
        fileId: row0.sourceFileId,
        authorUserId: row0.userId
      });
      const label = bin.fileName || fileMeta.originalName || "upload";
      binaryMeta = { sizeBytes: bin.buffer.length, label, mimeType: fileMeta.mimeType ?? null };
      analysis = runStaticIntakeAnalysis(bin.buffer, label);
    } catch (e) {
      this.logger.warn(`intake analysis read failed ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      const failedSummary =
        "Automated review could not read this upload. It may be missing, inaccessible, or corrupted — try re-uploading.";
      const row = await load();
      if (!row) return;
      row.status = "declined";
      row.auditDecision = "declined";
      row.auditSummary = failedSummary;
      row.detectionJson = {
        scannerVersion: INTAKE_SCANNER_VERSION,
        note: "Analysis aborted before file scan.",
        error: e instanceof Error ? e.message : String(e)
      };
      const publishWarn = loadPublishWithWarningsPolicyFromEnv();
      const failedTerminal: IntakeTerminalDecision = {
        status: "declined",
        auditDecision: "declined",
        auditSummary: failedSummary
      };
      const failedReview = assembleStaticPolicyModelReview({
        terminal: failedTerminal,
        findings: [],
        detectionJson: row.detectionJson as Record<string, unknown>,
        auditSummaryLine: failedSummary,
        pipelineReadError: true,
        buildUnitId: null,
        publishWithWarningsAllowed: publishWarn
      });
      const failedPolicy = buildReviewPolicySnapshot(failedReview, {
        pipelineReadError: true,
        publishWithWarningsAllowed: publishWarn
      });
      row.auditJson = {
        scannerVersion: INTAKE_SCANNER_VERSION,
        disclaimer: INTAKE_AUDIT_DISCLAIMER,
        checklist: null,
        findings: [],
        completedAt: new Date().toISOString(),
        pipelineReadError: true,
        ...flattenReviewIntoAuditJson(failedReview, failedPolicy)
      };
      row.previewState = "unavailable";
      row.previewUnavailableReason = previewUnavailableReasonForDecision("declined");
      await this.sessions.save(row);
      return;
    }

    if (!analysis || !binaryMeta) return;

    await delay(100);
    {
      const row = await load();
      if (!row) return;
      row.status = "auditing";
      row.detectionJson = analysis.detectionJson;
      await this.sessions.save(row);
    }

    await delay(120);
    {
      const row = await load();
      if (!row) return;
      const terminal = analysis.terminal;
      row.status = terminal.status;
      row.auditDecision = terminal.auditDecision;
      row.auditSummary = terminal.auditSummary;
      row.previewState = "unavailable" as SourceIntakePreviewState;
      row.previewUnavailableReason = analysis.previewUnavailableReason;
      const publishWarn = loadPublishWithWarningsPolicyFromEnv();
      const modelInput = buildSourceModelReviewInput({
        sessionId: row.id,
        originalName: binaryMeta.label,
        mimeType: binaryMeta.mimeType,
        sizeBytes: binaryMeta.sizeBytes,
        analysis,
        extractedSources: analysis.extractedSources
      });
      const modelOut = await this.modelReviewAdapter.maybeEnrichReview(modelInput);
      const extractErr =
        typeof analysis.auditJsonBase.extractError === "string" ? analysis.auditJsonBase.extractError : null;
      const staticReview = assembleStaticPolicyModelReview({
        terminal: analysis.terminal,
        findings: analysis.findings,
        detectionJson: analysis.detectionJson,
        auditSummaryLine: analysis.terminal.auditSummary,
        pipelineReadError: false,
        buildUnitId: null,
        publishWithWarningsAllowed: publishWarn,
        extractError: extractErr,
        scanTruncated: analysis.auditJsonBase.scanTruncated === true
      });
      const modelReview = mergeModelReviewEnrichment(staticReview, modelOut);
      const reviewPolicy = buildReviewPolicySnapshot(modelReview, {
        pipelineReadError: false,
        publishWithWarningsAllowed: publishWarn
      });
      row.auditJson = {
        ...analysis.auditJsonBase,
        completedAt: new Date().toISOString(),
        ...flattenReviewIntoAuditJson(modelReview, reviewPolicy)
      };
      await this.sessions.save(row);
    }
  }

  async getSession(userId: string, sessionId: string): Promise<SourceIntakeSessionEntity> {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row) throw new NotFoundException("Source intake session not found.");
    if (row.userId !== userId) throw new ForbiddenException("Access denied.");
    return row;
  }

  /**
   * Explicit publish: creates a build_units row and links the session.
   * Eligibility is enforced only here — never from client hints alone.
   */
  async publishSession(
    userId: string,
    sessionId: string,
    dto: PublishSourceIntakeDto
  ): Promise<{ buildUnit: BuildUnitEntity; session: SourceIntakeSessionEntity }> {
    const result = await this.sessions.manager.transaction(async (em) => {
      const repo = em.getRepository(SourceIntakeSessionEntity);
      const row = await repo.findOne({
        where: { id: sessionId },
        lock: { mode: "pessimistic_write" }
      });
      if (!row) throw new NotFoundException("Source intake session not found.");
      if (row.userId !== userId) throw new ForbiddenException("Access denied.");

      if (row.buildUnitId) {
        throw new ConflictException("This intake was already published to a build unit.");
      }

      if (!PUBLISHABLE_AUDIT.includes(row.auditDecision)) {
        throw new BadRequestException(
          "Only approved or approved-with-warnings intakes can be published."
        );
      }

      if (row.status !== "approved" && row.status !== "approved_with_warnings") {
        throw new BadRequestException("Intake is not in a publishable status.");
      }

      const file = await this.files.assertUserOwnsFile(userId, row.sourceFileId);
      const defaultTitle = (file.originalName || "imported-source").replace(/\.[^/.]+$/, "").trim() || "Imported source";

      let title = (dto.title?.trim() || defaultTitle).slice(0, 220);
      if (!title) title = "Imported source";

      const description =
        dto.description !== undefined && dto.description !== null && String(dto.description).trim()
          ? String(dto.description).trim().slice(0, 8000)
          : null;

      const category = (dto.category?.trim() || "code").slice(0, 60);
      if (!category) throw new BadRequestException("Category is required.");

      let type: BuildUnitType = inferDefaultPublishedBuildUnitTypeFromOriginalName(file.originalName);
      if (dto.type?.trim()) {
        const t = dto.type.trim() as BuildUnitType;
        if (!VALID_UNIT_TYPES.includes(t)) {
          throw new BadRequestException(`Invalid type. Must be one of: ${VALID_UNIT_TYPES.join(", ")}.`);
        }
        type = t;
      }

      let tags: string[] | null = null;
      if (dto.tags?.length) {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const raw of dto.tags) {
          const s = String(raw ?? "")
            .trim()
            .slice(0, 64);
          if (!s || seen.has(s)) continue;
          seen.add(s);
          out.push(s);
          if (out.length >= 32) break;
        }
        tags = out.length ? out : null;
      }

      const auditOnUnit = row.auditDecision as "approved" | "approved_with_warnings";

      const previewState = row.previewState as NonNullable<BuildUnitEntity["intakePreviewState"]>;

      const unit = await this.buildUnits.createFromSourceIntakeTransactional(em, {
        userId,
        sourceFileId: row.sourceFileId,
        sourceFileName: file.originalName ?? null,
        sourceFileMime: file.mimeType ?? null,
        intakePreviewState: previewState,
        intakePreviewUnavailableReason: row.previewUnavailableReason,
        intakeAuditDecision: auditOnUnit,
        intakeDetectionJson: row.detectionJson,
        title,
        description,
        type,
        category,
        tags,
        metadataJson: { sourceIntakeSessionId: row.id }
      });

      row.buildUnitId = unit.id;
      await repo.save(row);

      return { buildUnit: unit, session: row };
    });

    void this.buildUnits.ensureCatalogPreviewSnapshotForUnit(userId, result.buildUnit.id).catch((err: unknown) => {
      this.logger.warn(`catalog preview snapshot after publish: ${String(err)}`);
    });

    // Trigger frontend preview build (fire-and-forget).
    // Runs for React/TSX/JS sources that passed audit and have previewable detection.
    // Sets previewFileId + intakePreviewState="ready" on success; updates reason on failure.
    void this.buildUnits.triggerPreviewBuildForUnit(userId, result.buildUnit.id).catch((err: unknown) => {
      this.logger.warn(`frontend preview build trigger after publish: ${String(err)}`);
    });

    return result;
  }
}

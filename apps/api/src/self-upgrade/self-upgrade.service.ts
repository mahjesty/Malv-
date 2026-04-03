import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Like, Repository } from "typeorm";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";

import { SelfUpgradeRequestEntity, type SelfUpgradeRequestStatus } from "../db/entities/self-upgrade-request.entity";
import { SelfUpgradeAnalysisReportEntity } from "../db/entities/self-upgrade-analysis-report.entity";
import { SelfUpgradePatchSetEntity } from "../db/entities/self-upgrade-patch-set.entity";
import { SelfUpgradeReviewSessionEntity } from "../db/entities/self-upgrade-review-session.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";

/**
 * Self-upgrade safety model (3-layer separation):
 * - Sandbox: isolated git worktree under MALV_SELF_UPGRADE_WORKTREE_PARENT — all study edits & validation run here first.
 * - Admin preview: persisted rows in self_upgrade_review_sessions + patch_sets — full diff and reports; never "just a summary".
 * - Production: OPERATOR_WORKSPACE_ROOT — only mutated via SandboxExecutionService.applyPatchProposal after explicit approve + apply.
 *
 * Push/deploy are out of scope; nothing here triggers them.
 */
@Injectable()
export class SelfUpgradeService {
  private readonly logger = new Logger(SelfUpgradeService.name);

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(SelfUpgradeRequestEntity) private readonly requests: Repository<SelfUpgradeRequestEntity>,
    @InjectRepository(SelfUpgradeAnalysisReportEntity) private readonly reports: Repository<SelfUpgradeAnalysisReportEntity>,
    @InjectRepository(SelfUpgradePatchSetEntity) private readonly patchSets: Repository<SelfUpgradePatchSetEntity>,
    @InjectRepository(SelfUpgradeReviewSessionEntity) private readonly reviews: Repository<SelfUpgradeReviewSessionEntity>,
    @InjectRepository(SandboxRunEntity) private readonly sandboxRuns: Repository<SandboxRunEntity>,
    @InjectRepository(SandboxPatchProposalEntity) private readonly patchProposals: Repository<SandboxPatchProposalEntity>,
    @InjectRepository(AuditEventEntity) private readonly auditEvents: Repository<AuditEventEntity>,
    private readonly sandboxExecution: SandboxExecutionService,
    private readonly beast: BeastWorkerClient
  ) {}

  private prodRoot() {
    return this.cfg.get<string>("OPERATOR_WORKSPACE_ROOT") ?? process.cwd();
  }

  private worktreeParent() {
    return this.cfg.get<string>("MALV_SELF_UPGRADE_WORKTREE_PARENT") ?? path.join(os.tmpdir(), "malv-self-upgrade-worktrees");
  }

  private async runGit(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn("git", args, { cwd, env: { ...process.env } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.on("error", (err) => resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` }));
    });
  }

  private async audit(actorUserId: string | undefined, eventType: string, message: string, metadata?: Record<string, unknown>) {
    await this.auditEvents.save(
      this.auditEvents.create({
        actorUser: actorUserId ? ({ id: actorUserId } as any) : null,
        eventType,
        level: "info",
        message,
        metadata: metadata ?? null
      })
    );
  }

  async createRequest(args: { adminUserId: string; title: string; description: string; context?: Record<string, unknown> }) {
    const row = this.requests.create({
      title: args.title.trim().slice(0, 200),
      description: args.description.trim(),
      status: "pending_analysis",
      createdBy: { id: args.adminUserId } as any,
      contextJson: args.context ?? null
    });
    await this.requests.save(row);
    await this.audit(args.adminUserId, "self_upgrade.request_created", `Self-upgrade request ${row.id}`, { requestId: row.id });
    return row;
  }

  async listRequests(limit = 50) {
    const take = Math.min(100, Math.max(1, limit));
    return this.requests.find({ order: { createdAt: "DESC" }, take });
  }

  async getRequest(id: string) {
    const r = await this.requests.findOne({ where: { id }, relations: ["createdBy", "sandboxRun"] });
    if (!r) throw new NotFoundException("Request not found");
    return r;
  }

  private assertCanAnalyze(status: SelfUpgradeRequestStatus) {
    const ok = ["draft", "pending_analysis", "analysis_complete", "revision_requested", "failed"].includes(status);
    if (!ok) throw new BadRequestException(`Cannot analyze in status ${status}`);
  }

  async analyze(requestId: string, adminUserId: string) {
    const req = await this.getRequest(requestId);
    this.assertCanAnalyze(req.status);
    req.status = "analyzing";
    req.failureReason = null;
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.analyze_started", `Analyze ${requestId}`, { requestId });

    const root = this.prodRoot();
    const rev = await this.runGit(["rev-parse", "--is-inside-work-tree"], root);
    if (rev.stdout.trim() !== "true") {
      req.status = "failed";
      req.failureReason = "OPERATOR_WORKSPACE_ROOT is not a git work tree.";
      await this.requests.save(req);
      throw new BadRequestException(req.failureReason);
    }

    const head = (await this.runGit(["rev-parse", "--short", "HEAD"], root)).stdout.trim();
    const branch = (await this.runGit(["branch", "--show-current"], root)).stdout.trim() || "(detached)";
    const status = (await this.runGit(["status", "--short"], root)).stdout.trim();
    const ls = (await this.runGit(["ls-files"], root)).stdout.trim();
    const files = ls.split("\n").filter(Boolean).slice(0, 400);
    const topDirs = [...new Set(files.map((f) => f.split("/")[0] ?? "").filter(Boolean))].slice(0, 40);

    let aiNarrative = "";
    try {
      const inf = await this.beast.infer({
        mode: "light",
        prompt: `You are an engineering analyst. Summarize repository architecture for a planned change.\n\nRequest title: ${req.title}\nDescription: ${req.description}\n\nTop-level areas: ${topDirs.join(", ")}\nSample paths (truncated): ${files.slice(0, 30).join(", ")}\n\nRespond with 2-4 short paragraphs: layering, main apps/packages, dependency direction, and where this change likely lands.`,
        context: { requestId, kind: "self_upgrade_study" }
      });
      aiNarrative = (inf.reply ?? "").slice(0, 12_000);
    } catch (e) {
      this.logger.warn(`Beast study narrative skipped: ${e instanceof Error ? e.message : String(e)}`);
      aiNarrative = "Automated architecture narrative unavailable (worker unreachable). Heuristic summary below.";
    }

    const report = this.reports.create({
      request: req,
      architectureUnderstanding: {
        narrative: aiNarrative,
        gitHead: head,
        branch,
        repoRoot: root,
        isolationNote: "Study used read-only git commands against OPERATOR_WORKSPACE_ROOT — no writes."
      },
      filesExamined: {
        sampleCount: files.length,
        samplePaths: files.slice(0, 120),
        workingTreeDirty: Boolean(status)
      },
      affectedModules: {
        topLevel: topDirs,
        inferredFocus: topDirs.filter((d) => /^(apps|packages|services)/.test(d))
      },
      dependencyNotes: {
        hint: "Inspect package.json / workspace manifests in target areas before large refactors.",
        monorepoMarkers: files.some((f) => f === "pnpm-workspace.yaml" || f === "package.json")
      },
      studySummary: `Analyzed ${files.length} tracked paths (sampled). Branch ${branch} @ ${head}.`
    });
    await this.reports.save(report);

    req.status = "analysis_complete";
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.analyze_complete", `Analyze complete ${requestId}`, { requestId, reportId: report.id });
    return { request: req, report };
  }

  private async ensureWorktree(req: SelfUpgradeRequestEntity): Promise<string> {
    const root = this.prodRoot();
    const parent = this.worktreeParent();
    await fs.mkdir(parent, { recursive: true });
    const wt = path.join(parent, `su-${req.id}`);
    if (req.sandboxWorktreePath && req.sandboxWorktreePath !== wt) {
      await this.runGit(["-C", root, "worktree", "remove", "--force", req.sandboxWorktreePath], root).catch(() => undefined);
    }
    await fs.rm(wt, { recursive: true, force: true }).catch(() => undefined);
    const br = `malv-su-${req.id.slice(0, 8)}`;
    const add = await this.runGit(["-C", root, "worktree", "add", "-B", br, wt, "HEAD"], root);
    if (add.code !== 0) {
      throw new BadRequestException(`git worktree add failed: ${(add.stderr || add.stdout).slice(0, 2000)}`);
    }
    req.sandboxWorktreePath = wt;
    await this.requests.save(req);
    return wt;
  }

  async generate(requestId: string, adminUserId: string) {
    const req = await this.getRequest(requestId);
    if (!["analysis_complete", "revision_requested"].includes(req.status)) {
      throw new BadRequestException(`Generate requires analysis_complete or revision_requested (got ${req.status}).`);
    }

    await this.supersedeOpenReviews(req.id);

    req.status = "generating";
    req.failureReason = null;
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.generate_started", `Generate ${requestId}`, { requestId });

    const wt = await this.ensureWorktree(req);
    const stagingDir = path.join(wt, ".malv", "self-upgrade");
    await fs.mkdir(stagingDir, { recursive: true });
    const stamp = new Date().toISOString();
    const body = `# MALV self-upgrade staging\n\n- request: ${req.id}\n- title: ${req.title}\n- generatedAt: ${stamp}\n\nThis file exists only in the sandbox worktree. It demonstrates a concrete diff for admin preview — not a hand-wavy summary.\n`;
    await fs.writeFile(path.join(stagingDir, "STAGING.md"), body, "utf8");

    const staged = await this.runGit(["add", "-A"], wt);
    if (staged.code !== 0) {
      throw new BadRequestException(`git add failed: ${(staged.stderr || staged.stdout).slice(0, 2000)}`);
    }
    const diffOut = await this.runGit(["diff", "--cached"], wt);
    const diffText = (diffOut.stdout ?? "").trim();
    if (!diffText) {
      req.status = "failed";
      req.failureReason = "No diff produced in sandbox worktree.";
      await this.requests.save(req);
      throw new BadRequestException(req.failureReason);
    }

    const run = this.sandboxRuns.create({
      user: { id: adminUserId } as any,
      workspace: null,
      runType: "self_evolve",
      status: "completed",
      inputPayload: { selfUpgradeRequestId: req.id, worktreePath: wt },
      outputPayload: { phase: "self_upgrade_generate" },
      finishedAt: new Date()
    });
    await this.sandboxRuns.save(run);
    req.sandboxRun = run;
    await this.requests.save(req);

    const patchProposal = this.patchProposals.create({
      sandboxRun: run,
      user: { id: adminUserId } as any,
      status: "pending",
      diffText,
      summary: { source: "self_upgrade", requestId: req.id }
    });
    await this.patchProposals.save(patchProposal);

    req.status = "validating";
    await this.requests.save(req);

    const validation = await this.runValidation(wt, diffText);

    const changedFiles = this.summarizeChangedFiles(diffText);
    const risks = this.heuristicRisks(diffText, changedFiles);
    const rollback = `Keep this patch artifact. Roll back with: git apply -R <saved_patch.diff> (or git revert on the applied commit). Patch id ${patchProposal.id}.`;

    const patchSet = this.patchSets.create({
      request: req,
      sandboxRun: run,
      sandboxPatchProposal: patchProposal,
      diffText,
      changedFiles,
      validationSummary: validation,
      validationPassed: Boolean(validation.checks?.gitDiffCheckOk),
      riskNotes: risks,
      rollbackPlan: rollback
    });
    await this.patchSets.save(patchSet);

    const report = await this.reports.findOne({ where: { request: { id: req.id } }, order: { createdAt: "DESC" } });
    if (!report) {
      req.status = "failed";
      req.failureReason = "Missing analysis report.";
      await this.requests.save(req);
      throw new BadRequestException("Analysis report missing.");
    }

    const review = this.reviews.create({
      request: req,
      analysisReport: report,
      patchSet,
      previewStatus: "ready",
      changedFiles,
      diffSummary: this.buildDiffSummary(diffText),
      validationSummary: validation,
      riskSummary: JSON.stringify(risks),
      rollbackSummary: rollback,
      readyForApply: false
    });
    await this.reviews.save(review);

    req.status = "preview_ready";
    await this.requests.save(req);

    await this.audit(adminUserId, "self_upgrade.preview_ready", `Preview ready ${requestId}`, {
      requestId,
      reviewSessionId: review.id,
      patchSetId: patchSet.id
    });
    return { request: req, review, patchSet, patchProposal };
  }

  private async supersedeOpenReviews(requestId: string) {
    await this.reviews
      .createQueryBuilder()
      .update(SelfUpgradeReviewSessionEntity)
      .set({ previewStatus: "superseded" })
      .where("request_id = :rid", { rid: requestId })
      .andWhere("preview_status IN (:...st)", { st: ["ready", "revision_requested"] })
      .execute();
  }

  private buildDiffSummary(diffText: string) {
    const lines = diffText.split("\n").length;
    const files = (diffText.match(/^diff --git /gm) ?? []).length;
    return `${files} file(s), ~${lines} diff lines (full patch stored).`;
  }

  private summarizeChangedFiles(diffText: string): Record<string, unknown> {
    const paths: string[] = [];
    for (const m of diffText.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)) {
      paths.push(m[2] ?? m[1]);
    }
    return { paths: [...new Set(paths)] };
  }

  private heuristicRisks(diffText: string, changedFiles: Record<string, unknown>): Record<string, unknown> {
    const paths = (changedFiles.paths as string[]) ?? [];
    const touchesConfig = paths.some((p) => /(tsconfig|package\.json|\.env|vite\.config)/i.test(p));
    const large = diffText.length > 500_000;
    return {
      largePatch: large,
      touchesDependencyOrConfig: touchesConfig,
      note: "Review diff and validation output before apply. No deploy is triggered by this pipeline."
    };
  }

  private async runValidation(worktree: string, diffText: string) {
    const diffCheck = await this.runGit(["diff", "--cached", "--check"], worktree);
    return {
      checks: {
        gitDiffCheckOk: diffCheck.code === 0,
        gitDiffCheck: (diffCheck.stderr || diffCheck.stdout).slice(0, 4000)
      },
      extra: { skipped: true, reason: "env_command_execution_disabled_for_security" },
      stagedBytes: Buffer.byteLength(diffText, "utf8")
    };
  }

  async getPreview(requestId: string) {
    const req = await this.getRequest(requestId);
    const list = await this.reviews.find({
      where: { request: { id: requestId } },
      relations: ["analysisReport", "patchSet", "patchSet.sandboxPatchProposal"],
      order: { createdAt: "DESC" },
      take: 1
    });
    const review = list[0];
    if (!review) return { request: req, preview: null };
    return { request: req, preview: review };
  }

  /** Admin preview API: includes full unified diff text (staged artifact), not a summary-only view. */
  async getAdminPreview(requestId: string) {
    const base = await this.getPreview(requestId);
    if (!base.preview) return { ...base, fullDiff: null as string | null };
    const patchSet = await this.patchSets.findOne({ where: { id: base.preview.patchSet.id } });
    return { ...base, fullDiff: patchSet?.diffText ?? null };
  }

  async revalidate(requestId: string, adminUserId: string) {
    const req = await this.getRequest(requestId);
    if (!req.sandboxWorktreePath) {
      throw new BadRequestException("Sandbox worktree is not available (re-run generate).");
    }
    const review = await this.latestReview(requestId);
    if (!review) throw new BadRequestException("No review session.");
    const patchSet = await this.patchSets.findOne({ where: { id: review.patchSet.id } });
    if (!patchSet) throw new BadRequestException("Patch set missing.");
    const validation = await this.runValidation(req.sandboxWorktreePath, patchSet.diffText);
    patchSet.validationSummary = validation;
    patchSet.validationPassed = Boolean(validation.checks?.gitDiffCheckOk);
    await this.patchSets.save(patchSet);
    review.validationSummary = validation;
    await this.reviews.save(review);
    await this.audit(adminUserId, "self_upgrade.revalidated", `Revalidate ${requestId}`, { requestId });
    return { request: req, patchSet, review, validation };
  }

  async requestRevision(requestId: string, adminUserId: string, note?: string) {
    const req = await this.getRequest(requestId);
    if (req.status !== "preview_ready") {
      throw new BadRequestException("Revision can only be requested when a preview is ready.");
    }
    const review = await this.latestReview(requestId);
    if (!review) throw new BadRequestException("No review session.");
    review.previewStatus = "revision_requested";
    review.adminNotes = note ?? review.adminNotes ?? null;
    await this.reviews.save(review);
    req.status = "revision_requested";
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.revision_requested", note ?? "revision", { requestId, reviewId: review.id });
    return { request: req, review };
  }

  async reject(requestId: string, adminUserId: string, note?: string) {
    const req = await this.getRequest(requestId);
    const review = await this.latestReview(requestId);
    if (review) {
      review.previewStatus = "rejected";
      review.adminNotes = note ?? review.adminNotes ?? null;
      await this.reviews.save(review);
    }
    req.status = "rejected";
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.rejected", note ?? "rejected", { requestId });
    return req;
  }

  async approveApply(requestId: string, adminUserId: string, note?: string) {
    const req = await this.getRequest(requestId);
    if (req.status !== "preview_ready") throw new BadRequestException("Approve requires preview_ready.");
    const review = await this.latestReview(requestId);
    if (!review || review.previewStatus !== "ready") throw new BadRequestException("No ready preview package.");
    review.previewStatus = "approved_apply";
    review.readyForApply = true;
    review.adminNotes = note ?? review.adminNotes ?? null;
    await this.reviews.save(review);
    req.status = "approved_apply";
    await this.requests.save(req);
    await this.audit(adminUserId, "self_upgrade.approved_apply", note ?? "approved", { requestId, reviewId: review.id });
    return { request: req, review };
  }

  async applyToProduction(requestId: string, adminUserId: string, note?: string) {
    const req = await this.getRequest(requestId);
    if (req.status !== "approved_apply") throw new BadRequestException("Apply requires approved_apply status.");
    const review = await this.latestReview(requestId);
    if (!review || review.previewStatus !== "approved_apply" || !review.readyForApply) {
      throw new BadRequestException("Review not approved for apply.");
    }
    const patchSet = await this.patchSets.findOne({
      where: { id: review.patchSet.id },
      relations: ["sandboxPatchProposal"]
    });
    const patchId = patchSet?.sandboxPatchProposal?.id;
    if (!patchId) throw new BadRequestException("Missing sandbox patch proposal.");

    await this.audit(adminUserId, "self_upgrade.apply_invoked", `Apply to production ${requestId}`, { requestId, patchProposalId: patchId });

    const applied = await this.sandboxExecution.applyPatchProposal({
      patchProposalId: patchId,
      adminUserId,
      note: note ?? "self_upgrade apply"
    });

    if (applied.status !== "applied") {
      await this.audit(adminUserId, "self_upgrade.apply_failed", applied.applyError ?? "apply_failed", { requestId, patchProposalId: patchId });
      throw new BadRequestException(applied.applyError ?? "Apply failed");
    }

    review.previewStatus = "applied";
    await this.reviews.save(review);
    req.status = "applied";
    await this.requests.save(req);

    if (req.sandboxWorktreePath) {
      const root = this.prodRoot();
      await this.runGit(["-C", root, "worktree", "remove", "--force", req.sandboxWorktreePath], root).catch(() => undefined);
      req.sandboxWorktreePath = null;
      await this.requests.save(req);
    }

    await this.audit(adminUserId, "self_upgrade.applied", `Applied ${requestId}`, { requestId, patchProposalId: patchId });
    return { request: req, review, patch: applied };
  }

  private async latestReview(requestId: string) {
    const list = await this.reviews.find({
      where: { request: { id: requestId } },
      order: { createdAt: "DESC" },
      take: 1,
      relations: ["patchSet", "patchSet.sandboxPatchProposal", "analysisReport"]
    });
    return list[0] ?? null;
  }

  async getAuditTimeline(requestId: string, limit = 80) {
    const cap = Math.min(200, limit);
    const batch = await this.auditEvents.find({
      where: { eventType: Like("self_upgrade.%") },
      order: { occurredAt: "DESC" },
      take: 500
    });
    const filtered = batch
      .filter((e) => (e.metadata as { requestId?: string } | null)?.requestId === requestId)
      .slice(0, cap)
      .reverse();
    return filtered;
  }

  async getDetailForAdmin(id: string) {
    const req = await this.requests.findOne({
      where: { id },
      relations: ["createdBy", "sandboxRun"]
    });
    if (!req) throw new NotFoundException("Request not found");
    const reports = await this.reports.find({ where: { request: { id } }, order: { createdAt: "DESC" } });
    const patchSets = await this.patchSets.find({
      where: { request: { id } },
      order: { createdAt: "DESC" },
      relations: ["sandboxPatchProposal", "sandboxRun"]
    });
    const reviews = await this.reviews.find({
      where: { request: { id } },
      order: { createdAt: "DESC" },
      relations: ["analysisReport", "patchSet"]
    });
    const timeline = await this.getAuditTimeline(id);
    return { request: req, reports, patchSets, reviews, timeline };
  }
}

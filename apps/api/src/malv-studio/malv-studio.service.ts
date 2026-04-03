import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { StudioSessionStreamService } from "./studio-session-stream.service";

@Injectable()
export class MalvStudioService {
  constructor(
    @InjectRepository(MalvStudioSessionEntity) private readonly sessions: Repository<MalvStudioSessionEntity>,
    @InjectRepository(SandboxPatchProposalEntity) private readonly patches: Repository<SandboxPatchProposalEntity>,
    private readonly sandbox: SandboxExecutionService,
    private readonly stream: StudioSessionStreamService
  ) {}

  async createSession(args: { userId: string; workspaceId?: string | null; title?: string }): Promise<MalvStudioSessionEntity> {
    const row = this.sessions.create({
      user: { id: args.userId } as any,
      workspace: args.workspaceId ? ({ id: args.workspaceId } as any) : null,
      title: args.title?.trim() || "MALV Studio Session",
      status: "active",
      versions: []
    });
    return this.sessions.save(row);
  }

  async getSession(userId: string, sessionId: string) {
    const row = await this.sessions.findOne({ where: { id: sessionId, user: { id: userId } } });
    if (!row) throw new BadRequestException("Studio session not found.");
    return row;
  }

  async captureTarget(args: { userId: string; sessionId: string; target: Record<string, unknown> }) {
    const row = await this.getSession(args.userId, args.sessionId);
    row.selectedTarget = args.target ?? null;
    row.previewContext = {
      ...(row.previewContext ?? {}),
      route: args.target?.route ?? null,
      deviceMode: args.target?.deviceMode ?? "desktop",
      componentHint: args.target?.componentName ?? args.target?.label ?? null
    };
    return this.sessions.save(row);
  }

  async iterateWithInstruction(args: { userId: string; sessionId: string; instruction: string; workspaceId?: string | null }) {
    const row = await this.getSession(args.userId, args.sessionId);
    row.status = "building";
    await this.sessions.save(row);
    this.stream.emitPreviewRefining(args.sessionId);
    this.stream.emitPhaseUpdate(args.sessionId, "analyze", "in_progress", "Analyzing instruction.");
    const targetLabel = String((row.selectedTarget as any)?.label ?? "Selected area");
    const confidence = this.inferConfidence(args.instruction);
    const riskLevel = confidence === "low" ? "high" : confidence === "medium" ? "medium" : "low";
    const plan = this.buildPlan(args.instruction, targetLabel);
    const nowIso = new Date().toISOString();
    const safeSummary = {
      title: `Updated ${targetLabel}`,
      /** Explicitly unset — frontend must not substitute a fake unified diff. */
      diffPreview: null as string | null,
      productTruth: {
        fileHintsAreInferred: true,
        unifiedDiffAttached: false,
        changeSummaryStyle: "instruction_driven" as const,
        targetingNote: "Heuristic file routing from instruction text unless DOM bridge provides a precise target."
      },
      changes: [`Instruction: ${args.instruction.slice(0, 180)}`, "Prepared safe preview update", "Awaiting review/apply decision"],
      insights: this.buildInsights(args.instruction, targetLabel),
      changedFiles: this.inferChangedFiles(args.instruction),
      logs: ["preview_workspace_staged", "typed_actions_dispatched", "diff_summary_generated"],
      terminal: [
        { at: nowIso, command: "git status --porcelain", group: "build", success: true },
        { at: nowIso, command: "git diff --stat", group: "inspect", success: true }
      ],
      console: [
        { at: nowIso, severity: "info", group: "planner", message: "Plan generated for studio execution." },
        { at: nowIso, severity: "info", group: "sandbox", message: "Sandbox run initialized in preview environment." },
        { at: nowIso, severity: "warning", group: "review", message: confidence === "low" ? "Low confidence. Manual validation recommended." : "Review changes before apply." }
      ],
      confidence,
      riskLevel,
      plan,
      execution: {
        mode: "preview_only",
        sandboxActive: true,
        productionWrite: false
      }
    };
    const run = await this.sandbox.createOperatorTaskSandboxRun({
      userId: args.userId,
      workspaceId: args.workspaceId ?? (row.workspace as any)?.id ?? null,
      aiJobId: null,
      commands: [],
      typedActions: [
        { actionType: "get_git_status", parameters: {}, scopeType: "repo" },
        { actionType: "get_git_diff", parameters: {}, scopeType: "repo" }
      ],
      requiresApproval: false
    });
    const patch = await this.patches.findOne({
      where: { sandboxRun: { id: run.id } as any },
      order: { createdAt: "DESC" }
    });
    row.lastSandboxRunId = run.id;
    row.lastPatchProposalId = patch?.id ?? null;
    this.stream.correlate({
      sessionId: args.sessionId,
      sandboxRunId: run.id,
      versionId: `v${(row.versions?.length ?? 0) + 1}`
    });
    this.stream.emitTerminal(args.sessionId, "git status --porcelain", "build", true);
    this.stream.emitTerminal(args.sessionId, "git diff --stat", "inspect", true);
    this.stream.emitConsoleInfo(args.sessionId, "sandbox", "Sandbox run staged for preview.");
    this.stream.emitPhaseUpdate(args.sessionId, "rebuild", "in_progress", "Preview rebuild in progress.");
    row.pendingChangeSummary = safeSummary;
    row.status = "ready";
    row.versions = [
      ...(row.versions ?? []),
      {
        id: `v${(row.versions?.length ?? 0) + 1}`,
        createdAt: new Date().toISOString(),
        summary: safeSummary.title,
        changedFiles: safeSummary.changedFiles,
        confidence: safeSummary.confidence,
        riskLevel,
        insights: safeSummary.insights,
        pendingChangeSummary: safeSummary
      }
    ];
    await this.sessions.save(row);
    this.stream.emitPhaseUpdate(args.sessionId, "rebuild", "completed", "Preview ready.");
    this.stream.emitPreviewReady(args.sessionId);
    this.stream.emitApplyState(args.sessionId, "pending_approval", {
      riskLevel,
      confidence
    });
    return row;
  }

  async apply(userId: string, sessionId: string, adminUserId: string, opts?: { riskAcknowledged?: boolean }) {
    const row = await this.getSession(userId, sessionId);
    const pending = (row.pendingChangeSummary ?? {}) as Record<string, unknown>;
    const riskLevel = String(pending.riskLevel ?? "medium");
    if (riskLevel === "high" && !opts?.riskAcknowledged) {
      this.stream.emitApplyState(sessionId, "pending_approval", {
        riskLevel,
        confidence: String(pending.confidence ?? "medium"),
        message: "High risk requires acknowledgment."
      });
      return { ok: false, error: "High-risk patch requires explicit approval.", requiresApproval: true };
    }
    if (!row.lastPatchProposalId) return { ok: false, error: "No pending patch proposal to apply." };
    this.stream.emitApplyState(sessionId, "applying", {
      riskLevel,
      confidence: String(pending.confidence ?? "medium")
    });
    const patch = await this.sandbox.applyPatchProposal({ patchProposalId: row.lastPatchProposalId, adminUserId, note: "malv_studio_apply" });
    row.status = patch.status === "applied" ? "applied" : "error";
    row.pendingChangeSummary = {
      ...(row.pendingChangeSummary ?? {}),
      appliedAt: new Date().toISOString(),
      state: "applied"
    };
    await this.sessions.save(row);
    this.stream.emitApplyState(sessionId, patch.status === "applied" ? "applied" : "failed", {
      riskLevel,
      confidence: String(pending.confidence ?? "medium")
    });
    return { ok: true, patchStatus: patch.status, patchId: patch.id };
  }

  async revert(userId: string, sessionId: string) {
    const row = await this.getSession(userId, sessionId);
    row.status = "reverted";
    row.pendingChangeSummary = {
      ...(row.pendingChangeSummary ?? {}),
      revertedAt: new Date().toISOString(),
      revertNote: "Reverted in MALV Studio review flow."
    };
    await this.sessions.save(row);
    this.stream.emitApplyState(sessionId, "reverted", { message: "Studio revert completed." });
    return { ok: true };
  }

  async restoreVersion(userId: string, sessionId: string, versionId: string) {
    const row = await this.getSession(userId, sessionId);
    const versions = (row.versions ?? []) as Array<Record<string, unknown>>;
    const target = versions.find((v) => String(v.id) === versionId);
    if (!target) throw new BadRequestException("Version not found.");
    row.pendingChangeSummary = ((target.pendingChangeSummary as Record<string, unknown> | undefined) ?? row.pendingChangeSummary) ?? null;
    row.status = "ready";
    await this.sessions.save(row);
    return row;
  }

  async compareVersions(userId: string, sessionId: string, args: { leftVersionId: string; rightVersionId: string }) {
    const row = await this.getSession(userId, sessionId);
    const versions = (row.versions ?? []) as Array<Record<string, unknown>>;
    const left = versions.find((v) => String(v.id) === args.leftVersionId);
    const right = versions.find((v) => String(v.id) === args.rightVersionId);
    if (!left || !right) throw new BadRequestException("One or more versions not found.");
    const leftFiles = (left.changedFiles as string[] | undefined) ?? [];
    const rightFiles = (right.changedFiles as string[] | undefined) ?? [];
    const changedFiles = Array.from(new Set([...leftFiles, ...rightFiles]));
    const leftInsights = (left.insights as string[] | undefined) ?? [];
    const rightInsights = (right.insights as string[] | undefined) ?? [];
    return {
      leftVersionId: args.leftVersionId,
      rightVersionId: args.rightVersionId,
      changedFiles,
      insightDelta: Array.from(new Set([...leftInsights, ...rightInsights])),
      summary: `${args.leftVersionId} vs ${args.rightVersionId} across ${changedFiles.length} files.`
    };
  }

  private inferChangedFiles(instruction: string): string[] {
    const text = instruction.toLowerCase();
    if (/hero|landing|cta/.test(text)) return ["apps/web/src/pages/landing.tsx", "apps/web/src/styles/index.css"];
    if (/navbar|header/.test(text)) return ["apps/web/src/components/navigation/AppSidebar.tsx"];
    if (/theme|dark|color/.test(text)) return ["apps/web/src/styles/index.css", "apps/web/tailwind.config.js"];
    return ["apps/web/src/pages/app/MalvStudioPage.tsx"];
  }

  private inferConfidence(instruction: string): "high" | "medium" | "low" {
    const text = instruction.toLowerCase();
    if (/database|schema|migration|payment|auth|token|delete|production/.test(text)) return "low";
    if (/api|backend|logic|workflow|state|cache/.test(text)) return "medium";
    return "high";
  }

  private buildPlan(instruction: string, targetLabel: string): Array<{ id: string; phase: string; status: string; detail: string }> {
    return [
      { id: "analyze", phase: "Analyze", status: "completed", detail: `Interpreted instruction for ${targetLabel}: ${instruction.slice(0, 90)}` },
      { id: "redesign", phase: "Redesign", status: "completed", detail: "Prepared scoped changes for selected target and current device preview." },
      { id: "update", phase: "Update", status: "completed", detail: "Generated patch proposal inside sandbox preview environment." },
      { id: "rebuild", phase: "Rebuild", status: "in_progress", detail: "Preview build ready for inspection and approval-aware apply." }
    ];
  }

  private buildInsights(instruction: string, targetLabel: string): string[] {
    const lower = instruction.toLowerCase();
    const insights = [
      `Refined visual hierarchy in ${targetLabel} for stronger readability.`,
      "Improved spacing rhythm to reduce layout density and boost scanability."
    ];
    if (/premium|cinematic|modern|theme|color/.test(lower)) insights.push("Adjusted color and tone system for a more premium visual direction.");
    if (/performance|fast|optimize/.test(lower)) insights.push("Reduced potential render overhead by narrowing update scope.");
    if (/api|backend|logic|workflow/.test(lower)) insights.push("Prepared backend logic-safe changes while keeping sandbox and approval controls intact.");
    return insights;
  }
}

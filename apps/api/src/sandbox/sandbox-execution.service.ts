import { BadRequestException, forwardRef, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { In, Repository } from "typeorm";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AiJobEntity, type AiJobStatus } from "../db/entities/ai-job.entity";
import { SandboxRunEntity, type SandboxRunStatus, type SandboxRunType } from "../db/entities/sandbox-run.entity";
import { FileEntity, type FileKind } from "../db/entities/file.entity";
import { FileContextEntity } from "../db/entities/file-context.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { FileChunkEntity } from "../db/entities/file-chunk.entity";
import { FileEmbeddingEntity } from "../db/entities/file-embedding.entity";
import { OperatorRuntimeService } from "./operator-runtime.service";
import { RuntimePolicyService } from "./runtime-policy.service";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { SandboxCommandPolicyDecisionEntity } from "../db/entities/sandbox-command-policy-decision.entity";
import { SandboxTypedActionEntity } from "../db/entities/sandbox-typed-action.entity";
import { WorkspaceAccessService, type GlobalRole } from "../workspace/workspace-access.service";
import { ReflectionService } from "../improvement/reflection.service";
import { ObservabilityService } from "../common/observability.service";
import { RuntimeEventBusService } from "../common/runtime-event-bus.service";

type FileUnderstandSandboxInput = {
  runKind: "file_understand_extract";
  aiJobId: string;
  fileId: string;
  fileContextIds: string[];
  requiresApproval: boolean;
  maxExtractBytes: number;
};

type OperatorTaskSandboxInput = {
  runKind: "operator_task";
  /** When omitted, sandbox completion does not mutate an ai_jobs row (e.g. auxiliary Super Fix runs). */
  aiJobId?: string | null;
  commands: Array<{ command: string; commandClass?: "read" | "analyze" | "execute" | "modify" | "system"; metadata?: Record<string, unknown> }>;
  typedActions?: Array<{
    actionType:
      | "read_file"
      | "write_file"
      | "patch_file"
      | "list_directory"
      | "search_repo"
      | "run_tests"
      | "run_typecheck"
      | "run_lint"
      | "inspect_logs"
      | "get_git_status"
      | "get_git_diff";
    parameters: Record<string, unknown>;
    scopeType?: "workspace" | "file" | "symbol" | "directory" | "repo";
    scopeRef?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  requiresApproval: boolean;
  /** When true, job-runner skips this run; API completes validation synchronously. */
  cciInlineExecution?: boolean;
};

type RunTestsTypedActionParameters = {
  framework?: "jest" | "vitest" | "mocha" | "playwright";
  mode?: "unit" | "integration" | "e2e";
  target?: string;
  allowWatch?: false;
  updateSnapshots?: false;
};

type FileUnderstandExtraction = {
  fileId: string;
  fileKind: FileKind;
  mimeType?: string | null;
  originalName: string;
  sizeBytes?: string | null;
  extractedText?: string | null;
  extractedPreview?: string | null;
  notes?: string[];
};

type SandboxRunOutput = {
  runKind: "file_understand_extract" | "operator_task";
  extraction?: FileUnderstandExtraction;
  logs: string[];
  runtime?: {
    executedCount: number;
    typedActionCount?: number;
    failedStep?: number | null;
    patchProposalId?: string | null;
  };
};

@Injectable()
export class SandboxExecutionService {
  private readonly logger = new Logger(SandboxExecutionService.name);

  constructor(
    private readonly killSwitch: KillSwitchService,
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>,
    @InjectRepository(SandboxRunEntity) private readonly sandboxRuns: Repository<SandboxRunEntity>,
    @InjectRepository(FileEntity) private readonly files: Repository<FileEntity>,
    @InjectRepository(FileContextEntity) private readonly fileContexts: Repository<FileContextEntity>,
    @InjectRepository(AuditEventEntity) private readonly auditEvents: Repository<AuditEventEntity>,
    @InjectRepository(BeastActivityLogEntity) private readonly beastLogs: Repository<BeastActivityLogEntity>,
    @InjectRepository(SuggestionRecordEntity) private readonly suggestions: Repository<SuggestionRecordEntity>,
    @InjectRepository(FileChunkEntity) private readonly fileChunks: Repository<FileChunkEntity>,
    @InjectRepository(FileEmbeddingEntity) private readonly fileEmbeddings: Repository<FileEmbeddingEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly approvals: Repository<SandboxApprovalRequestEntity>,
    @InjectRepository(SandboxPatchProposalEntity) private readonly patchProposals: Repository<SandboxPatchProposalEntity>,
    @InjectRepository(SandboxCommandPolicyDecisionEntity) private readonly commandPolicyDecisions: Repository<SandboxCommandPolicyDecisionEntity>,
    @InjectRepository(SandboxTypedActionEntity) private readonly sandboxTypedActions: Repository<SandboxTypedActionEntity>,
    private readonly operatorRuntime: OperatorRuntimeService,
    private readonly runtimePolicy: RuntimePolicyService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly reflection: ReflectionService,
    private readonly observability: ObservabilityService,
    private readonly runtimeBus: RuntimeEventBusService
  ) {}

  private storageRoot(): string {
    return this.cfg.get<string>("PRIVATE_STORAGE_ROOT") ?? "/tmp/malv-storage";
  }

  private async resolvePrivateStoragePath(storageUri: string): Promise<{ resolvedPath: string; relForDebug: string }> {
    const root = path.resolve(this.storageRoot());

    // storageUri is expected to be either:
    // - absolute path under PRIVATE_STORAGE_ROOT
    // - relative path (no leading slash) under PRIVATE_STORAGE_ROOT
    const cleaned = storageUri.replace(/^[\\/]+/, "");
    if (cleaned.includes("..")) {
      throw new BadRequestException("Invalid storage URI.");
    }

    const resolvedPath = path.resolve(root, cleaned);
    if (!resolvedPath.startsWith(root + path.sep) && resolvedPath !== root) {
      throw new BadRequestException("Storage URI outside allowed root.");
    }
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonical = await fs.realpath(resolvedPath).catch(() => null);
    if (!canonicalRoot || !canonical) throw new BadRequestException("Storage URI outside allowed root.");
    if (!canonical.startsWith(canonicalRoot + path.sep)) throw new BadRequestException("Storage URI outside allowed root.");
    const lst = await fs.lstat(canonical).catch(() => null);
    if (!lst || lst.isSymbolicLink()) throw new BadRequestException("Storage URI outside allowed root.");
    return { resolvedPath: canonical, relForDebug: cleaned };
  }

  private async writeAudit(args: {
    actorUserId?: string | null;
    eventType: string;
    level: "info" | "warn" | "error";
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const evt = this.auditEvents.create({
      actorUser: args.actorUserId ? ({ id: args.actorUserId } as any) : null,
      eventType: args.eventType,
      level: args.level,
      message: args.message ?? null,
      metadata: args.metadata ?? null
    });
    await this.auditEvents.save(evt);
  }

  private validateTypedActionParameters(actionType: string, parameters: Record<string, unknown>): void {
    if (actionType === "run_typecheck" || actionType === "run_lint") {
      if (Object.keys(parameters ?? {}).length > 0) {
        throw new BadRequestException(`${actionType} does not accept parameters.`);
      }
      return;
    }
    if (actionType !== "run_tests") return;
    if ("command" in parameters || "rawCommand" in parameters) {
      throw new BadRequestException("run_tests.command/rawCommand is not allowed. Use typed parameters only.");
    }
    const framework = parameters.framework == null ? "jest" : String(parameters.framework).trim().toLowerCase();
    const mode = parameters.mode == null ? "unit" : String(parameters.mode).trim().toLowerCase();
    const target = parameters.target == null ? "" : String(parameters.target).trim();
    const allowWatch = parameters.allowWatch;
    const updateSnapshots = parameters.updateSnapshots;
    if (!["jest", "vitest", "mocha", "playwright"].includes(framework)) {
      throw new BadRequestException("run_tests.framework must be one of jest, vitest, mocha, playwright.");
    }
    if (!["unit", "integration", "e2e"].includes(mode)) {
      throw new BadRequestException("run_tests.mode must be one of unit, integration, e2e.");
    }
    if (allowWatch !== undefined && allowWatch !== false) {
      throw new BadRequestException("run_tests.allowWatch must be false when provided.");
    }
    if (updateSnapshots !== undefined && updateSnapshots !== false) {
      throw new BadRequestException("run_tests.updateSnapshots must be false when provided.");
    }
    if (target && (!/^[a-zA-Z0-9._:@/\-]+$/.test(target) || target.includes("..") || target.startsWith("-"))) {
      throw new BadRequestException("run_tests.target contains invalid characters.");
    }
    const _typed: RunTestsTypedActionParameters = {
      framework: framework as RunTestsTypedActionParameters["framework"],
      mode: mode as RunTestsTypedActionParameters["mode"],
      target: target || undefined,
      allowWatch: false,
      updateSnapshots: false
    };
    void _typed;
  }

  async approveSandboxRun(args: { sandboxRunId: string; actorUserId: string; reason?: string }) {
    // Kill-switch enforcement: approvals are restricted mutation paths.
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_approval" });

    const run = await this.sandboxRuns.findOne({ where: { id: args.sandboxRunId }, relations: ["user"] });
    if (!run) throw new BadRequestException("Sandbox run not found.");
    if (run.status !== "approval_pending") throw new BadRequestException("Sandbox run is not awaiting approval.");

    run.status = "approved";
    await this.sandboxRuns.save(run);
    const binding = await this.runtimePolicy.resolveAndBindForRun({
      sandboxRun: run,
      bindingReason: "file_understand_creation",
      scopeHint: "workspace"
    });
    run.policyVersion = `${binding.policyDefinition.name}:v${binding.policyVersion.version}`;
    await this.sandboxRuns.save(run);

    // Best-effort job progress hint (if we can link it).
    const payload = run.inputPayload ?? {};
    const aiJobId = (payload as any).aiJobId as string | undefined;
    this.runtimeBus.publish({
      source: "sandbox",
      sandboxRunId: run.id,
      aiJobId: aiJobId ?? null,
      status: "approved",
      phase: "approval",
      message: "Sandbox run approved."
    });
    if (aiJobId) {
      const userId = run.user?.id;
      if (userId) {
        await this.aiJobs.update({ id: aiJobId }, { status: "running" as AiJobStatus, progress: 55 } as any);
        this.realtime.emitToUser(userId, "job:update", { aiJobId, status: "running", progress: 55 });
      }
    }

    await this.writeAudit({
      actorUserId: args.actorUserId,
      eventType: "sandbox_run_approved",
      level: "info",
      message: args.reason ?? "approved",
      metadata: { sandboxRunId: run.id, runType: run.runType }
    });

    return run;
  }

  async createFileUnderstandingSandboxRun(args: {
    userId: string;
    userRole?: GlobalRole;
    aiJobId: string;
    fileId: string;
    fileContextIds: string[];
    requiresApproval: boolean;
    /** Higher runs first in job-runner dispatch (default 50). */
    runPriority?: number;
  }): Promise<SandboxRunEntity> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_mutation" });

    const file = await this.files.findOne({ where: { id: args.fileId }, relations: ["user", "workspace"] });
    if (!file || file.user?.id !== args.userId) throw new BadRequestException("File not found or not owned by user.");

    const role = args.userRole ?? "user";
    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: role,
      workspaceId: file.workspace?.id ?? null,
      requiredPermissions: file.workspace ? ["workspace.files.read"] : []
    });

    const maxExtractBytes = Number(this.cfg.get<string>("SANDBOX_MAX_EXTRACT_BYTES") ?? "200000");
    const policyVersion = this.cfg.get<string>("SANDBOX_POLICY_VERSION") ?? "v1";

    const run = this.sandboxRuns.create({
      user: { id: args.userId } as any,
      workspace: file.workspace ? ({ id: file.workspace.id } as any) : null,
      runType: "file_understand_extract" as SandboxRunType,
      status: "staged" as SandboxRunStatus,
      runPriority: Math.max(0, Math.min(100, Number(args.runPriority ?? 50))),
      policyVersion,
      inputPayload: {
        runKind: "file_understand_extract",
        aiJobId: args.aiJobId,
        fileId: args.fileId,
        fileContextIds: args.fileContextIds,
        requiresApproval: args.requiresApproval,
        maxExtractBytes
      } satisfies FileUnderstandSandboxInput
    });

    await this.sandboxRuns.save(run);
    const binding = await this.runtimePolicy.resolveAndBindForRun({
      sandboxRun: run,
      bindingReason: "file_understand_creation",
      scopeHint: "workspace"
    });
    run.policyVersion = `${binding.policyDefinition.name}:v${binding.policyVersion.version}`;
    await this.sandboxRuns.save(run);

    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "sandbox_run_created",
      level: "info",
      message: "staged",
      metadata: { sandboxRunId: run.id, aiJobId: args.aiJobId, fileId: args.fileId }
    });

    return run;
  }

  async createOperatorTaskSandboxRun(args: {
    userId: string;
    userRole?: GlobalRole;
    workspaceId?: string | null;
    /** When set with workspaceId, replaces default ["workspace.sandbox.execute"]. */
    workspacePermissionKeys?: string[];
    aiJobId?: string | null;
    commands: Array<{ command: string; commandClass?: "read" | "analyze" | "execute" | "modify" | "system"; metadata?: Record<string, unknown> }>;
    typedActions?: OperatorTaskSandboxInput["typedActions"];
    requiresApproval: boolean;
    cciInlineExecution?: boolean;
  }): Promise<SandboxRunEntity> {
    if (args.commands.length > 0) {
      throw new BadRequestException("Raw command plans are disabled. Use typedActions only.");
    }
    const allowedActionTypes = new Set([
      "read_file",
      "write_file",
      "patch_file",
      "list_directory",
      "search_repo",
      "run_tests",
      "run_typecheck",
      "run_lint",
      "inspect_logs",
      "get_git_status",
      "get_git_diff"
    ]);
    for (const action of args.typedActions ?? []) {
      if (!allowedActionTypes.has(action.actionType)) {
        throw new BadRequestException(`Unsupported typed action: ${action.actionType}`);
      }
      this.validateTypedActionParameters(action.actionType, action.parameters ?? {});
    }
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_mutation" });
    const role = args.userRole ?? "user";
    const requiredWorkspacePerms =
      !args.workspaceId ? [] : args.workspacePermissionKeys?.length ? args.workspacePermissionKeys : ["workspace.sandbox.execute"];
    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: role,
      workspaceId: args.workspaceId ?? null,
      requiredPermissions: requiredWorkspacePerms
    });
    const policyVersion = this.cfg.get<string>("SANDBOX_POLICY_VERSION") ?? "v1";
    const run = this.sandboxRuns.create({
      user: { id: args.userId } as any,
      workspace: args.workspaceId ? ({ id: args.workspaceId } as any) : null,
      runType: "tool_exec" as SandboxRunType,
      status: "staged" as SandboxRunStatus,
      policyVersion,
      inputPayload: {
        runKind: "operator_task",
        aiJobId: args.aiJobId ?? null,
        commands: args.commands,
        typedActions: args.typedActions ?? [],
        requiresApproval: args.requiresApproval,
        ...(args.cciInlineExecution ? { cciInlineExecution: true } : {})
      } satisfies OperatorTaskSandboxInput
    });
    await this.sandboxRuns.save(run);
    const binding = await this.runtimePolicy.resolveAndBindForRun({
      sandboxRun: run,
      bindingReason: "operator_task_creation",
      scopeHint: "workspace"
    });
    run.policyVersion = `${binding.policyDefinition.name}:v${binding.policyVersion.version}`;
    await this.sandboxRuns.save(run);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "sandbox_operator_run_created",
      level: "info",
      message: "staged",
      metadata: { sandboxRunId: run.id, aiJobId: args.aiJobId, commandCount: args.commands.length, typedActionCount: args.typedActions?.length ?? 0 }
    });
    return run;
  }

  /**
   * Executes a single operator typed action synchronously for CCI validation.
   * Uses cciInlineExecution so the job-runner does not race on this run.
   */
  async runCciInlineOperatorValidationAction(args: {
    userId: string;
    userRole?: GlobalRole;
    workspaceId: string;
    typedAction: NonNullable<OperatorTaskSandboxInput["typedActions"]>[number];
  }): Promise<SandboxTypedActionEntity> {
    const run = await this.createOperatorTaskSandboxRun({
      userId: args.userId,
      userRole: args.userRole,
      workspaceId: args.workspaceId,
      aiJobId: null,
      commands: [],
      typedActions: [args.typedAction],
      requiresApproval: false,
      cciInlineExecution: true
    });
    await this.finishCciInlineSandboxRun(run.id);
    const actions = await this.sandboxTypedActions.find({
      where: { sandboxRun: { id: run.id } },
      order: { stepIndex: "ASC" }
    });
    const row = actions[0];
    if (!row) throw new BadRequestException("CCI inline sandbox produced no typed action rows.");
    return row;
  }

  private async finishCciInlineSandboxRun(sandboxRunId: string): Promise<void> {
    const toPending = await this.sandboxRuns.update({ id: sandboxRunId, status: "staged" as const }, { status: "validation_pending" as const } as any);
    if (!toPending.affected) {
      const r = await this.sandboxRuns.findOne({ where: { id: sandboxRunId } });
      throw new BadRequestException(`Expected staged sandbox run for CCI inline execution (got ${r?.status}).`);
    }
    await this.validateSandboxRunAfterClaim(sandboxRunId);
    const afterVal = await this.sandboxRuns.findOne({ where: { id: sandboxRunId } });
    if (afterVal?.status !== "approved") {
      throw new BadRequestException(
        `CCI inline sandbox did not reach approved after validation (status=${afterVal?.status ?? "missing"}).`
      );
    }
    const toExec = await this.sandboxRuns.update({ id: sandboxRunId, status: "approved" as const }, { status: "executing" as const } as any);
    if (toExec.affected) {
      await this.executeSandboxRunAfterClaim(sandboxRunId);
      return;
    }
    await this.waitForSandboxRunTerminal(sandboxRunId, 180_000);
  }

  private async waitForSandboxRunTerminal(sandboxRunId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await this.sandboxRuns.findOne({ where: { id: sandboxRunId } });
      const st = r?.status;
      if (st === "completed" || st === "failed" || st === "blocked" || st === "cancelled" || st === "validation_failed") return;
      await new Promise((res) => setTimeout(res, 200));
    }
    throw new BadRequestException(`Timeout waiting for sandbox run ${sandboxRunId} to finish.`);
  }

  async validateSandboxRunAfterClaim(sandboxRunId: string): Promise<void> {
    const run = await this.sandboxRuns.findOne({ where: { id: sandboxRunId }, relations: ["user"] });
    if (!run) return;
    if (run.status !== "validation_pending") return;

    const payload = (run.inputPayload ?? {}) as Partial<FileUnderstandSandboxInput> | Partial<OperatorTaskSandboxInput>;
    try {
      // Kill-switch gating: validation is a restricted execution path.
      await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_validation" });
      if (!payload.runKind) throw new BadRequestException("Missing runKind.");

      const userId = run.user?.id;
      if (!userId) throw new BadRequestException("Missing user association.");

      if (payload.runKind === "operator_task") {
        const cmds = payload.commands ?? [];
        const typedActions = payload.typedActions ?? [];
        if (cmds.length < 1 && typedActions.length < 1) throw new BadRequestException("No operator plan provided.");
        if (payload.requiresApproval) {
          run.status = "approval_pending";
          run.outputPayload = {
            runKind: "operator_task",
            logs: [`operator_commands=${cmds.length}`, `operator_typed_actions=${typedActions.length}`]
          } satisfies SandboxRunOutput;
          await this.sandboxRuns.save(run);
          this.runtimeBus.publish({
            source: "sandbox",
            sandboxRunId: run.id,
            aiJobId: payload.aiJobId ?? null,
            status: "approval_pending",
            phase: "validate",
            message: "Validation passed. Awaiting approval."
          });
          if (payload.aiJobId) {
            await this.aiJobs.update({ id: payload.aiJobId }, { status: "running", progress: 30 } as any);
            this.realtime.emitToUser(userId, "job:update", { aiJobId: payload.aiJobId, status: "running", progress: 30 });
          }
          return;
        }
        run.status = "approved";
        run.outputPayload = {
          runKind: "operator_task",
          logs: [`operator_commands=${cmds.length}`, `operator_typed_actions=${typedActions.length}`]
        } satisfies SandboxRunOutput;
        await this.sandboxRuns.save(run);
        this.runtimeBus.publish({
          source: "sandbox",
          sandboxRunId: run.id,
          aiJobId: payload.aiJobId ?? null,
          status: "approved",
          phase: "validate",
          message: "Validation approved."
        });
        return;
      }

      if (payload.runKind !== "file_understand_extract") throw new BadRequestException("Unsupported runKind.");

      const maxExtractBytes = payload.maxExtractBytes ?? 200000;
      if (!payload.fileId) throw new BadRequestException("Missing fileId in sandbox input.");

      const file = await this.files.findOne({ where: { id: payload.fileId }, relations: ["user"] });
      if (!file || file.user?.id !== userId) throw new BadRequestException("File not found or not owned by user.");

      const contextIds = payload.fileContextIds ?? [];
      if (contextIds.length > 0) {
        const owned = await this.fileContexts.count({
          where: { id: In(contextIds), user: { id: userId }, file: { id: payload.fileId } }
        });
        if (owned !== contextIds.length) throw new BadRequestException("File context ownership check failed.");
      }

      // Storage URI validation: enforce private root confinement up front.
      const resolved = await this.resolvePrivateStoragePath(file.storageUri);

      const logLines: string[] = [];
      logLines.push(`validated storage path: ${resolved.relForDebug}`);
      logLines.push(`maxExtractBytes=${maxExtractBytes}`);

      if (payload.requiresApproval) {
        run.status = "approval_pending";
        run.outputPayload = { runKind: "file_understand_extract", logs: logLines } satisfies SandboxRunOutput;
        await this.sandboxRuns.save(run);

        if (payload.aiJobId) {
          await this.aiJobs.update({ id: payload.aiJobId }, { status: "running", progress: 30 } as any);
          this.realtime.emitToUser(userId, "job:update", { aiJobId: payload.aiJobId, status: "running", progress: 30 });
        }

        await this.writeAudit({
          actorUserId: userId,
          eventType: "sandbox_run_validation_passed_requires_approval",
          level: "warn",
          message: "awaiting approval",
          metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId ?? null, fileId: file.id }
        });

        return;
      }

      run.status = "approved";
      run.outputPayload = { runKind: "file_understand_extract", logs: logLines } satisfies SandboxRunOutput;
      await this.sandboxRuns.save(run);
      this.runtimeBus.publish({
        source: "sandbox",
        sandboxRunId: run.id,
        aiJobId: payload.aiJobId ?? null,
        status: "approved",
        phase: "validate",
        message: "Validation approved."
      });

      await this.writeAudit({
        actorUserId: userId,
        eventType: "sandbox_run_validation_passed",
        level: "info",
        message: "approved",
        metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId ?? null, fileId: file.id }
      });
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;

      const errMsg = e instanceof Error ? e.message : String(e);
      const userId = run.user?.id;

      run.status = "validation_failed";
      run.finishedAt = new Date();
      run.outputPayload = { runKind: "file_understand_extract", logs: [`validation_error: ${errMsg}`] } satisfies SandboxRunOutput;
      await this.sandboxRuns.save(run);
      this.runtimeBus.publish({
        source: "sandbox",
        sandboxRunId: run.id,
        aiJobId: payload.aiJobId ?? null,
        status: "validation_failed",
        phase: "validate",
        message: errMsg
      });

      if (userId && payload.aiJobId) {
        await this.aiJobs.update(
          { id: payload.aiJobId },
          { status: "failed" as AiJobStatus, progress: 100, errorMessage: errMsg, finishedAt: new Date() } as any
        );
        this.realtime.emitToUser(userId, "job:update", { aiJobId: payload.aiJobId, status: "failed", progress: 100 });
      }

      if (userId) {
        await this.writeAudit({
          actorUserId: userId,
          eventType: "sandbox_run_validation_failed",
          level: "error",
          message: errMsg,
          metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId ?? null }
        });
      }

      this.logger.warn(`Sandbox validation failed: ${errMsg}`);
    }
  }

  async executeSandboxRunAfterClaim(sandboxRunId: string): Promise<void> {
    const run = await this.sandboxRuns.findOne({ where: { id: sandboxRunId }, relations: ["user"] });
    if (!run) return;
    if (run.status === "paused_approval_required" || run.status === "blocked" || run.status === "cancelled") return;
    if (run.status !== "executing") return;
    this.runtimeBus.publish({
      source: "sandbox",
      sandboxRunId: run.id,
      aiJobId: (run.inputPayload as any)?.aiJobId ?? null,
      status: "executing",
      phase: "execute",
      message: "Execution started."
    });

    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_execution" });

    const payload = (run.inputPayload ?? {}) as FileUnderstandSandboxInput | OperatorTaskSandboxInput;
    if (payload.runKind !== "file_understand_extract" && payload.runKind !== "operator_task") {
      throw new BadRequestException("Unsupported runKind.");
    }

    const userId = run.user?.id;
    if (!userId) throw new ServiceUnavailableException("Sandbox run missing user.");

    const logLines: string[] = [];
    const t0 = Date.now();
    const runTypeLabel = run.runType;

    try {
      if (payload.runKind === "operator_task") {
        const runtimePlan = await this.operatorRuntime.runPlan({
          sandboxRun: run,
          userId,
          commands: payload.commands,
          typedActions: payload.typedActions ?? [],
          skipPatchCapture: Boolean((payload as OperatorTaskSandboxInput).cciInlineExecution)
        });
        const refreshedRun = await this.sandboxRuns.findOne({ where: { id: run.id } });
        if (refreshedRun?.status === "paused_approval_required") {
          return;
        }
        const failed = runtimePlan.executed.find((x) => x.status !== "completed");
        if (failed) throw new BadRequestException(`Operator task failed at step ${failed.stepIndex}`);

        run.status = "completed";
        run.outputPayload = {
          runKind: "operator_task",
          logs: [`operator_task_completed`, `commands=${runtimePlan.executed.length}`],
          runtime: {
            executedCount: runtimePlan.executed.length,
            typedActionCount: runtimePlan.typedExecuted.length,
            failedStep: null,
            patchProposalId: runtimePlan.patch?.id ?? null
          }
        } satisfies SandboxRunOutput;
        run.finishedAt = new Date();
        await this.sandboxRuns.save(run);
        this.runtimeBus.publish({
          source: "sandbox",
          sandboxRunId: run.id,
          aiJobId: payload.aiJobId ?? null,
          status: "completed",
          phase: "execute",
          message: "Operator task completed."
        });

        if (payload.aiJobId) {
          await this.aiJobs.update(
            { id: payload.aiJobId },
            {
              status: "completed" as AiJobStatus,
              progress: 100,
              finishedAt: new Date(),
              resultReply: `Operator runtime executed ${runtimePlan.typedExecuted.length} typed actions and ${runtimePlan.executed.length} command steps.`,
              resultMeta: {
                runtimePlan: {
                  typedActionCount: runtimePlan.typedExecuted.length,
                  executedCount: runtimePlan.executed.length,
                  patchProposalId: runtimePlan.patch?.id ?? null
                }
              }
            } as any
          );
          this.realtime.emitToUser(userId, "job:update", { aiJobId: payload.aiJobId, status: "completed", progress: 100 });
        }
        await this.writeAudit({
          actorUserId: userId,
          eventType: "sandbox_operator_task_completed",
          level: "info",
          metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId, commandCount: runtimePlan.executed.length }
        });
        void this.reflection.logSandboxReflection({
          userId,
          correlationId: run.id,
          taskType: "sandbox_operator_task",
          success: true,
          latencyMs: Math.max(0, (run.finishedAt?.getTime() ?? Date.now()) - run.createdAt.getTime()),
          errorClass: null,
          summary: `operator_task ok commands=${runtimePlan.executed.length} typed=${runtimePlan.typedExecuted.length}`,
          metadata: { aiJobId: payload.aiJobId ?? null, patchProposalId: runtimePlan.patch?.id ?? null }
        });
        return;
      }

      const file = await this.files.findOne({ where: { id: payload.fileId }, relations: ["user"] });
      if (!file || file.user?.id !== userId) throw new BadRequestException("File not found or not owned by user.");

      const { resolvedPath } = await this.resolvePrivateStoragePath(file.storageUri);

      logLines.push("runtime_steps=0");

      const extraction = await this.extractFileUnderstanding({
        file,
        maxExtractBytes: payload.maxExtractBytes,
        resolvedPath
      });
      logLines.push("extraction_completed");

      const output: SandboxRunOutput = {
        runKind: "file_understand_extract",
        extraction,
        logs: logLines
      };

      run.status = "completed";
      run.outputPayload = output;
      run.finishedAt = new Date();
      await this.sandboxRuns.save(run);
      this.runtimeBus.publish({
        source: "sandbox",
        sandboxRunId: run.id,
        aiJobId: payload.aiJobId ?? null,
        status: "completed",
        phase: "execute",
        message: "Sandbox extraction completed."
      });

      // Persist file understanding onto file metadata + contexts.
      await this.files.update(
        { id: file.id },
        {
          metadata: {
            ...(file.metadata ?? {}),
            extracted: {
              fileKind: extraction.fileKind,
              originalName: extraction.originalName,
              extractedTextPresent: Boolean(extraction.extractedText),
              notes: extraction.notes ?? []
            }
          }
        } as any
      );

      if (payload.fileContextIds.length > 0) {
        for (const id of payload.fileContextIds) {
          await this.fileContexts.update(
            { id },
            { metadata: { extracted: extraction } } as any
          );
        }
      }

      if (extraction.extractedText && extraction.extractedText.length > 0) {
        await this.persistChunkEmbeddingIndex({
          userId,
          fileId: file.id,
          extractedText: extraction.extractedText
        });
      }

      // Update ai_job lifecycle + auditable Beast writes.
      const aiJob = await this.aiJobs.findOne({ where: { id: payload.aiJobId }, relations: ["user"] });
      if (!aiJob || aiJob.user?.id !== userId) {
        // If linkage is gone, still finish the sandbox run.
        await this.writeAudit({
          actorUserId: userId,
          eventType: "sandbox_run_completed_ai_job_missing",
          level: "warn",
          message: "ai_job not found for linkage",
          metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId }
        });
        return;
      }

      aiJob.status = "completed";
      aiJob.progress = 100;
      aiJob.finishedAt = new Date();
      aiJob.resultReply = this.buildResultReply(extraction);
      aiJob.resultMeta = { extraction };
      aiJob.errorMessage = null;
      aiJob.beastLevel = "Smart";
      await this.aiJobs.save(aiJob);

      const beastLog = this.beastLogs.create({
        user: { id: userId } as any,
        aiJob: aiJob,
        eventType: "inference",
        payload: { sandboxRunId: run.id, extraction }
      });
      await this.beastLogs.save(beastLog);

      const suggestion = this.suggestions.create({
        user: { id: userId } as any,
        aiJob,
        suggestionType: "next_step",
        riskLevel: "low",
        status: "active",
        content: `File understanding complete for “${extraction.originalName}”.`,
        metadata: { fileKind: extraction.fileKind }
      });
      await this.suggestions.save(suggestion);

      this.realtime.emitToUser(userId, "job:update", { aiJobId: aiJob.id, status: aiJob.status, progress: aiJob.progress });

      await this.writeAudit({
        actorUserId: userId,
        eventType: "sandbox_run_completed",
        level: "info",
        message: "file_understand_extract completed",
        metadata: { sandboxRunId: run.id, aiJobId: aiJob.id, fileId: file.id }
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logLines.push(`execution_error: ${errMsg}`);

      run.status = "failed";
      run.outputPayload = { runKind: "file_understand_extract", logs: logLines } satisfies SandboxRunOutput;
      run.finishedAt = new Date();
      await this.sandboxRuns.save(run);
      this.runtimeBus.publish({
        source: "sandbox",
        sandboxRunId: run.id,
        aiJobId: payload.aiJobId ?? null,
        status: "failed",
        phase: "execute",
        message: errMsg
      });

      if (payload.aiJobId) {
        await this.aiJobs.update({ id: payload.aiJobId }, { status: "failed" as AiJobStatus, progress: 100, errorMessage: errMsg, finishedAt: new Date() } as any);

        this.realtime.emitToUser(userId, "job:update", { aiJobId: payload.aiJobId, status: "failed", progress: 100 });
      }

      await this.writeAudit({
        actorUserId: userId,
        eventType: "sandbox_run_failed",
        level: "error",
        message: errMsg,
        metadata: { sandboxRunId: run.id, aiJobId: payload.aiJobId ?? null }
      });

      this.logger.warn(`Sandbox execution failed: ${errMsg}`);
    } finally {
      const refreshed = await this.sandboxRuns.findOne({ where: { id: run.id } });
      const terminal = refreshed?.status ?? run.status;
      this.observability.observeSandboxRun(runTypeLabel, terminal, Date.now() - t0);
    }
  }

  async listApprovalRequests(args: { sandboxRunId?: string; status?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, args.pageSize ?? 20));
    const qb = this.approvals
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.sandboxRun", "run")
      .leftJoinAndSelect("a.sandboxCommandRecord", "cmd")
      .leftJoinAndSelect("a.sandboxPolicyDecision", "pd")
      .leftJoinAndSelect("a.user", "u")
      .orderBy("a.requestedAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (args.sandboxRunId) qb.andWhere("run.id = :sandboxRunId", { sandboxRunId: args.sandboxRunId });
    if (args.status) qb.andWhere("a.status = :status", { status: args.status });
    if (args.from) qb.andWhere("a.requestedAt >= :from", { from: new Date(args.from) });
    if (args.to) qb.andWhere("a.requestedAt <= :to", { to: new Date(args.to) });
    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, page, pageSize };
  }

  async getApprovalRequest(id: string) {
    return this.approvals.findOne({
      where: { id },
      relations: ["sandboxRun", "sandboxCommandRecord", "sandboxPolicyDecision", "user"]
    });
  }

  async approveRequest(args: { approvalRequestId: string; adminUserId: string; note?: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_approval_action" });
    const req = await this.approvals.findOne({
      where: { id: args.approvalRequestId },
      relations: ["sandboxRun", "sandboxRun.user", "sandboxCommandRecord", "sandboxPolicyDecision"]
    });
    if (!req) throw new BadRequestException("Approval request not found.");
    if (req.status !== "pending") throw new BadRequestException("Approval request is not pending.");
    const run = req.sandboxRun;
    if (!run || run.status !== "paused_approval_required") throw new BadRequestException("Sandbox run is not paused for approval.");

    req.status = "approved";
    req.resolvedAt = new Date();
    req.resolvedBy = args.adminUserId;
    req.resolutionNote = args.note ?? null;
    await this.approvals.save(req);

    const input = (run.inputPayload ?? {}) as any;
    const aiJobId = input.aiJobId as string | undefined;
    run.status = "executing";
    run.outputPayload = {
      ...(run.outputPayload ?? {}),
      runtimeState: {
        ...(run.outputPayload as any)?.runtimeState,
        approvalResolvedAt: Date.now(),
        approvedRequestId: req.id
      }
    } as any;
    await this.sandboxRuns.save(run);

    if (aiJobId) {
      await this.aiJobs.update({ id: aiJobId }, { status: "running", progress: 50 } as any);
      this.realtime.emitToUser(run.user.id, "job:update", { aiJobId, status: "running", progress: 50 });
    }

    this.realtime.emitToUser(run.user.id, "sandbox:approval_resolved", {
      sandboxRunId: run.id,
      approvalRequestId: req.id,
      status: "approved"
    });
    this.realtime.emitToUser(run.user.id, "sandbox:run_resumed", {
      sandboxRunId: run.id
    });

    await this.executeSandboxRunAfterClaim(run.id);
    return req;
  }

  async rejectRequest(args: { approvalRequestId: string; adminUserId: string; note?: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_approval_action" });
    const req = await this.approvals.findOne({
      where: { id: args.approvalRequestId },
      relations: ["sandboxRun", "sandboxRun.user"]
    });
    if (!req) throw new BadRequestException("Approval request not found.");
    if (req.status !== "pending") throw new BadRequestException("Approval request is not pending.");
    const run = req.sandboxRun;
    if (!run) throw new BadRequestException("Sandbox run missing.");

    req.status = "rejected";
    req.resolvedAt = new Date();
    req.resolvedBy = args.adminUserId;
    req.resolutionNote = args.note ?? null;
    await this.approvals.save(req);

    run.status = "blocked";
    run.finishedAt = new Date();
    await this.sandboxRuns.save(run);

    const input = (run.inputPayload ?? {}) as any;
    const aiJobId = input.aiJobId as string | undefined;
    if (aiJobId) {
      await this.aiJobs.update(
        { id: aiJobId },
        { status: "failed" as AiJobStatus, progress: 100, errorMessage: "Rejected by admin approval control plane", finishedAt: new Date() } as any
      );
      this.realtime.emitToUser(run.user.id, "job:update", { aiJobId, status: "failed", progress: 100 });
    }

    this.realtime.emitToUser(run.user.id, "sandbox:approval_resolved", {
      sandboxRunId: run.id,
      approvalRequestId: req.id,
      status: "rejected"
    });
    this.realtime.emitToUser(run.user.id, "sandbox:run_blocked", {
      sandboxRunId: run.id
    });

    return req;
  }

  async listPolicyDecisions(filters: {
    sandboxRunId?: string;
    decision?: string;
    riskLevel?: string;
    commandClass?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
    const qb = this.commandPolicyDecisions
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.sandboxCommandRecord", "cmd")
      .leftJoinAndSelect("d.sandboxRun", "run")
      .leftJoinAndSelect("d.policyVersion", "pv")
      .orderBy("d.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filters.sandboxRunId) qb.andWhere("run.id = :rid", { rid: filters.sandboxRunId });
    if (filters.decision) qb.andWhere("d.decision = :decision", { decision: filters.decision });
    if (filters.riskLevel) qb.andWhere("d.risk_level = :risk", { risk: filters.riskLevel });
    if (filters.commandClass) qb.andWhere("cmd.command_class = :cc", { cc: filters.commandClass });
    if (filters.userId) qb.andWhere("run.user_id = :uid", { uid: filters.userId });
    if (filters.from) qb.andWhere("d.created_at >= :from", { from: new Date(filters.from) });
    if (filters.to) qb.andWhere("d.created_at <= :to", { to: new Date(filters.to) });
    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, page, pageSize };
  }

  async getPolicyDecision(id: string) {
    return this.commandPolicyDecisions.findOne({
      where: { id },
      relations: ["sandboxCommandRecord", "sandboxRun", "policyVersion"]
    });
  }

  async listPatchProposals(args: {
    sandboxRunId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    userId?: string;
  }) {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, args.pageSize ?? 20));
    const qb = this.patchProposals
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.sandboxRun", "run")
      .leftJoinAndSelect("p.user", "u")
      .orderBy("p.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (args.sandboxRunId) qb.andWhere("run.id = :sandboxRunId", { sandboxRunId: args.sandboxRunId });
    if (args.status) qb.andWhere("p.status = :status", { status: args.status });
    if (args.from) qb.andWhere("p.createdAt >= :from", { from: new Date(args.from) });
    if (args.to) qb.andWhere("p.createdAt <= :to", { to: new Date(args.to) });
    if (args.userId) qb.andWhere("u.id = :userId", { userId: args.userId });
    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, page, pageSize };
  }

  async getPatchProposal(id: string) {
    return this.patchProposals.findOne({
      where: { id },
      relations: ["sandboxRun", "user"]
    });
  }

  private operatorWorkspaceRoot() {
    return this.cfg.get<string>("OPERATOR_WORKSPACE_ROOT") ?? process.cwd();
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

  async applyPatchProposal(args: { patchProposalId: string; adminUserId: string; note?: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "sandbox_patch_apply" });
    const patch = await this.patchProposals.findOne({ where: { id: args.patchProposalId }, relations: ["sandboxRun", "sandboxRun.user"] });
    if (!patch) throw new BadRequestException("Patch proposal not found.");
    if (!(patch.status === "pending" || patch.status === "approved")) throw new BadRequestException("Patch proposal not in applyable state.");

    patch.status = "approved";
    patch.reviewedBy = args.adminUserId;
    patch.reviewedAt = new Date();
    patch.reviewNote = args.note ?? null;
    await this.patchProposals.save(patch);

    const workspace = this.operatorWorkspaceRoot();
    const tmpFile = path.resolve(workspace, `.malv_patch_${patch.id}.diff`);
    await fs.writeFile(tmpFile, patch.diffText, "utf8");
    try {
    const check = await this.runGit(["apply", "--check", tmpFile], workspace);
    if (check.code !== 0) {
      patch.status = "apply_failed";
      patch.applyError = (check.stderr || check.stdout || "git apply --check failed").slice(0, 8000);
      await this.patchProposals.save(patch);
      this.realtime.emitToUser((patch.sandboxRun as any).user?.id ?? "", "sandbox:patch_apply_failed", {
        patchProposalId: patch.id,
        sandboxRunId: patch.sandboxRun.id,
        error: patch.applyError
      });
      return patch;
    }

    const apply = await this.runGit(["apply", tmpFile], workspace);
    if (apply.code !== 0) {
      patch.status = "apply_failed";
      patch.applyError = (apply.stderr || apply.stdout || "git apply failed").slice(0, 8000);
      await this.patchProposals.save(patch);
      this.realtime.emitToUser((patch.sandboxRun as any).user?.id ?? "", "sandbox:patch_apply_failed", {
        patchProposalId: patch.id,
        sandboxRunId: patch.sandboxRun.id,
        error: patch.applyError
      });
      return patch;
    }

    patch.status = "applied";
    patch.appliedAt = new Date();
    patch.applyError = null;
    await this.patchProposals.save(patch);
    this.realtime.emitToUser((patch.sandboxRun as any).user?.id ?? "", "sandbox:patch_applied", {
      patchProposalId: patch.id,
      sandboxRunId: patch.sandboxRun.id
    });
    return patch;
    } finally {
      await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    }
  }

  async rejectPatchProposal(args: { patchProposalId: string; adminUserId: string; note?: string }) {
    const patch = await this.patchProposals.findOne({ where: { id: args.patchProposalId }, relations: ["sandboxRun", "sandboxRun.user"] });
    if (!patch) throw new BadRequestException("Patch proposal not found.");
    if (!(patch.status === "pending" || patch.status === "approved")) throw new BadRequestException("Patch proposal not in rejectable state.");
    patch.status = "rejected";
    patch.reviewedBy = args.adminUserId;
    patch.reviewedAt = new Date();
    patch.reviewNote = args.note ?? null;
    await this.patchProposals.save(patch);
    this.realtime.emitToUser((patch.sandboxRun as any).user?.id ?? "", "sandbox:patch_rejected", {
      patchProposalId: patch.id,
      sandboxRunId: patch.sandboxRun.id
    });
    return patch;
  }

  private buildResultReply(extraction: FileUnderstandExtraction): string {
    const preview = extraction.extractedPreview ?? extraction.extractedText?.slice(0, 240) ?? "";
    if (!preview) return "File understanding complete. No text extracted for this file type.";
    return `File understanding complete. Preview:\n\n${preview}`.trim();
  }

  private embeddingModel() {
    return this.cfg.get<string>("EMBEDDING_MODEL") ?? "malv-local-charhist-v1";
  }

  private localEmbedding(text: string): number[] {
    // Deterministic local/private embedding for immediate retrieval support.
    // This is intentionally model-pluggable via EMBEDDING_MODEL in future worker upgrades.
    const v = new Array<number>(64).fill(0);
    const t = text.slice(0, 4000);
    for (let i = 0; i < t.length; i++) {
      const code = t.charCodeAt(i);
      v[code % 64] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }

  private chunkText(text: string): string[] {
    const chunkSize = Number(this.cfg.get<string>("FILE_CHUNK_SIZE_CHARS") ?? "1200");
    const overlap = Number(this.cfg.get<string>("FILE_CHUNK_OVERLAP_CHARS") ?? "200");
    const safeChunk = Math.max(300, chunkSize);
    const safeOverlap = Math.max(0, Math.min(safeChunk - 50, overlap));
    const out: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + safeChunk);
      out.push(text.slice(start, end));
      if (end >= text.length) break;
      start = end - safeOverlap;
    }
    return out;
  }

  private async persistChunkEmbeddingIndex(args: { userId: string; fileId: string; extractedText: string }) {
    await this.fileChunks.softDelete({ file: { id: args.fileId } as any } as any);
    await this.fileEmbeddings.softDelete({ file: { id: args.fileId } as any } as any);

    const chunks = this.chunkText(args.extractedText);
    const model = this.embeddingModel();
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const chunk = this.fileChunks.create({
        user: { id: args.userId } as any,
        file: { id: args.fileId } as any,
        chunkIndex: i,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
        metadata: { strategy: "char_window", chunkSizeChars: content.length }
      });
      await this.fileChunks.save(chunk);

      const emb = this.fileEmbeddings.create({
        user: { id: args.userId } as any,
        file: { id: args.fileId } as any,
        fileChunk: chunk,
        embeddingModel: model,
        embeddingVector: this.localEmbedding(content),
        metadata: { dims: 64 }
      });
      await this.fileEmbeddings.save(emb);
    }
  }

  private async extractFileUnderstanding(args: {
    file: FileEntity;
    maxExtractBytes: number;
    resolvedPath: string;
  }): Promise<FileUnderstandExtraction> {
    const notes: string[] = [];

    const fileKind = args.file.fileKind;
    const base: FileUnderstandExtraction = {
      fileId: args.file.id,
      fileKind,
      mimeType: args.file.mimeType ?? null,
      originalName: args.file.originalName,
      sizeBytes: args.file.sizeBytes ?? null,
      extractedText: null,
      extractedPreview: null,
      notes
    };

    // Policy: only perform deterministic local extraction. No network calls.
    // Hooks for later multimodal/PDF/audio/video processing are intentionally stubbed.
    const maxBytes = Math.max(0, args.maxExtractBytes);

    if (fileKind === "text" || fileKind === "doc") {
      const buf = await fs.readFile(args.resolvedPath).catch((e) => {
        throw new BadRequestException(`Cannot read file: ${e instanceof Error ? e.message : String(e)}`);
      });

      const truncated = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
      const text = truncated.toString("utf8");
      const normalized = text.replace(/\r\n/g, "\n");

      base.extractedText = normalized;
      base.extractedPreview = normalized.slice(0, Math.min(800, normalized.length));
      if (buf.length > maxBytes) notes.push(`text_truncated_to_${maxBytes}_bytes`);
      return base;
    }

    if (fileKind === "pdf") {
      notes.push("pdf_extraction_hook_not_implemented");
      return base;
    }

    if (fileKind === "image") {
      notes.push("image_ocr_hook_not_implemented");
      return base;
    }

    if (fileKind === "audio") {
      notes.push("audio_transcription_hook_not_implemented");
      return base;
    }

    if (fileKind === "video") {
      notes.push("video_frame_hook_not_implemented");
      return base;
    }

    notes.push("unsupported_file_kind");
    return base;
  }
}


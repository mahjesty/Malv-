import { BadRequestException, forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import path from "path";
import os from "os";
import fs from "fs/promises";

import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { RuntimePolicyService } from "./runtime-policy.service";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { SandboxTypedActionEntity, type SandboxTypedActionType } from "../db/entities/sandbox-typed-action.entity";
import { SandboxIsolationProvider } from "./sandbox-isolation.provider";

type RuntimeCommand = { command: string };
type RunTestsFramework = "jest" | "vitest" | "mocha" | "playwright";
type RunTestsMode = "unit" | "integration" | "e2e";
type RunTestsParams = {
  framework?: RunTestsFramework;
  mode?: RunTestsMode;
  target?: string;
  allowWatch?: false;
  updateSnapshots?: false;
};

type RuntimeTypedAction = {
  actionType: SandboxTypedActionType;
  parameters: Record<string, unknown>;
  scopeType?: "workspace" | "file" | "symbol" | "directory" | "repo" | "multi_file";
  scopeRef?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class OperatorRuntimeService {
  private readonly logger = new Logger(OperatorRuntimeService.name);
  constructor(
    private readonly cfg: ConfigService,
    _killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) _realtime: RealtimeGateway,
    private readonly runtimePolicy: RuntimePolicyService,
    @InjectRepository(AiJobEntity) _aiJobs: Repository<AiJobEntity>,
    @InjectRepository(SandboxRunEntity) private readonly sandboxRuns: Repository<SandboxRunEntity>,
    @InjectRepository(SandboxCommandRecordEntity) private readonly commandRecords: Repository<SandboxCommandRecordEntity>,
    @InjectRepository(SandboxTypedActionEntity) private readonly typedActions: Repository<SandboxTypedActionEntity>,
    @InjectRepository(SandboxPatchProposalEntity) private readonly patches: Repository<SandboxPatchProposalEntity>,
    @InjectRepository(SandboxApprovalRequestEntity) private readonly approvals: Repository<SandboxApprovalRequestEntity>,
    private readonly isolationProvider: SandboxIsolationProvider
  ) {}

  private workspaceRoot() {
    return this.cfg.get<string>("OPERATOR_WORKSPACE_ROOT") ?? process.cwd();
  }

  private tempRoot() {
    return this.cfg.get<string>("OPERATOR_TMP_ROOT") ?? path.join(os.tmpdir(), "malv-operator");
  }

  private async resolveWithinAllowedRoot(candidate: string) {
    const workspace = await fs.realpath(path.resolve(this.workspaceRoot())).catch(() => null);
    const temp = await fs.realpath(path.resolve(this.tempRoot())).catch(() => null);
    const p = await fs.realpath(path.resolve(candidate)).catch(() => null);
    if (!p) return false;
    const inWorkspace = Boolean(workspace && (p === workspace || p.startsWith(workspace + path.sep)));
    const inTemp = Boolean(temp && (p === temp || p.startsWith(temp + path.sep)));
    return inWorkspace || inTemp;
  }

  private asString(v: unknown, max = 2000): string {
    return String(v ?? "")
      .trim()
      .slice(0, max);
  }

  private async resolveTargetPath(input: string): Promise<string> {
    const workspace = path.resolve(this.workspaceRoot());
    const candidate = path.isAbsolute(input) ? input : path.resolve(workspace, input);
    const canonical = await fs.realpath(candidate).catch(() => null);
    if (!canonical || !(await this.resolveWithinAllowedRoot(canonical))) throw new BadRequestException("Path outside workspace confinement.");
    const lst = await fs.lstat(canonical).catch(() => null);
    if (!lst || lst.isSymbolicLink()) throw new BadRequestException("Path outside workspace confinement.");
    return canonical;
  }

  private sandboxTimeoutMs(): number {
    return Number(this.cfg.get<string>("OPERATOR_CMD_TIMEOUT_MS") ?? "120000");
  }

  private parseRunTestsParams(parameters: Record<string, unknown>): RunTestsParams {
    const framework = parameters.framework == null ? "jest" : String(parameters.framework).trim().toLowerCase();
    const mode = parameters.mode == null ? "unit" : String(parameters.mode).trim().toLowerCase();
    const target = parameters.target == null ? "" : this.asString(parameters.target, 240);
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
    return {
      framework: framework as RunTestsFramework,
      mode: mode as RunTestsMode,
      target: target || undefined,
      allowWatch: false,
      updateSnapshots: false
    };
  }

  private resolveTestCommand(params: RunTestsParams): { file: string; args: string[] } {
    const framework = params.framework ?? "jest";
    const mode = params.mode ?? "unit";
    const args: string[] = [];
    if (framework === "jest") {
      args.push("--ci", "--runInBand", "--watchAll=false", "--passWithNoTests");
      if (params.target) args.push(params.target);
      return { file: "jest", args };
    }
    if (framework === "vitest") {
      args.push("run", "--watch=false");
      if (params.target) args.push(params.target);
      return { file: "vitest", args };
    }
    if (framework === "mocha") {
      args.push("--forbid-only");
      if (params.target) args.push(params.target);
      return { file: "mocha", args };
    }
    args.push("test");
    if (mode === "e2e") args.push("--reporter=line");
    if (params.target?.startsWith("project:")) {
      args.push("--project", params.target.replace(/^project:/, ""));
    } else if (params.target) {
      args.push(params.target);
    }
    return { file: "playwright", args };
  }

  private inProcessIsolationMeta(actionType: SandboxTypedActionType) {
    return {
      provider: "in_process_guarded",
      enforcementClass: "best_effort" as const,
      networkPolicyRequested: "deny" as const,
      networkPolicyActual: "in_process_no_spawn",
      workspaceRoot: this.workspaceRoot(),
      executable: actionType,
      timeoutMs: 0,
      timeoutTriggered: false,
      outputCapTriggered: false,
      cleanupStatus: "ok" as const
    };
  }

  private async runTypedActionStep(args: { sandboxRun: SandboxRunEntity; userId: string; stepIndex: number; action: RuntimeTypedAction }) {
    const rec = await this.typedActions.save(
      this.typedActions.create({
        sandboxRun: args.sandboxRun,
        user: { id: args.userId } as any,
        stepIndex: args.stepIndex,
        actionType: args.action.actionType,
        scopeType: args.action.scopeType ?? "workspace",
        scopeRef: args.action.scopeRef ?? null,
        parametersJson: args.action.parameters,
        status: "queued"
      })
    );
    const startedAt = new Date();
    rec.startedAt = startedAt;
    rec.status = "running";
    await this.typedActions.save(rec);
    const policyEval = await this.runtimePolicy.evaluateTypedAction({
      sandboxRunId: args.sandboxRun.id,
      actionType: args.action.actionType,
      parameters: args.action.parameters
    });
    rec.normalizedParametersJson = policyEval.normalizedParameters;
    const policyDecision = await this.runtimePolicy.persistTypedActionDecision({
      sandboxTypedAction: rec,
      sandboxRunId: args.sandboxRun.id,
      policyVersionId: policyEval.policyVersionId,
      requestedActionType: args.action.actionType,
      requestedParameters: args.action.parameters,
      normalizedParameters: policyEval.normalizedParameters,
      actionCategory: policyEval.actionCategory,
      riskLevel: policyEval.riskLevel,
      decision: policyEval.decision,
      decisionReason: policyEval.reason,
      matchedRuleId: policyEval.matchedRuleId,
      rewrittenParameters: policyEval.rewrittenParameters ?? null
    });
    if (policyEval.decision === "deny") {
      this.logger.warn(`typed_action_denied action=${args.action.actionType} run=${args.sandboxRun.id}`);
      rec.status = "blocked";
      rec.outputSummary = `Blocked by policy: ${policyEval.reason}`;
      rec.outputMeta = { policyDecisionId: policyDecision.id, isolation: this.inProcessIsolationMeta(args.action.actionType) };
      rec.finishedAt = new Date();
      await this.typedActions.save(rec);
      return { action: rec, command: null as SandboxCommandRecordEntity | null };
    }
    if (policyEval.decision === "require_approval") {
      this.logger.warn(`typed_action_requires_approval action=${args.action.actionType} run=${args.sandboxRun.id}`);
      rec.status = "approval_required";
      rec.outputSummary = policyEval.reason;
      rec.outputMeta = { policyDecisionId: policyDecision.id, requiresApproval: true, isolation: this.inProcessIsolationMeta(args.action.actionType) };
      rec.finishedAt = new Date();
      await this.typedActions.save(rec);
      const pseudoCommand = await this.commandRecords.save(
        this.commandRecords.create({
          sandboxRun: args.sandboxRun,
          user: { id: args.userId } as any,
          stepIndex: args.stepIndex,
          commandClass: "modify",
          commandText: `typed_action:${args.action.actionType}`,
          status: "blocked",
          metadata: { typedActionId: rec.id }
        })
      );
      const pseudoDecision = await this.runtimePolicy.persistDecision({
        sandboxCommandRecord: pseudoCommand,
        sandboxRunId: args.sandboxRun.id,
        policyVersionId: policyEval.policyVersionId,
        requestedCommand: pseudoCommand.commandText,
        normalizedCommand: pseudoCommand.commandText,
        commandCategory: policyEval.actionCategory,
        riskLevel: policyEval.riskLevel,
        decision: "require_approval",
        decisionReason: policyEval.reason,
        matchedRuleId: policyEval.matchedRuleId ?? "typed_action_approval",
        rewrittenCommand: null
      });
      const approval = await this.approvals.save(
        this.approvals.create({
          sandboxRun: { id: args.sandboxRun.id } as any,
          sandboxCommandRecord: { id: pseudoCommand.id } as any,
          sandboxPolicyDecision: { id: pseudoDecision.id } as any,
          user: { id: args.userId } as any,
          approvalType: "command",
          status: "pending",
          requestedCommand: `typed_action:${args.action.actionType}`,
          normalizedCommand: JSON.stringify(policyEval.normalizedParameters).slice(0, 2000),
          riskLevel: policyEval.riskLevel,
          reason: policyEval.reason,
          currentStepIndex: args.stepIndex
        })
      );
      args.sandboxRun.status = "paused_approval_required" as any;
      args.sandboxRun.outputPayload = {
        ...(args.sandboxRun.outputPayload ?? {}),
        runtimeState: {
          ...(args.sandboxRun.outputPayload as any)?.runtimeState,
          typedActionApprovalRequestId: approval.id,
          typedActionId: rec.id
        }
      } as any;
      await this.sandboxRuns.save(args.sandboxRun);
      return { action: rec, command: null as SandboxCommandRecordEntity | null };
    }
    const effectiveParams = policyEval.decision === "rewrite" && policyEval.rewrittenParameters ? policyEval.rewrittenParameters : policyEval.normalizedParameters;
    let commandRecord: SandboxCommandRecordEntity | null = null;
    if (args.action.actionType === "read_file") {
      const filePath = await this.resolveTargetPath(this.asString(effectiveParams.path));
      const out = await this.isolationProvider.readFileIsolated({
        path: filePath,
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs()
      });
      const content = out.content;
      rec.status = "completed";
      rec.outputSummary = `Read file ${filePath}`;
      rec.outputMeta = { bytes: content.length, preview: content.slice(0, 1000), policyDecisionId: policyDecision.id, isolation: out.isolationMetadata };
    } else if (args.action.actionType === "list_directory") {
      const dirPath = await this.resolveTargetPath(this.asString(effectiveParams.path || "."));
      const out = await this.isolationProvider.listDirectoryIsolated({
        path: dirPath,
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs()
      });
      const names = out.entries;
      rec.status = "completed";
      rec.outputSummary = `Listed directory ${dirPath}`;
      rec.outputMeta = { count: names.length, entries: names.slice(0, 200), policyDecisionId: policyDecision.id, isolation: out.isolationMetadata };
    } else if (args.action.actionType === "search_repo") {
      const query = this.asString(effectiveParams.query, 200);
      const limit = Math.max(1, Math.min(500, Number(effectiveParams.limit ?? 100)));
      const wr = this.workspaceRoot();
      const out = await this.isolationProvider.execute({
        executable: "rg",
        args: [query, ".", "--glob", "!**/node_modules/**", "--glob", "!.git", "-n", "-m", String(limit)],
        cwd: wr,
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: 30_000,
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `Search completed for ${query}`;
      rec.outputMeta = {
        stdout: out.stdout.slice(0, 120_000),
        stderr: out.stderr.slice(0, 8000),
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        searchRoot: wr,
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "get_git_status") {
      const cwd = this.workspaceRoot();
      const out = await this.isolationProvider.execute({
        executable: "git",
        args: ["status", "--porcelain", "-b"],
        cwd,
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs(),
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `git status (exit ${out.exitCode})`;
      rec.outputMeta = {
        stdout: out.stdout.slice(0, 80_000),
        stderr: out.stderr.slice(0, 8000),
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        cwd,
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "get_git_diff") {
      const cwd = this.workspaceRoot();
      const pathsRaw = effectiveParams.paths;
      const gitArgs =
        Array.isArray(pathsRaw) && pathsRaw.length > 0
          ? ["diff", "--", ...(await Promise.all(pathsRaw.map((p) => this.resolveTargetPath(this.asString(p)))))]
          : ["diff", "--", "."];
      const out = await this.isolationProvider.execute({
        executable: "git",
        args: gitArgs,
        cwd,
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs(),
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `git diff (exit ${out.exitCode})`;
      rec.outputMeta = {
        stdout: out.stdout.slice(0, 120_000),
        stderr: out.stderr.slice(0, 8000),
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        cwd,
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "patch_file") {
      const filePath = await this.resolveTargetPath(this.asString(effectiveParams.path));
      if (effectiveParams.newContent !== undefined) {
        await fs.writeFile(filePath, this.asString(effectiveParams.newContent, 500_000), "utf8");
        rec.status = "completed";
        rec.outputSummary = `Patched file (replace) ${filePath}`;
        rec.outputMeta = {
          bytesWritten: this.asString(effectiveParams.newContent, 500_000).length,
          policyDecisionId: policyDecision.id,
          scope: "file",
          isolation: this.inProcessIsolationMeta(args.action.actionType)
        };
      } else {
        rec.status = "blocked";
        rec.outputSummary = "patch_file requires explicit newContent; raw shell patching is disabled.";
        rec.outputMeta = { policyDecisionId: policyDecision.id, isolation: this.inProcessIsolationMeta(args.action.actionType) };
      }
    } else if (args.action.actionType === "inspect_logs") {
      const pattern = this.asString(effectiveParams.pattern ?? "error|exception|traceback|stack", 240);
      const limit = Math.max(1, Math.min(500, Number(effectiveParams.limit ?? 120)));
      const wr = this.workspaceRoot();
      const out = await this.isolationProvider.execute({
        executable: "rg",
        args: [pattern, ".", "--glob", "!**/node_modules/**", "-n", "-m", String(limit)],
        cwd: wr,
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: 30_000,
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `inspect_logs pattern=${pattern}`;
      rec.outputMeta = {
        stdout: out.stdout.slice(0, 120_000),
        stderr: out.stderr.slice(0, 8000),
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "run_tests") {
      const params = this.parseRunTestsParams(effectiveParams);
      const cmd = this.resolveTestCommand(params);
      const out = await this.isolationProvider.execute({
        executable: cmd.file,
        args: cmd.args,
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs(),
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `run_tests framework=${params.framework} mode=${params.mode}`;
      rec.outputMeta = {
        framework: params.framework,
        mode: params.mode,
        target: params.target ?? null,
        stdout: out.stdout,
        stderr: out.stderr,
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "run_typecheck") {
      const out = await this.isolationProvider.execute({
        executable: "tsc",
        args: ["--noEmit"],
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs(),
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `run_typecheck tsc --noEmit (exit ${out.exitCode})`;
      rec.outputMeta = {
        command: "tsc --noEmit",
        stdout: out.stdout,
        stderr: out.stderr,
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "run_lint") {
      const out = await this.isolationProvider.execute({
        executable: "eslint",
        args: [".", "--max-warnings", "0"],
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs(),
        allowNetwork: false
      });
      rec.status = out.exitCode === 0 ? "completed" : "failed";
      rec.outputSummary = `run_lint eslint . (exit ${out.exitCode})`;
      rec.outputMeta = {
        command: "eslint . --max-warnings 0",
        stdout: out.stdout,
        stderr: out.stderr,
        exitCode: out.exitCode,
        policyDecisionId: policyDecision.id,
        scope: "repo",
        isolation: out.isolationMetadata
      };
    } else if (args.action.actionType === "write_file") {
      const filePath = await this.resolveTargetPath(this.asString(effectiveParams.path));
      const content = this.asString(effectiveParams.content, 200000);
      const isolation = await this.isolationProvider.writeFileIsolated({
        path: filePath,
        content,
        cwd: this.workspaceRoot(),
        workspaceRoot: this.workspaceRoot(),
        timeoutMs: this.sandboxTimeoutMs()
      });
      rec.status = "completed";
      rec.outputSummary = `Wrote file ${filePath}`;
      rec.outputMeta = { bytes: content.length, policyDecisionId: policyDecision.id, isolation };
    } else {
      rec.status = "blocked";
      rec.outputSummary = `Unknown typed action blocked: ${args.action.actionType}`;
      rec.outputMeta = { policyDecisionId: policyDecision.id, isolation: this.inProcessIsolationMeta(args.action.actionType) };
    }
    rec.finishedAt = new Date();
    await this.typedActions.save(rec);
    this.logger.log(`typed_action_completed action=${args.action.actionType} status=${rec.status} run=${args.sandboxRun.id}`);
    return { action: rec, command: commandRecord };
  }

  async runCommandStep(_args: { sandboxRun: SandboxRunEntity; userId: string; stepIndex: number; cmd: RuntimeCommand }) {
    throw new BadRequestException("Legacy command execution is disabled. Use typed actions.");
  }

  async captureDiffPatch(args: { sandboxRun: SandboxRunEntity; userId: string }) {
    const out = await this.isolationProvider.execute({
      executable: "git",
      args: ["diff", "--", "."],
      cwd: this.workspaceRoot(),
      workspaceRoot: this.workspaceRoot(),
      timeoutMs: this.sandboxTimeoutMs(),
      allowNetwork: false
    });
    const diffText = (out.stdout ?? "").trim();
    if (!diffText) return null;

    const patch = this.patches.create({
      sandboxRun: args.sandboxRun,
      user: { id: args.userId } as any,
      status: "pending",
      diffText,
      summary: { source: "operator-runtime", commandRecordId: null }
    });
    await this.patches.save(patch);
    return patch;
  }

  async runPlan(args: {
    sandboxRun: SandboxRunEntity;
    userId: string;
    commands?: RuntimeCommand[];
    typedActions?: RuntimeTypedAction[];
    /** When true, skip git diff patch proposal (e.g. CCI read-only validation runs). */
    skipPatchCapture?: boolean;
  }) {
    const actions = args.typedActions ?? [];
    if ((args.commands ?? []).length > 0) {
      throw new BadRequestException("Legacy command plans are disabled; use typed actions only.");
    }
    if (actions.length < 1) throw new BadRequestException("No runtime work provided.");
    const executed: SandboxCommandRecordEntity[] = [];
    const typedExecuted: SandboxTypedActionEntity[] = [];
    for (let i = 0; i < actions.length; i++) {
      const a = await this.runTypedActionStep({ sandboxRun: args.sandboxRun, userId: args.userId, stepIndex: i + 1, action: actions[i] });
      typedExecuted.push(a.action);
      if (a.command) executed.push(a.command);
      if (a.action.status === "approval_required" || a.action.status === "blocked" || a.action.status === "failed") break;
    }
    const patch =
      args.skipPatchCapture ? null : await this.captureDiffPatch({ sandboxRun: args.sandboxRun, userId: args.userId });
    return { executed, typedExecuted, patch };
  }

  async listCommandAudit(args: { sandboxRunId?: string; userId?: string; limit?: number }) {
    const qb = this.commandRecords
      .createQueryBuilder("cmd")
      .leftJoinAndSelect("cmd.sandboxRun", "run")
      .leftJoinAndSelect("cmd.user", "user")
      .orderBy("cmd.createdAt", "DESC")
      .take(Math.min(500, Math.max(1, args.limit ?? 100)));

    if (args.sandboxRunId) qb.andWhere("run.id = :rid", { rid: args.sandboxRunId });
    if (args.userId) qb.andWhere("user.id = :uid", { uid: args.userId });
    return qb.getMany();
  }
}


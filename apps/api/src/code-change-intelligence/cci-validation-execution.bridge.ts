import { forwardRef, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import fs from "fs/promises";
import type {
  CciWorkspaceValidationEvidence,
  CciWorkspaceValidationEvidenceEntry,
  VerificationCheckStatus
} from "./change-intelligence.types";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";

export function isCciPostImplementationValidationEnabled(cfg: ConfigService): boolean {
  const v = (cfg.get<string>("CCI_POST_IMPLEMENTATION_VALIDATION") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

@Injectable()
export class CciValidationExecutionBridge {
  private readonly logger = new Logger(CciValidationExecutionBridge.name);

  constructor(
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => SandboxExecutionService))
    private readonly sandbox: SandboxExecutionService
  ) {}

  /**
   * When disabled or on non-fatal errors, returns null so verification keeps default honest not_run rows.
   * When enabled, returns evidence (including not_run per step) for verification overlay.
   */
  async maybeRunPostImplementationValidation(args: {
    userId: string;
    workspaceId: string | null | undefined;
  }): Promise<CciWorkspaceValidationEvidence | null> {
    if (!isCciPostImplementationValidationEnabled(this.cfg)) {
      return null;
    }
    if (!args.workspaceId) {
      return this.skippedEvidence("cci_validation_no_workspace_on_change_request");
    }

    const root = this.cfg.get<string>("OPERATOR_WORKSPACE_ROOT") ?? process.cwd();
    try {
      const st = await fs.stat(root);
      if (!st.isDirectory()) {
        return this.skippedEvidence("cci_validation_operator_workspace_root_not_directory");
      }
    } catch {
      return this.skippedEvidence("cci_validation_operator_workspace_root_unreadable");
    }

    const evidence: CciWorkspaceValidationEvidence = {};

    await this.runStep(evidence, "typecheck", args, { actionType: "run_typecheck", parameters: {} }, "tsc --noEmit");
    await this.runStep(evidence, "lint", args, { actionType: "run_lint", parameters: {} }, "eslint . --max-warnings 0");
    await this.runStep(
      evidence,
      "tests",
      args,
      {
        actionType: "run_tests",
        parameters: { framework: "jest", mode: "unit", allowWatch: false, updateSnapshots: false }
      },
      "jest --ci (typed run_tests)"
    );

    return evidence;
  }

  private skippedReasonMessage(code: string): string {
    switch (code) {
      case "cci_validation_no_workspace_on_change_request":
        return "Change request has no workspace; sandbox validation cannot run.";
      case "cci_validation_operator_workspace_root_not_directory":
        return "OPERATOR_WORKSPACE_ROOT is not a directory.";
      case "cci_validation_operator_workspace_root_unreadable":
        return "OPERATOR_WORKSPACE_ROOT is not readable.";
      default:
        return code;
    }
  }

  private skippedEvidence(skippedReason: string): CciWorkspaceValidationEvidence {
    const summary = this.skippedReasonMessage(skippedReason);
    const entry = (command: string): CciWorkspaceValidationEvidenceEntry => ({
      status: "not_run",
      command,
      exitCode: null,
      summary,
      notes: skippedReason
    });
    return {
      skippedReason,
      typecheck: entry("tsc --noEmit"),
      lint: entry("eslint . --max-warnings 0"),
      tests: entry("jest (typed run_tests)")
    };
  }

  private async runStep(
    evidence: CciWorkspaceValidationEvidence,
    key: "typecheck" | "lint" | "tests",
    args: { userId: string; workspaceId: string | null | undefined },
    typedAction: { actionType: string; parameters: Record<string, unknown> },
    commandLabel: string
  ): Promise<void> {
    try {
      const row = await this.sandbox.runCciInlineOperatorValidationAction({
        userId: args.userId,
        workspaceId: args.workspaceId!,
        typedAction: typedAction as never
      });
      const meta = (row.outputMeta ?? {}) as Record<string, unknown>;
      const exitCode = meta.exitCode != null ? Number(meta.exitCode) : null;
      const stdout = String(meta.stdout ?? "");
      const stderr = String(meta.stderr ?? "");
      const status = this.mapTypedActionStatus(row.status, exitCode);
      const cmd =
        key === "tests" && meta.framework != null
          ? `${String(meta.framework)} (typed run_tests)`
          : commandLabel;
      evidence[key] = {
        status,
        command: cmd,
        exitCode,
        summary: row.outputSummary ?? (status === "passed" ? "OK" : "Completed with issues"),
        notes: row.status === "blocked" || row.status === "approval_required" ? String(row.outputSummary ?? "") : undefined,
        stdoutSnippet: stdout.slice(0, 2000),
        stderrSnippet: stderr.slice(0, 2000)
      };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) {
        evidence[key] = {
          status: "not_run",
          command: commandLabel,
          exitCode: null,
          summary: "Validation could not run (system unavailable).",
          notes: e.message
        };
        return;
      }
      const msg = e instanceof Error ? e.message.slice(0, 500) : String(e);
      this.logger.warn(`CCI workspace validation step ${key} failed: ${msg}`);
      evidence[key] = {
        status: "not_run",
        command: commandLabel,
        exitCode: null,
        summary: `Validation step did not complete: ${msg}`
      };
    }
  }

  private mapTypedActionStatus(
    rowStatus: string,
    exitCode: number | null
  ): VerificationCheckStatus {
    if (rowStatus === "blocked" || rowStatus === "approval_required") return "skipped";
    if (rowStatus === "completed") return exitCode === 0 ? "passed" : "failed";
    if (rowStatus === "failed") return "failed";
    return "not_run";
  }
}

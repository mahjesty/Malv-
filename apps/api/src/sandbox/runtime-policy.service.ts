import { forwardRef, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SecurityEventService } from "../security/security-event.service";
import crypto from "crypto";
import { PolicyDefinitionEntity } from "../db/entities/policy-definition.entity";
import { PolicyVersionEntity } from "../db/entities/policy-version.entity";
import { SandboxRunPolicyBindingEntity } from "../db/entities/sandbox-run-policy-binding.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxCommandPolicyDecisionEntity, type PolicyDecision } from "../db/entities/sandbox-command-policy-decision.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxTypedActionEntity } from "../db/entities/sandbox-typed-action.entity";
import { SandboxTypedActionPolicyDecisionEntity } from "../db/entities/sandbox-typed-action-policy-decision.entity";

type EvalResult = {
  decision: PolicyDecision;
  reason: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  matchedRuleId?: string | null;
  rewrittenCommand?: string | null;
  normalizedCommand: string;
  commandCategory: string;
  policyVersionId: string;
};

@Injectable()
export class RuntimePolicyService {
  constructor(
    @InjectRepository(PolicyDefinitionEntity) private readonly defs: Repository<PolicyDefinitionEntity>,
    @InjectRepository(PolicyVersionEntity) private readonly versions: Repository<PolicyVersionEntity>,
    @InjectRepository(SandboxRunPolicyBindingEntity) private readonly bindings: Repository<SandboxRunPolicyBindingEntity>,
    @InjectRepository(SandboxCommandPolicyDecisionEntity) private readonly cmdDecisions: Repository<SandboxCommandPolicyDecisionEntity>,
    @InjectRepository(SandboxTypedActionPolicyDecisionEntity)
    private readonly typedActionDecisions: Repository<SandboxTypedActionPolicyDecisionEntity>,
    @Inject(forwardRef(() => SecurityEventService)) private readonly securityEvents: SecurityEventService
  ) {}

  private defaultRules() {
    return {
      allowPrefixes: ["ls", "pwd", "echo", "rg", "wc", "du", "cat", "npm test", "npm run test", "npm run build", "tsc"],
      requireApprovalPatterns: ["git push", "sudo", "brew ", "apt ", "yum ", "docker push"],
      denyPatterns: [
        "rm -rf /",
        "shutdown",
        "reboot",
        "curl http://",
        "curl https://",
        "wget http://",
        "wget https://",
        "nc ",
        "ncat ",
        "scp ",
        "python ",
        "node ",
        "npm run "
      ],
      rewrites: [{ id: "rewrite_rm_force", from: "rm -rf ", to: "rm -r " }],
      typedActions: {
        allow: [
          "read_file",
          "list_directory",
          "search_repo",
          "run_tests",
          "run_typecheck",
          "run_lint",
          "inspect_logs",
          "get_git_status",
          "get_git_diff"
        ],
        requireApproval: ["write_file", "patch_file"],
        deny: [],
        rewrites: [{ id: "typed_search_limit_default", actionType: "search_repo", ifMissing: "limit", set: 100 }]
      }
    } as const;
  }

  private normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, " ").toLowerCase();
  }

  private classify(normalized: string): string {
    if (/^(ls|pwd|echo|rg|wc|du|cat)\b/.test(normalized)) return "read";
    if (/^(npm test|npm run test|npm run build|tsc|pytest|go test|cargo test)\b/.test(normalized)) return "analyze";
    if (/^(npm run)\b/.test(normalized)) return "execute";
    if (/^(git add|git commit|rm|mv|cp|apply_patch)\b/.test(normalized)) return "modify";
    return "system";
  }

  async resolveAndBindForRun(args: { sandboxRun: SandboxRunEntity; bindingReason: string; scopeHint?: "workspace" | "project" | "default" }): Promise<SandboxRunPolicyBindingEntity> {
    const existing = await this.bindings.findOne({
      where: { sandboxRun: { id: args.sandboxRun.id } },
      relations: ["policyDefinition", "policyVersion", "sandboxRun"]
    });
    if (existing) return existing;

    const scopeOrder = [args.scopeHint ?? "workspace", "project", "default"] as const;
    let def: PolicyDefinitionEntity | null = null;
    for (const scope of scopeOrder) {
      def = await this.defs.findOne({ where: { scope, status: "active" as const } as any, order: { createdAt: "DESC" } });
      if (def) break;
    }
    if (!def) {
      def = await this.defs.save(
        this.defs.create({
          name: "MALV Default Runtime Policy",
          scope: "default",
          status: "active",
          description: "Default runtime policy for operator sandbox.",
          createdBy: "system"
        })
      );
      const rules = this.defaultRules();
      const hash = crypto.createHash("sha256").update(JSON.stringify(rules)).digest("hex");
      await this.versions.save(
        this.versions.create({
          policyDefinition: def,
          version: 1,
          rulesJson: rules as any,
          hash,
          isActive: true
        })
      );
    }

    const activeVersion = await this.versions.findOne({
      where: { policyDefinition: { id: def.id }, isActive: true } as any,
      order: { version: "DESC" },
      relations: ["policyDefinition"]
    });
    if (!activeVersion) {
      throw new ServiceUnavailableException("No active policy version resolved for sandbox run.");
    }

    const bind = this.bindings.create({
      sandboxRun: { id: args.sandboxRun.id } as any,
      policyDefinition: { id: def.id } as any,
      policyVersion: { id: activeVersion.id } as any,
      bindingReason: args.bindingReason
    });
    const saved = await this.bindings.save(bind);
    return this.bindings.findOneOrFail({
      where: { id: saved.id },
      relations: ["policyDefinition", "policyVersion", "sandboxRun"]
    });
  }

  async evaluateCommand(args: { sandboxRunId: string; requestedCommand: string }): Promise<EvalResult> {
    const binding = await this.bindings.findOne({
      where: { sandboxRun: { id: args.sandboxRunId } } as any,
      relations: ["policyVersion"]
    });
    if (!binding) throw new ServiceUnavailableException("Sandbox run has no policy binding.");

    const version = await this.versions.findOne({ where: { id: binding.policyVersion.id } });
    if (!version) throw new ServiceUnavailableException("Bound policy version not found.");

    const rules = (version.rulesJson ?? this.defaultRules()) as any;
    const normalized = this.normalizeCommand(args.requestedCommand);
    const category = this.classify(normalized);

    for (const rw of rules.rewrites ?? []) {
      if (normalized.includes(String(rw.from ?? "").toLowerCase())) {
        const rewritten = args.requestedCommand.replace(new RegExp(String(rw.from), "gi"), String(rw.to));
        return {
          decision: "rewrite",
          reason: "command rewritten by policy",
          riskLevel: "medium",
          matchedRuleId: String(rw.id ?? "rewrite"),
          rewrittenCommand: rewritten,
          normalizedCommand: normalized,
          commandCategory: category,
          policyVersionId: version.id
        };
      }
    }
    for (const p of rules.denyPatterns ?? []) {
      if (normalized.includes(String(p).toLowerCase())) {
        return {
          decision: "deny",
          reason: `denied by pattern: ${p}`,
          riskLevel: "critical",
          matchedRuleId: `deny:${p}`,
          normalizedCommand: normalized,
          commandCategory: category,
          policyVersionId: version.id
        };
      }
    }
    for (const p of rules.requireApprovalPatterns ?? []) {
      if (normalized.includes(String(p).toLowerCase())) {
        return {
          decision: "require_approval",
          reason: `approval required by pattern: ${p}`,
          riskLevel: "high",
          matchedRuleId: `approval:${p}`,
          normalizedCommand: normalized,
          commandCategory: category,
          policyVersionId: version.id
        };
      }
    }
    const allow = (rules.allowPrefixes ?? []).some((p: string) => normalized.startsWith(String(p).toLowerCase()));
    if (!allow && (category === "modify" || category === "system")) {
      return {
        decision: "deny",
        reason: "default-deny for critical categories",
        riskLevel: "high",
        matchedRuleId: "default_deny_critical",
        normalizedCommand: normalized,
        commandCategory: category,
        policyVersionId: version.id
      };
    }
    return {
      decision: "allow",
      reason: "allowed by policy",
      riskLevel: "low",
      matchedRuleId: "allow_default",
      normalizedCommand: normalized,
      commandCategory: category,
      policyVersionId: version.id
    };
  }

  async evaluateTypedAction(args: {
    sandboxRunId: string;
    actionType: string;
    parameters: Record<string, unknown>;
  }): Promise<{
    decision: PolicyDecision;
    reason: string;
    riskLevel: "low" | "medium" | "high" | "critical";
    matchedRuleId?: string | null;
    normalizedParameters: Record<string, unknown>;
    rewrittenParameters?: Record<string, unknown> | null;
    actionCategory: string;
    policyVersionId: string;
  }> {
    const binding = await this.bindings.findOne({
      where: { sandboxRun: { id: args.sandboxRunId } } as any,
      relations: ["policyVersion"]
    });
    if (!binding) throw new ServiceUnavailableException("Sandbox run has no policy binding.");
    const version = await this.versions.findOne({ where: { id: binding.policyVersion.id } });
    if (!version) throw new ServiceUnavailableException("Bound policy version not found.");
    const rules = (version.rulesJson ?? this.defaultRules()) as any;
    const actionType = String(args.actionType || "").trim().toLowerCase();
    const normalizedParameters = Object.fromEntries(
      Object.entries(args.parameters ?? {}).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
    );
    const category = /write_file|patch_file/.test(actionType)
      ? "modify"
      : /run_tests|run_typecheck|run_lint|inspect_logs/.test(actionType)
        ? "execute"
        : "read";
    const typed = (rules.typedActions ?? {
      allow: [
        "read_file",
        "list_directory",
        "search_repo",
        "get_git_status",
        "get_git_diff",
        "run_tests",
        "run_typecheck",
        "run_lint",
        "inspect_logs"
      ],
      requireApproval: ["write_file", "patch_file"],
      deny: [],
      rewrites: [{ id: "rewrite_search_repo_limit", actionType: "search_repo", ifMissing: "limit", set: 100 }]
    }) as any;
    if ((typed.deny ?? []).includes(actionType)) {
      return {
        decision: "deny",
        reason: `typed action denied: ${actionType}`,
        riskLevel: "high",
        matchedRuleId: `typed_deny:${actionType}`,
        normalizedParameters,
        actionCategory: category,
        policyVersionId: version.id
      };
    }
    if ((typed.requireApproval ?? []).includes(actionType)) {
      return {
        decision: "require_approval",
        reason: `typed action requires approval: ${actionType}`,
        riskLevel: "high",
        matchedRuleId: `typed_approval:${actionType}`,
        normalizedParameters,
        actionCategory: category,
        policyVersionId: version.id
      };
    }
    for (const rw of typed.rewrites ?? []) {
      if (String(rw.actionType ?? "").toLowerCase() !== actionType) continue;
      const key = String(rw.ifMissing ?? "");
      if (!key) continue;
      if (normalizedParameters[key] == null) {
        return {
          decision: "rewrite",
          reason: `typed action parameter rewritten: ${key}`,
          riskLevel: "medium",
          matchedRuleId: String(rw.id ?? "typed_rewrite"),
          normalizedParameters,
          rewrittenParameters: { ...normalizedParameters, [key]: rw.set ?? null },
          actionCategory: category,
          policyVersionId: version.id
        };
      }
    }
    const allowed = (typed.allow ?? []).includes(actionType);
    if (!allowed) {
      return {
        decision: "deny",
        reason: "typed action not allowed",
        riskLevel: "high",
        matchedRuleId: "typed_default_deny",
        normalizedParameters,
        actionCategory: category,
        policyVersionId: version.id
      };
    }
    return {
      decision: "allow",
      reason: "typed action allowed",
      riskLevel: category === "read" ? "low" : "medium",
      matchedRuleId: "typed_allow_default",
      normalizedParameters,
      actionCategory: category,
      policyVersionId: version.id
    };
  }

  private emitPolicyDenial(args: {
    kind: "command" | "typed_action";
    sandboxRunId: string;
    decision: string;
    reason: string;
    matchedRuleId?: string | null;
  }) {
    if (args.decision !== "deny") return;
    void this.securityEvents.emitBestEffort({
      eventType: "sandbox.policy.denied",
      severity: "medium",
      subsystem: "sandbox_policy",
      summary: `${args.kind} denied: ${args.reason.slice(0, 500)}`,
      details: {
        kind: args.kind,
        sandboxRunId: args.sandboxRunId,
        matchedRuleId: args.matchedRuleId ?? null
      },
      correlationId: args.sandboxRunId
    });
  }

  async persistDecision(args: {
    sandboxCommandRecord: SandboxCommandRecordEntity;
    sandboxRunId: string;
    policyVersionId: string;
    requestedCommand: string;
    normalizedCommand: string;
    commandCategory: string;
    riskLevel: string;
    decision: PolicyDecision;
    decisionReason: string;
    matchedRuleId?: string | null;
    rewrittenCommand?: string | null;
  }): Promise<SandboxCommandPolicyDecisionEntity> {
    const saved = await this.cmdDecisions.save(
      this.cmdDecisions.create({
        sandboxCommandRecord: { id: args.sandboxCommandRecord.id } as any,
        sandboxRun: { id: args.sandboxRunId } as any,
        policyVersion: { id: args.policyVersionId } as any,
        requestedCommand: args.requestedCommand,
        normalizedCommand: args.normalizedCommand,
        commandCategory: args.commandCategory,
        riskLevel: args.riskLevel,
        decision: args.decision,
        decisionReason: args.decisionReason,
        matchedRuleId: args.matchedRuleId ?? null,
        rewrittenCommand: args.rewrittenCommand ?? null
      })
    );
    this.emitPolicyDenial({
      kind: "command",
      sandboxRunId: args.sandboxRunId,
      decision: args.decision,
      reason: args.decisionReason,
      matchedRuleId: args.matchedRuleId ?? null
    });
    return saved;
  }

  async persistTypedActionDecision(args: {
    sandboxTypedAction: SandboxTypedActionEntity;
    sandboxRunId: string;
    policyVersionId: string;
    requestedActionType: string;
    requestedParameters: Record<string, unknown>;
    normalizedParameters: Record<string, unknown>;
    actionCategory: string;
    riskLevel: string;
    decision: PolicyDecision;
    decisionReason: string;
    matchedRuleId?: string | null;
    rewrittenParameters?: Record<string, unknown> | null;
  }): Promise<SandboxTypedActionPolicyDecisionEntity> {
    const saved = await this.typedActionDecisions.save(
      this.typedActionDecisions.create({
        sandboxTypedAction: { id: args.sandboxTypedAction.id } as any,
        sandboxRun: { id: args.sandboxRunId } as any,
        policyVersion: { id: args.policyVersionId } as any,
        requestedActionType: args.requestedActionType,
        requestedParametersJson: args.requestedParameters,
        normalizedParametersJson: args.normalizedParameters,
        actionCategory: args.actionCategory,
        riskLevel: args.riskLevel,
        decision: args.decision,
        decisionReason: args.decisionReason,
        matchedRuleId: args.matchedRuleId ?? null,
        rewrittenParametersJson: args.rewrittenParameters ?? null
      })
    );
    this.emitPolicyDenial({
      kind: "typed_action",
      sandboxRunId: args.sandboxRunId,
      decision: args.decision,
      reason: args.decisionReason,
      matchedRuleId: args.matchedRuleId ?? null
    });
    return saved;
  }
}


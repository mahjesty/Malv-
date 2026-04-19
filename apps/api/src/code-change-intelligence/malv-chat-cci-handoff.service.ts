import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import type { GlobalRole } from "../workspace/workspace-access.service";
import { WorkspaceAccessService } from "../workspace/workspace-access.service";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";
import { messageLooksLikeKnowledgeOrCasualQuestion } from "../beast/intent-understanding.service";
import type { ClassifiedIntent, MalvIntentKind } from "../beast/intent-understanding.types";

const INTENT_ORDER: MalvIntentKind[] = [
  "full_product_build",
  "feature_build",
  "bug_fix",
  "improvement_refactor",
  "frontend_design",
  "backend_logic",
  "system_upgrade"
];

function maxIntentScore(classified: ClassifiedIntent): number {
  return Math.max(...INTENT_ORDER.map((k) => classified.scores[k]));
}

const HANDOFF_INTENTS = new Set([
  "feature_build",
  "bug_fix",
  "full_product_build",
  "system_upgrade",
  "improvement_refactor",
  "frontend_design",
  "backend_logic"
]);

/**
 * Optional bridge from chat orchestration into code-change intelligence (audit + plan only).
 * Gated by env and workspace membership; does not run implementation without patch context.
 */
@Injectable()
export class MalvChatCciHandoffService {
  private readonly logger = new Logger(MalvChatCciHandoffService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly cci: CodeChangeIntelligenceService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly killSwitch: KillSwitchService
  ) {}

  isEnabled(): boolean {
    const v = (this.cfg.get<string>("MALV_CHAT_CCI_HANDOFF") ?? "0").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes";
  }

  shouldOfferHandoff(primaryIntent: string): boolean {
    return HANDOFF_INTENTS.has(primaryIntent);
  }

  async maybeBuildHandoffContext(args: {
    userId: string;
    userRole: GlobalRole;
    workspaceId: string | null | undefined;
    message: string;
    assistantMessageId: string;
    primaryIntent: string;
    /** When omitted, expensive audit/plan may run too often — prefer passing full classification. */
    classifiedIntent?: ClassifiedIntent | null;
  }): Promise<{ contextAppend: string; metaPatch: Record<string, unknown> } | null> {
    if (!this.isEnabled()) return null;
    if (!args.workspaceId) return null;
    if (!this.shouldOfferHandoff(args.primaryIntent)) return null;

    const trimmed = args.message.trim();
    const maxScore = args.classifiedIntent ? maxIntentScore(args.classifiedIntent) : 0;
    const changeLike =
      /\b(implement|patch|migrate|refactor|deploy|ship|release|pull request|pr\b|merge conflict|stack trace|stacktrace|broken|crash|regression|bug\b|doesn'?t work|exception|error:)\b/i.test(
        trimmed
      );

    // Narrow gate: skip knowledge-style chat and weak intent scores so CCI is not a default tax on normal turns.
    if (args.classifiedIntent) {
      if (messageLooksLikeKnowledgeOrCasualQuestion(trimmed) && maxScore < 6) {
        this.logger.debug(`CCI handoff skipped: knowledge/casual question with maxScore=${maxScore}`);
        return null;
      }
      if (maxScore < 3) {
        this.logger.debug(`CCI handoff skipped: intent scores too weak maxScore=${maxScore}`);
        return null;
      }
      if (maxScore < 4 && !changeLike) {
        this.logger.debug(`CCI handoff skipped: not clearly change- or defect-oriented maxScore=${maxScore}`);
        return null;
      }
    }

    const member = await this.workspaceAccess.isWorkspaceMember(args.userId, args.workspaceId);
    if (!member && args.userRole !== "admin") {
      this.logger.debug(`CCI handoff skipped: user not workspace member workspaceId=${args.workspaceId}`);
      return null;
    }

    try {
      await this.killSwitch.ensureSystemOnOrThrow({ reason: "chat_cci_handoff" });
    } catch {
      this.logger.debug("CCI handoff skipped: kill-switch active");
      return null;
    }

    const title = args.message.split("\n")[0]?.trim().slice(0, 200) || "Chat handoff";
    try {
      const out = await this.cci.createChangeRequestAndRunAuditPlan({
        userId: args.userId,
        workspaceId: args.workspaceId,
        sourceMessageId: args.assistantMessageId,
        title,
        requestedGoal: args.message.trim().slice(0, 8000)
      });
      const lines = [
        "### Code-change intelligence (server handoff)",
        `A change request was created and the audit + planning pipeline ran (id=${out.changeRequestId}).`,
        `Status: ${out.requestStatus}${out.blocked ? " — blocked pending approval." : ""}`,
        `Trust: ${out.trustLevel}; approvalRequired=${out.approvalRequired}.`,
        `Audit summary (truncated): ${out.auditSummary.slice(0, 1200)}`,
        `Plan summary (truncated): ${out.planSummary.slice(0, 1200)}`,
        "Use this as ground truth for architecture and plan; do not invent different file lists. Implementation still requires sandbox / patch context from the operator."
      ];
      return {
        contextAppend: lines.join("\n"),
        metaPatch: {
          malvChangeRequestId: out.changeRequestId,
          malvCciHandoff: true,
          malvCciHandoffBlocked: out.blocked
        }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`CCI handoff failed: ${msg}`);
      return {
        contextAppend: `### Code-change intelligence handoff\nHandoff was attempted but failed: ${msg.slice(0, 400)}`,
        metaPatch: { malvCciHandoff: false, malvCciHandoffError: msg.slice(0, 800) }
      };
    }
  }
}

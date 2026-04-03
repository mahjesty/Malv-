import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import type { GlobalRole } from "../workspace/workspace-access.service";
import { WorkspaceAccessService } from "../workspace/workspace-access.service";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";

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
  }): Promise<{ contextAppend: string; metaPatch: Record<string, unknown> } | null> {
    if (!this.isEnabled()) return null;
    if (!args.workspaceId) return null;
    if (!this.shouldOfferHandoff(args.primaryIntent)) return null;

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

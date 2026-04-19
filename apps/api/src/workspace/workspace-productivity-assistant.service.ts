import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceRoutingService } from "../inference/inference-routing.service";
import { MalvTaskRouterService } from "../agent-system/router/malv-task-router.service";
import { malvAgentSystemEnabled } from "../agent-system/malv-agent-system.config";

export type ProductivityAssistantKind = "inbox_triage" | "task_commentary";

/**
 * Draft-only helpers for inbox/task surfaces (no autonomous execution).
 * Policy/approval flows remain deterministic in the workspace layer.
 */
@Injectable()
export class WorkspaceProductivityAssistantService {
  private readonly logger = new Logger(WorkspaceProductivityAssistantService.name);

  constructor(
    private readonly beastWorker: BeastWorkerClient,
    private readonly inferenceRouting: InferenceRoutingService,
    private readonly cfg: ConfigService,
    private readonly malvTaskRouter: MalvTaskRouterService
  ) {}

  async draft(args: {
    userId: string;
    kind: ProductivityAssistantKind;
    text: string;
    taskTitle?: string | null;
  }): Promise<{ ok: true; draft: string; meta: Record<string, unknown> } | { ok: false; error: string }> {
    const trimmed = args.text.trim();
    if (!trimmed) {
      return { ok: false, error: "text_required" };
    }

    const surface = args.kind === "inbox_triage" ? "inbox" : "task";
    const route = this.inferenceRouting.decideForProductivityDraft({
      surface,
      kind: args.kind === "inbox_triage" ? "inbox_triage" : "task_commentary",
      textLength: trimmed.length
    });

    const traceId = randomUUID();
    const agentRouter = malvAgentSystemEnabled(this.cfg)
      ? this.malvTaskRouter.route({
          traceId,
          surface,
          userText: trimmed,
          vaultScoped: false,
          memorySnippetCount: 0
        })
      : null;

    const system =
      args.kind === "inbox_triage"
        ? `You assist with inbox triage. Given raw notes or pasted email/thread text, produce:
1) A one-line summary
2) 3–6 bullet suggested actions (draft wording, not sent)
3) A guessed category tag (single phrase)
Use plain text sections labeled Summary / Suggested actions / Category. Do not claim anything was sent or executed.`
        : `You assist with workspace tasks. Given a task title (if any) and notes, produce:
1) A short plan sketch (3–5 bullets)
2) One "next concrete step" line
Plain text only; do not claim execution or approvals.`;

    const userBlock =
      args.kind === "task_commentary" && args.taskTitle?.trim()
        ? `Task title: ${args.taskTitle.trim()}\n\nNotes:\n${trimmed}`
        : trimmed;

    try {
      const res = await this.beastWorker.infer({
        mode: "light",
        prompt: "workspace_productivity_assistant",
        correlationId: traceId,
        context: {
          malvPromptAlreadyExpanded: true,
          malvOperatorMode: "analyze",
          workspaceProductivityAssistant: true,
          assistantKind: args.kind,
          ...route.workerContextPatch,
          malvRouting: route.telemetry,
          ...(agentRouter
            ? {
                malvAgentTaskRouter: {
                  workShape: agentRouter.workShape,
                  resourceTier: agentRouter.resourceTier,
                  planId: agentRouter.plan.planId,
                  pathHints: agentRouter.malvExecutionPathHints
                }
              }
            : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: userBlock }
          ]
        }
      });
      const draft = (res.reply ?? "").trim();
      if (!draft) {
        return { ok: false, error: "empty_model_output" };
      }
      return {
        ok: true,
        draft,
        meta: {
          ...(res.meta ?? {}),
          malvRouting: route.telemetry,
          ...(agentRouter
            ? {
                malvAgentRouterSummary: {
                  workShape: agentRouter.workShape,
                  resourceTier: agentRouter.resourceTier,
                  reasonCodes: agentRouter.reasonCodes.slice(0, 8)
                }
              }
            : {})
        }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`workspace_productivity_assistant_failed kind=${args.kind} userId=${args.userId} ${msg}`);
      return { ok: false, error: "inference_unavailable" };
    }
  }
}

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import type { BeastInferenceResponse } from "./client/beast-worker.client";
import { BeastWorkerClient } from "./client/beast-worker.client";
import { INTERNAL_PHASE_LABELS } from "./autonomous-orchestration.prompt";
import type { InternalPhaseId } from "./execution-strategy.service";

export type MalvChatPhaseTraceEntry = {
  phaseId: InternalPhaseId;
  phaseLabel: string;
  index: number;
  total: number;
  status: "completed" | "failed";
  replyChars: number;
  producer: "beast_worker" | "fallback_brain";
  detail?: string;
};

export function buildPhasedStepUserMessage(args: {
  originalUserMessage: string;
  phase: InternalPhaseId;
  phaseIndex: number;
  phaseTotal: number;
  priorPhaseBodies: string[];
}): string {
  const prior =
    args.priorPhaseBodies.length === 0
      ? ""
      : `\n\n### Prior phases (completed in this server run)\n${args.priorPhaseBodies.join("\n\n---\n\n")}`;
  return `${args.originalUserMessage}${prior}\n\n### Server phase ${args.phaseIndex + 1}/${args.phaseTotal} ONLY\nRespond only for: ${INTERNAL_PHASE_LABELS[args.phase]}. Do not redo earlier phases in full; reference them briefly if needed.`;
}

/**
 * Optional multi-pass worker orchestration for {@link ExecutionStrategyService} `phased` mode.
 * Preserves kill-switch checks between steps; does not bypass policy or sandbox gates.
 */
@Injectable()
export class PhasedChatOrchestrationService {
  constructor(
    private readonly cfg: ConfigService,
    private readonly worker: BeastWorkerClient,
    private readonly killSwitch: KillSwitchService
  ) {}

  isEnabled(): boolean {
    const v = (this.cfg.get<string>("MALV_SERVER_PHASED_CHAT_ORCHESTRATION") ?? "0").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes";
  }

  async runWorkerPhases(args: {
    originalUserMessage: string;
    phases: InternalPhaseId[];
    mode: "light" | "beast";
    buildPrompt: (userMessageForStep: string) => string;
    baseAggregated: Record<string, unknown>;
    signal?: AbortSignal;
    synthesizeFallback: (reason: string) => BeastInferenceResponse;
    onPhaseStart?: (phase: InternalPhaseId, index: number, total: number) => void;
  }): Promise<{ combinedReply: string; trace: MalvChatPhaseTraceEntry[]; lastMeta: Record<string, unknown> }> {
    const trace: MalvChatPhaseTraceEntry[] = [];
    const priorBodies: string[] = [];
    let lastMeta: Record<string, unknown> = {};
    const total = args.phases.length;

    for (let i = 0; i < total; i++) {
      if (args.signal?.aborted) {
        trace.push({
          phaseId: args.phases[i]!,
          phaseLabel: INTERNAL_PHASE_LABELS[args.phases[i]!],
          index: i,
          total,
          status: "failed",
          replyChars: 0,
          producer: "beast_worker",
          detail: "aborted_before_phase"
        });
        break;
      }
      const phase = args.phases[i]!;
      args.onPhaseStart?.(phase, i, total);
      await this.killSwitch.ensureSystemOnOrThrow({ reason: "phased_chat_worker_step" });

      const userMessageForStep = buildPhasedStepUserMessage({
        originalUserMessage: args.originalUserMessage,
        phase,
        phaseIndex: i,
        phaseTotal: total,
        priorPhaseBodies: [...priorBodies]
      });
      const prompt = args.buildPrompt(userMessageForStep);

      const ctx: Record<string, unknown> = {
        ...args.baseAggregated,
        malvServerPhasedOrchestration: {
          active: true,
          phaseId: phase,
          phaseIndex: i,
          phaseTotal: total,
          phaseLabel: INTERNAL_PHASE_LABELS[phase]
        }
      };

      let reply = "";
      let producer: MalvChatPhaseTraceEntry["producer"] = "beast_worker";
      let detail: string | undefined;
      try {
        const res = await this.worker.infer({
          mode: args.mode,
          prompt,
          context: ctx,
          signal: args.signal
        });
        reply = (res.reply ?? "").trim();
        lastMeta = { ...(res.meta ?? {}) };
      } catch (e) {
        detail = e instanceof Error ? e.message : String(e);
        producer = "fallback_brain";
        const fb = args.synthesizeFallback(detail ?? "worker_error");
        reply = (fb.reply ?? "").trim();
        lastMeta = { ...(fb.meta ?? {}), malvPhasedStepWorkerError: detail };
      }

      if (!reply) {
        producer = "fallback_brain";
        const fb = args.synthesizeFallback(detail ?? "empty_phase_reply");
        reply = (fb.reply ?? "").trim();
        lastMeta = { ...(fb.meta ?? {}), malvPhasedStepEmpty: true };
      }

      trace.push({
        phaseId: phase,
        phaseLabel: INTERNAL_PHASE_LABELS[phase],
        index: i,
        total,
        status: reply ? "completed" : "failed",
        replyChars: reply.length,
        producer,
        detail
      });

      if (reply) {
        priorBodies.push(reply);
      }
    }

    const combinedReply = priorBodies.map((body, i) => `## ${INTERNAL_PHASE_LABELS[args.phases[i]!]}\n\n${body}`).join("\n\n");

    return {
      combinedReply: combinedReply || args.synthesizeFallback("phased_run_empty").reply,
      trace,
      lastMeta
    };
  }
}

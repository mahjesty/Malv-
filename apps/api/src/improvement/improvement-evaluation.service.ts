import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { ReflectionEventEntity } from "../db/entities/reflection-event.entity";
import { ImprovementProposalService } from "./improvement-proposal.service";

/**
 * Heuristic evaluation over recent reflections — fast, no ML.
 * Proposes controlled prompt tweaks when repeated fallback or slow responses are detected.
 */
@Injectable()
export class ImprovementEvaluationService {
  private readonly logger = new Logger(ImprovementEvaluationService.name);

  constructor(
    @InjectRepository(ReflectionEventEntity) private readonly reflections: Repository<ReflectionEventEntity>,
    private readonly proposals: ImprovementProposalService
  ) {}

  async evaluateRecentPatterns(userId: string): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const hour = await this.reflections.find({
      where: { user: { id: userId }, createdAt: MoreThan(since) },
      order: { createdAt: "DESC" },
      take: 80
    });
    if (hour.length < 5) return;

    const fallbacks = hour.filter((r) => r.taskType === "chat_infer" && r.errorClass === "fallback_brain");
    const slow = hour.filter((r) => r.latencyMs > 45_000);
    const fail = hour.filter((r) => !r.success);

    if (fallbacks.length >= 3) {
      const created = await this.proposals.createHeuristic({
        description:
          "Repeated beast-worker fallback detected in the last hour. Consider tightening prompts or verifying worker health.",
        affectedSystem: "chat",
        confidence: Math.min(0.95, 0.55 + fallbacks.length * 0.05),
        correlationIds: fallbacks.slice(0, 5).map((x) => x.correlationId),
        suggestion: {
          kind: "prompt_tweak",
          configKey: "brain.prompt.directive_extra",
          value: {
            text: "Keep answers shorter when context is large; prefer bullet lists over long prose to reduce token pressure."
          },
          routingNote: "If fallbacks persist, inspect beast-worker logs for OOM or timeout."
        }
      });
      if (created) this.logger.log(`Improvement proposal created id=${created.id} (fallback cluster)`);
    } else if (slow.length >= 4) {
      const created = await this.proposals.createHeuristic({
        description: "Several chat turns exceeded 45s latency in the last hour. Review worker load and routing thresholds.",
        affectedSystem: "routing",
        confidence: 0.62,
        correlationIds: slow.slice(0, 5).map((x) => x.correlationId),
        suggestion: {
          kind: "config_review",
          hint: "Consider MALV_BEAST_NODE_NAME health and JOB_RUNNER concurrency.",
          safeAction: "No automatic change — admin review only."
        }
      });
      if (created) this.logger.log(`Improvement proposal created id=${created.id} (latency cluster)`);
    } else if (fail.length >= 6) {
      const created = await this.proposals.createHeuristic({
        description: "High failure rate in recorded reflections. Review kill-switch, policies, and worker connectivity.",
        affectedSystem: "platform",
        confidence: 0.58,
        correlationIds: fail.slice(0, 5).map((x) => x.correlationId),
        suggestion: {
          kind: "ops_review",
          safeAction: "Audit /v1/admin/system/health and recent audit_events."
        }
      });
      if (created) this.logger.log(`Improvement proposal created id=${created.id} (failure cluster)`);
    }
  }
}

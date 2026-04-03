import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IntelligenceLearningMemoryEntity } from "../db/entities/intelligence-learning-memory.entity";
import type { LearningOutcome } from "./malv-intelligence.types";

@Injectable()
export class IntelligenceLearningService {
  private readonly logger = new Logger(IntelligenceLearningService.name);

  constructor(
    @InjectRepository(IntelligenceLearningMemoryEntity)
    private readonly memory: Repository<IntelligenceLearningMemoryEntity>
  ) {}

  async record(args: {
    patternKey: string;
    category: string;
    fixStrategy: string;
    outcome: LearningOutcome;
    sourceChangeRequestId?: string | null;
    issueCode?: string | null;
    metadataJson?: Record<string, unknown> | null;
  }): Promise<void> {
    const row = this.memory.create({
      patternKey: args.patternKey.slice(0, 128),
      category: args.category.slice(0, 64),
      fixStrategy: args.fixStrategy,
      outcome: args.outcome,
      sourceChangeRequestId: args.sourceChangeRequestId ?? null,
      issueCode: args.issueCode ?? null,
      metadataJson: args.metadataJson ?? null
    });
    await this.memory.save(row);
  }

  /** Recent entries for a category (e.g. recurring bug patterns). */
  async recentByCategory(category: string, take = 15): Promise<IntelligenceLearningMemoryEntity[]> {
    return this.memory.find({
      where: { category },
      order: { createdAt: "DESC" },
      take
    });
  }

  /**
   * Record pipeline completion — what worked / failed for self-improvement.
   * Best-effort: does not throw to callers.
   */
  async recordPipelineCompletionBestEffort(args: {
    changeRequestId: string;
    requestedGoal: string;
    outcome: LearningOutcome;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const key = `goal:${args.requestedGoal.slice(0, 80).replace(/\s+/g, " ")}`;
      await this.record({
        patternKey: key,
        category: "change_pipeline",
        fixStrategy: "Completed change intelligence workflow; compare audit/fixPlan vs verification/review.",
        outcome: args.outcome,
        sourceChangeRequestId: args.changeRequestId,
        metadataJson: args.metadata ?? null
      });
    } catch (e) {
      this.logger.warn(`Learning memory write skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

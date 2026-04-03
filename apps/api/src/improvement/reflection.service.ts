import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ReflectionEventEntity } from "../db/entities/reflection-event.entity";
import { ImprovementEvaluationService } from "./improvement-evaluation.service";

@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);

  constructor(
    @InjectRepository(ReflectionEventEntity) private readonly reflections: Repository<ReflectionEventEntity>,
    private readonly evaluation: ImprovementEvaluationService
  ) {}

  async logChatReflection(args: {
    userId: string;
    correlationId: string;
    success: boolean;
    latencyMs: number;
    errorClass?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const row = this.reflections.create({
        user: { id: args.userId } as any,
        correlationId: args.correlationId,
        taskType: "chat_infer",
        success: args.success,
        latencyMs: args.latencyMs,
        errorClass: args.errorClass ?? null,
        summary: args.summary?.slice(0, 500) ?? null,
        metadata: args.metadata ?? null
      });
      await this.reflections.save(row);
      void this.evaluation.evaluateRecentPatterns(args.userId).catch((e) => {
        this.logger.warn(`improvement evaluation skipped: ${e instanceof Error ? e.message : String(e)}`);
      });
    } catch (e) {
      this.logger.warn(`reflection log failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async logSandboxReflection(args: {
    userId: string;
    correlationId: string;
    taskType: string;
    success: boolean;
    latencyMs: number;
    errorClass?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const row = this.reflections.create({
        user: { id: args.userId } as any,
        correlationId: args.correlationId,
        taskType: args.taskType,
        success: args.success,
        latencyMs: args.latencyMs,
        errorClass: args.errorClass ?? null,
        summary: args.summary?.slice(0, 500) ?? null,
        metadata: args.metadata ?? null
      });
      await this.reflections.save(row);
      void this.evaluation.evaluateRecentPatterns(args.userId).catch((e) => {
        this.logger.warn(`improvement evaluation skipped: ${e instanceof Error ? e.message : String(e)}`);
      });
    } catch (e) {
      this.logger.warn(`sandbox reflection log failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

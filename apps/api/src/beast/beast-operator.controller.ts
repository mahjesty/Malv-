import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThanOrEqual, Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";

@Controller("v1/beast")
export class BeastOperatorController {
  constructor(
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>,
    @InjectRepository(SuggestionRecordEntity) private readonly suggestions: Repository<SuggestionRecordEntity>
  ) {}

  @Get("operator-summary")
  @UseGuards(JwtAuthGuard)
  async operatorSummary(@Req() req: Request) {
    const user = (req as any).user as { sub?: string; id?: string };
    const userId = user?.sub ?? user?.id;
    if (!userId) return { ok: false, error: "Unauthorized" };

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [chatJobs24h, suggestions24h, lastSuggestion] = await Promise.all([
      this.aiJobs.count({
        where: {
          user: { id: userId },
          jobType: "beast_chat_infer",
          createdAt: MoreThanOrEqual(dayAgo)
        }
      }),
      this.suggestions.count({
        where: {
          user: { id: userId },
          createdAt: MoreThanOrEqual(dayAgo)
        }
      }),
      this.suggestions.findOne({
        where: { user: { id: userId } },
        order: { createdAt: "DESC" }
      })
    ]);

    return {
      ok: true,
      summary: {
        beastChatJobsLast24h: chatJobs24h,
        suggestionRecordsLast24h: suggestions24h,
        latestSuggestionPreview: lastSuggestion ? lastSuggestion.content.slice(0, 280) : null,
        latestSuggestionAt: lastSuggestion?.createdAt ?? null
      }
    };
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ImprovementProposalEntity, type ImprovementProposalStatus } from "../db/entities/improvement-proposal.entity";
import { ImprovementApplicationService } from "./improvement-application.service";

@Injectable()
export class ImprovementProposalService {
  constructor(
    @InjectRepository(ImprovementProposalEntity) private readonly proposals: Repository<ImprovementProposalEntity>,
    private readonly application: ImprovementApplicationService
  ) {}

  async listPendingAndRecent(args: { limit: number }) {
    const rows = await this.proposals.find({
      order: { createdAt: "DESC" },
      take: args.limit
    });
    return rows;
  }

  async createHeuristic(args: {
    description: string;
    affectedSystem: string;
    suggestion: Record<string, unknown>;
    confidence: number;
    correlationIds: string[];
  }): Promise<ImprovementProposalEntity | null> {
    const dup = await this.proposals.findOne({
      where: { status: "pending" as ImprovementProposalStatus, affectedSystem: args.affectedSystem }
    });
    if (dup) return null;

    const row = this.proposals.create({
      description: args.description,
      affectedSystem: args.affectedSystem,
      suggestion: args.suggestion,
      confidence: args.confidence,
      status: "pending",
      correlationIds: args.correlationIds
    });
    return this.proposals.save(row);
  }

  async findOne(id: string) {
    return this.proposals.findOne({ where: { id } });
  }

  async markRejected(id: string, adminUserId: string, reason?: string) {
    const row = await this.proposals.findOne({ where: { id } });
    if (!row || row.status !== "pending") return null;
    row.status = "rejected";
    row.decidedAt = new Date();
    row.decidedBy = { id: adminUserId } as any;
    row.rejectionReason = reason ?? null;
    return this.proposals.save(row);
  }

  async approveAndApply(id: string, adminUserId: string) {
    const row = await this.proposals.findOne({ where: { id } });
    if (!row || row.status !== "pending") throw new NotFoundException("Proposal not found or not pending.");
    await this.application.applyApprovedProposal(row);
    row.status = "applied";
    row.decidedAt = new Date();
    row.decidedBy = { id: adminUserId } as any;
    row.appliedPayload = row.suggestion;
    row.appliedAt = new Date();
    return this.proposals.save(row);
  }
}

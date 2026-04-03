import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkspaceActivityEventEntity, type WorkspaceActivityType } from "../db/entities/workspace-activity-event.entity";

@Injectable()
export class WorkspaceActivityService {
  constructor(
    @InjectRepository(WorkspaceActivityEventEntity)
    private readonly events: Repository<WorkspaceActivityEventEntity>
  ) {}

  async record(args: {
    userId: string;
    activityType: WorkspaceActivityType;
    title: string;
    workspaceId?: string | null;
    roomId?: string | null;
    conversationId?: string | null;
    entityId?: string | null;
    payloadJson?: Record<string, unknown> | null;
  }) {
    const row = this.events.create({
      user: { id: args.userId } as any,
      activityType: args.activityType,
      title: args.title.slice(0, 240),
      workspaceId: args.workspaceId ?? null,
      roomId: args.roomId ?? null,
      conversationId: args.conversationId ?? null,
      entityId: args.entityId ?? null,
      payloadJson: args.payloadJson ?? null
    });
    return await this.events.save(row);
  }

  async listForUser(args: { userId: string; limit?: number }) {
    const take = Math.min(200, Math.max(1, args.limit ?? 50));
    return await this.events.find({
      where: { user: { id: args.userId } },
      order: { createdAt: "DESC" },
      take
    });
  }
}

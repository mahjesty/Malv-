import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MessageEntity } from "../db/entities/message.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { CollaborationSummaryEntity, type CollaborationSummaryTrigger } from "../db/entities/collaboration-summary.entity";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WorkspaceActivityService } from "../workspace/workspace-activity.service";

@Injectable()
export class CollaborationSummaryService {
  private readonly inactivityTimers = new Map<string, NodeJS.Timeout>();
  private readonly threshold = Number(process.env.COLLAB_SUMMARY_MESSAGE_THRESHOLD ?? 24);
  private readonly inactivityMs = Number(process.env.COLLAB_SUMMARY_INACTIVITY_MS ?? 3 * 60 * 1000);

  constructor(
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(CollaborationSummaryEntity) private readonly summaries: Repository<CollaborationSummaryEntity>,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly activity: WorkspaceActivityService
  ) {}

  async listForRoom(args: { roomId: string; limit?: number }) {
    const take = Math.min(100, Math.max(1, args.limit ?? 20));
    return await this.summaries.find({
      where: { room: { id: args.roomId } },
      order: { createdAt: "DESC" },
      take
    });
  }

  async onConversationMessage(args: { roomId: string; conversationId: string; actorUserId: string }) {
    await this.generateIfNeeded({
      roomId: args.roomId,
      conversationId: args.conversationId,
      actorUserId: args.actorUserId,
      triggerKind: "message_threshold"
    });

    const timerKey = `${args.roomId}:${args.conversationId}`;
    const existing = this.inactivityTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.inactivityTimers.delete(timerKey);
      void this.generateIfNeeded({
        roomId: args.roomId,
        conversationId: args.conversationId,
        actorUserId: args.actorUserId,
        triggerKind: "inactivity_window"
      });
    }, Math.max(30_000, this.inactivityMs));
    this.inactivityTimers.set(timerKey, timer);
  }

  private async generateIfNeeded(args: {
    roomId: string;
    conversationId: string;
    actorUserId: string;
    triggerKind: CollaborationSummaryTrigger;
  }) {
    const rows = await this.messages.find({
      where: { conversation: { id: args.conversationId } },
      order: { createdAt: "DESC" },
      take: Math.max(this.threshold + 5, 40)
    });
    if (rows.length === 0) return;
    const latest = [...rows].reverse();
    const lastSummary = await this.summaries.findOne({
      where: { room: { id: args.roomId }, conversation: { id: args.conversationId } },
      order: { createdAt: "DESC" }
    });
    const since = lastSummary?.createdAt?.getTime() ?? 0;
    const sinceRows = latest.filter((m) => m.createdAt.getTime() > since);
    if (args.triggerKind === "message_threshold" && sinceRows.length < this.threshold) return;
    if (args.triggerKind === "inactivity_window" && sinceRows.length < 2) return;

    const userTurns = sinceRows.filter((m) => m.role === "user").length;
    const assistantTurns = sinceRows.filter((m) => m.role === "assistant").length;
    const systemTurns = sinceRows.filter((m) => m.role === "system").length;
    const recentTopics = sinceRows
      .map((m) => (m.content ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(-8)
      .map((x) => x.slice(0, 140));

    const summaryJson: Record<string, unknown> = {
      headline: `Collaboration snapshot with ${sinceRows.length} new messages`,
      stats: { userTurns, assistantTurns, systemTurns },
      recentTopics,
      generatedAt: Date.now(),
      trigger: args.triggerKind
    };

    const row = this.summaries.create({
      room: { id: args.roomId } as any,
      conversation: { id: args.conversationId } as any,
      createdByUser: { id: args.actorUserId } as any,
      triggerKind: args.triggerKind,
      messageCount: sinceRows.length,
      summaryJson
    });
    const saved = await this.summaries.save(row);
    const room = await this.rooms.findOne({ where: { id: args.roomId } });
    await this.activity.record({
      userId: args.actorUserId,
      activityType: "collaboration_summary_ready",
      roomId: args.roomId,
      conversationId: args.conversationId,
      entityId: saved.id,
      title: "Collaboration summary generated",
      payloadJson: { summaryId: saved.id, trigger: args.triggerKind, messageCount: sinceRows.length }
    });
    this.realtime.emitToRoom(args.roomId, "room:summary_ready", {
      roomId: args.roomId,
      conversationId: args.conversationId,
      summaryId: saved.id,
      triggerKind: saved.triggerKind,
      messageCount: saved.messageCount,
      summary: saved.summaryJson,
      workspaceId: room?.id ?? null
    });
  }
}

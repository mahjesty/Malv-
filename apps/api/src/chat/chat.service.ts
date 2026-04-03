import { forwardRef, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { BeastOrchestratorService } from "../beast/beast.orchestrator.service";
import type { MalvInputMetadata } from "../beast/chat-context-assembly.service";
import { ConversationEntity, type ConversationMode } from "../db/entities/conversation.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { MessageEntity, type MessageRole } from "../db/entities/message.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { UserEntity } from "../db/entities/user.entity";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { ChatRunRegistryService } from "./chat-run-registry.service";
import { CollaborationSummaryService } from "../collaboration/collaboration-summary.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

export type ChatHandleResult = {
  reply: string;
  meta?: Record<string, unknown>;
  conversationId: string;
  runId: string;
  interrupted?: boolean;
  assistantMessageId: string;
  /** When true, caller must invoke finalizeAssistantTurn after streaming */
  deferAssistantPersist?: boolean;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(forwardRef(() => BeastOrchestratorService)) private readonly beast: BeastOrchestratorService,
    private readonly cfg: ConfigService,
    private readonly killSwitch: KillSwitchService,
    private readonly runRegistry: ChatRunRegistryService,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(RoomMemberEntity) private readonly roomMembers: Repository<RoomMemberEntity>,
    private readonly collaborationSummary: CollaborationSummaryService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway
  ) {}

  /**
   * Persist final assistant row after WS chunk loop (supports partial text on cancel mid-stream).
   */
  async finalizeAssistantTurn(args: {
    userId: string;
    conversationId: string;
    assistantMessageId: string;
    runId: string;
    content: string;
    status: "done" | "interrupted";
    meta?: Record<string, unknown>;
    source?: string;
  }) {
    const row = await this.messages.findOne({
      where: { id: args.assistantMessageId, user: { id: args.userId }, conversation: { id: args.conversationId } }
    });
    if (!row) {
      this.logger.warn(`[MALV CHAT] finalizeAssistantTurn missing row id=${args.assistantMessageId}`);
      return;
    }
    row.content = args.content;
    row.status = args.status;
    row.source = args.source ?? (args.status === "interrupted" ? "interrupted" : "beast_pipeline");
    row.run = { id: args.runId } as AiJobEntity;
    row.metadata = {
      ...(args.meta ?? {}),
      runId: args.runId,
      malvPlaceholder: false,
      malvTerminal: args.status === "interrupted" ? "interrupted" : "completed"
    };
    await this.messages.save(row);
    this.logger.log(
      `[MALV CHAT] reply persisted messageId=${args.assistantMessageId} status=${args.status} replyLen=${args.content.length}`
    );
  }

  /**
   * Ensures a visible assistant string for non-interrupted turns.
   * Set MALV_BRAIN_PROOF_NONEMPTY=true to force the proof line (remove after transport verification).
   */
  private ensureVisibleReply(reply: string | undefined, interrupted: boolean | undefined): string {
    if (interrupted) {
      return reply ?? "";
    }
    const trimmed = (reply ?? "").trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    const proofOn =
      this.cfg.get<string>("MALV_BRAIN_PROOF_NONEMPTY") === "true" ||
      process.env.MALV_BRAIN_PROOF_NONEMPTY === "true";
    if (proofOn) {
      this.logger.warn("[MALV BRAIN PROOF] forcing non-empty reply");
      return "MALV core active. This is a verified backend response.";
    }
    this.logger.error(
      "[MALV CHAT] empty final reply after orchestrator — emitting diagnostic (check [MALV BRAIN] worker/fallback lengths)"
    );
    return "MALV finished this turn but the combined worker and fallback layers returned no visible text. Check API logs for [MALV BRAIN] worker reply length and [MALV BRAIN] fallback reply length, and worker logs for infer_return.";
  }

  async handleChat(args: {
    userId: string;
    conversationId: string | null;
    message: string;
    beastLevel?: "Passive" | "Smart" | "Advanced" | "Beast";
    userRole?: "admin" | "user";
    workspaceId?: string | null;
    vaultSessionId?: string | null;
    assistantMessageId?: string | null;
    abortSignal?: AbortSignal;
    runRegistryManagedExternally?: boolean;
    inputMeta?: MalvInputMetadata | null;
    /** WebSocket: persist assistant only after streaming */
    deferAssistantPersist?: boolean;
  }): Promise<ChatHandleResult> {
    this.logger.log(
      `[MALV CHAT] request received userId=${args.userId} conversationId=${args.conversationId ?? "new"} assistantMessageId=${args.assistantMessageId ?? "none"}`
    );

    await this.killSwitch.ensureSystemOnOrThrow({ reason: "chat_api_mutation" });

    const userRef = { id: args.userId } as any as UserEntity;

    let conversation: ConversationEntity;
    if (args.conversationId) {
      const found = await this.conversations.findOne({
        where: { id: args.conversationId },
        relations: { user: true }
      });
      if (!found) {
        throw new UnauthorizedException("Conversation not found.");
      }

      if (found.mode !== "collaboration") {
        if (found.user?.id !== args.userId) {
          throw new UnauthorizedException("Conversation not found.");
        }
      } else {
        const room = await this.rooms.findOne({ where: { conversationId: found.id } });
        if (!room) throw new UnauthorizedException("Conversation not found.");
        const membership = await this.roomMembers.findOne({
          where: { room: { id: room.id }, user: { id: args.userId } }
        });
        if (!membership) throw new UnauthorizedException("Conversation not found.");
      }

      conversation = found;
      this.logger.log(`[MALV E2E] conversation found conversationId=${conversation.id} mode=${conversation.mode}`);
    } else {
      const mode: ConversationMode = "companion";
      conversation = this.conversations.create({
        user: userRef,
        title: args.message.slice(0, 48),
        mode
      });
      await this.conversations.save(conversation);
      this.logger.log(`[MALV E2E] conversation created conversationId=${conversation.id}`);
    }

    const userMsgId = randomUUID();
    const userMsg: MessageEntity = this.messages.create({
      id: userMsgId,
      conversation,
      user: userRef,
      role: "user" as MessageRole,
      content: args.message,
      status: "sent",
      source: "malv_chat",
      metadata: { beastLevel: args.beastLevel ?? "Smart", ...(args.inputMeta ? { inputMeta: args.inputMeta } : {}) }
    });
    await this.messages.save(userMsg);
    this.logger.log(`[MALV E2E] user message persisted messageId=${userMsg.id}`);
    await this.emitRealtimeMessageUpdate({
      actorUserId: args.userId,
      conversation,
      message: userMsg
    });

    const assistantId = args.assistantMessageId ?? randomUUID();
    const assistantPlaceholder: MessageEntity = this.messages.create({
      id: assistantId,
      conversation,
      user: userRef,
      role: "assistant" as MessageRole,
      content: "",
      status: "thinking",
      source: "malv_pending",
      metadata: { malvPlaceholder: true }
    });
    await this.messages.save(assistantPlaceholder);
    this.logger.log(`[MALV CHAT] assistant placeholder persisted messageId=${assistantId} status=thinking`);

    const ac = !args.runRegistryManagedExternally && args.assistantMessageId ? new AbortController() : null;
    const signal = args.abortSignal ?? ac?.signal;

    if (ac && args.assistantMessageId) {
      this.runRegistry.registerTurn({
        assistantMessageId: args.assistantMessageId,
        userId: args.userId,
        abortController: ac
      });
    }

    try {
      const beastRes = await this.beast.handleChat({
        userId: args.userId,
        conversationId: conversation.id,
        message: args.message,
        beastLevel: args.beastLevel,
        userRole: args.userRole ?? "user",
        workspaceId: args.workspaceId ?? null,
        vaultSessionId: args.vaultSessionId ?? null,
        assistantMessageId: assistantId,
        abortSignal: signal,
        inputMeta: args.inputMeta ?? null
      });

      const beforeGuarantee = beastRes.reply ?? "";
      const visibleReply = this.ensureVisibleReply(beastRes.reply, beastRes.interrupted);
      this.logger.log(
        `[MALV BRAIN] orchestration complete replyLenBeforeGuarantee=${beforeGuarantee.length} replyLenAfter=${visibleReply.length} runId=${beastRes.runId} interrupted=${Boolean(beastRes.interrupted)} defer=${Boolean(args.deferAssistantPersist)}`
      );

      const metaOut = {
        ...(beastRes.meta ?? {}),
        runId: beastRes.runId,
        malvTerminal: beastRes.interrupted ? "interrupted" : "completed",
        ...(visibleReply !== beforeGuarantee
          ? { malvReplyCoerced: true, malvReplyLenBeforeCoerce: beforeGuarantee.length }
          : {})
      };

      if (beastRes.interrupted) {
        await this.finalizeAssistantTurn({
          userId: args.userId,
          conversationId: conversation.id,
          assistantMessageId: assistantId,
          runId: beastRes.runId,
          content: visibleReply,
          status: "interrupted",
          meta: metaOut,
          source: String(beastRes.meta?.malvReplySource ?? "interrupted")
        });
      } else if (!args.deferAssistantPersist) {
        await this.finalizeAssistantTurn({
          userId: args.userId,
          conversationId: conversation.id,
          assistantMessageId: assistantId,
          runId: beastRes.runId,
          content: visibleReply,
          status: "done",
          meta: metaOut,
          source: String(beastRes.meta?.malvReplySource ?? "beast_pipeline")
        });
      }
      if (!args.deferAssistantPersist || beastRes.interrupted) {
        const finalAssistant = await this.messages.findOne({ where: { id: assistantId } });
        if (finalAssistant) {
          await this.emitRealtimeMessageUpdate({
            actorUserId: args.userId,
            conversation,
            message: finalAssistant
          });
        }
      }

      return {
        reply: visibleReply,
        meta: metaOut,
        conversationId: conversation.id,
        runId: beastRes.runId,
        interrupted: beastRes.interrupted,
        assistantMessageId: assistantId,
        deferAssistantPersist: Boolean(args.deferAssistantPersist) && !beastRes.interrupted
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV CHAT] handleChat failed ${msg}`);
      await this.messages.update(
        { id: assistantId },
        {
          content: `MALV could not complete this turn: ${msg}`,
          status: "error",
          source: "malv_error",
          metadata: { malvPlaceholder: false, error: msg }
        }
      );
      throw e;
    } finally {
      if (ac && args.assistantMessageId) {
        this.runRegistry.unregisterTurn(args.assistantMessageId);
      }
    }
  }

  private async emitRealtimeMessageUpdate(args: {
    actorUserId: string;
    conversation: ConversationEntity;
    message: MessageEntity;
  }) {
    this.realtime.emitToUser(args.actorUserId, "workspace:message_new", {
      conversationId: args.conversation.id,
      messageId: args.message.id,
      role: args.message.role,
      status: args.message.status,
      source: args.message.source ?? null,
      createdAt: args.message.createdAt?.toISOString?.() ?? new Date().toISOString()
    });
    if (args.conversation.mode !== "collaboration") return;
    const room = await this.rooms.findOne({ where: { conversationId: args.conversation.id } });
    if (!room) return;
    this.realtime.emitToRoom(room.id, "room:message_new", {
      roomId: room.id,
      conversationId: args.conversation.id,
      messageId: args.message.id,
      role: args.message.role,
      status: args.message.status,
      source: args.message.source ?? null,
      createdAt: args.message.createdAt?.toISOString?.() ?? new Date().toISOString()
    });
    await this.collaborationSummary.onConversationMessage({
      roomId: room.id,
      conversationId: args.conversation.id,
      actorUserId: args.actorUserId
    });
  }
}

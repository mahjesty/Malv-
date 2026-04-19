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
import { MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE } from "../beast/malv-chat-agent-unavailable.constants";
import { sanitizeMalvChatAssistantMetaForUser } from "../beast/malv-chat-assistant-meta-sanitize.util";
import type { MalvAssistantTurnOutcome } from "../inference/malv-local-inference-execution-result";
import { MalvValidationTelemetryService } from "../common/malv-validation-telemetry.service";
import { enforceMalvFinalReplyIdentityPolicy } from "../beast/malv-final-reply-identity-validator";
import { assertMalvAssistantIdentityGate } from "../beast/malv-finalize-assistant-output.util";
import { applyMalvAssistantVisibleCompletionBackstop } from "../beast/malv-turn-outcome-backstop.util";

export type MalvAssistantStreamChunkEvt = {
  conversationId: string;
  runId: string;
  text: string;
  /** Always false — terminal done is sent once via `malv:orchestration` after finalization. */
  done: false;
};

export type ChatHandleResult = {
  reply: string;
  meta?: Record<string, unknown>;
  conversationId: string;
  runId: string;
  interrupted?: boolean;
  assistantMessageId: string;
  /** When true, caller must invoke finalizeAssistantTurn after streaming */
  deferAssistantPersist?: boolean;
  /** Canonical turn outcome for WS finalization (mirrors meta.malvTurnOutcome when set). */
  malvTurnOutcome?: MalvAssistantTurnOutcome;
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
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly validationTelemetry: MalvValidationTelemetryService
  ) {}

  /**
   * Single canonical persistence path for an assistant turn (HTTP or WS).
   */
  async finalizeAssistantTurn(args: {
    userId: string;
    conversationId: string;
    assistantMessageId: string;
    runId: string;
    content: string;
    status: "done" | "interrupted" | "error";
    /** Refines UX for successful rows; ignored when status is interrupted. */
    malvTurnOutcome?: Extract<MalvAssistantTurnOutcome, "complete" | "partial_done">;
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
    const failedBeforeOutput = args.status === "error";
    const initialMetaTurn: MalvAssistantTurnOutcome | undefined = failedBeforeOutput
      ? "failed_before_output"
      : args.status === "interrupted"
        ? undefined
        : args.malvTurnOutcome === "partial_done"
          ? "partial_done"
          : "complete";

    /** Final identity gate on every persisted assistant body (or empty probe when status=error). */
    const identityValidated = enforceMalvFinalReplyIdentityPolicy(args.content ?? "");
    row.content = failedBeforeOutput ? "" : identityValidated.text;
    row.status = args.status === "interrupted" ? "interrupted" : failedBeforeOutput ? "error" : "done";
    row.source =
      args.source ??
      (args.status === "interrupted" ? "interrupted" : failedBeforeOutput ? "malv_chat_failed_before_output" : "beast_pipeline");
    row.run = { id: args.runId } as AiJobEntity;
    const backstop = initialMetaTurn
      ? applyMalvAssistantVisibleCompletionBackstop({
          meta: {
            ...(args.meta ?? {}),
            malvTurnOutcome: initialMetaTurn
          },
          reply: identityValidated.text,
          runId: args.runId,
          logger: this.logger,
          logContext: "assistant_message_persist"
        })
      : null;
    const finalTurnOutcome = backstop?.outcome ?? initialMetaTurn;
    const finalMeta = backstop?.meta ?? { ...(args.meta ?? {}) };
    row.metadata = {
      ...finalMeta,
      runId: args.runId,
      malvPlaceholder: false,
      malvTerminal: args.status === "interrupted" ? "interrupted" : failedBeforeOutput ? "error" : "completed",
      ...(identityValidated
        ? {
            malvFinalIdentityEnforcementMode: identityValidated.mode,
            malvFinalIdentityViolation: identityValidated.hadViolation
          }
        : {}),
      ...(finalTurnOutcome !== undefined ? { malvTurnOutcome: finalTurnOutcome } : {})
    };
    await this.messages.save(row);
    this.logger.log(
      `[MALV CHAT] assistant_finalized messageId=${args.assistantMessageId} rowStatus=${row.status} turnOutcome=${finalTurnOutcome ?? "n/a"} replyLen=${failedBeforeOutput ? 0 : args.content.length} runId=${args.runId}`
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
      return assertMalvAssistantIdentityGate(trimmed);
    }
    const proofOn =
      this.cfg.get<string>("MALV_BRAIN_PROOF_NONEMPTY") === "true" ||
      process.env.MALV_BRAIN_PROOF_NONEMPTY === "true";
    if (proofOn) {
      this.logger.warn("[MALV BRAIN PROOF] forcing non-empty reply");
      return "MALV core active. This is a verified backend response.";
    }
    this.logger.error(
      "[MALV CHAT] empty final reply after orchestrator — emitting user-safe notice (see [MALV BRAIN] worker/fallback logs)"
    );
    return MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE;
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
    /** WebSocket: real-time local inference tokens (see BeastOrchestratorService). */
    onAssistantStreamChunk?: (evt: MalvAssistantStreamChunkEvt) => void;
  }): Promise<ChatHandleResult> {
    const requestReceivedAtMs = Date.now();
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
        inputMeta: args.inputMeta ?? null,
        onAssistantStreamChunk: args.onAssistantStreamChunk
      });

      const beforeGuarantee = beastRes.reply ?? "";
      if (!args.onAssistantStreamChunk) {
        this.validationTelemetry.startTurn({
          runId: beastRes.runId,
          transport: "http",
          requestReceivedAtMs
        });
      }
      const visibleReply = this.ensureVisibleReply(beastRes.reply, beastRes.interrupted);
      this.logger.log(
        `[MALV BRAIN] orchestration complete replyLenBeforeGuarantee=${beforeGuarantee.length} replyLenAfter=${visibleReply.length} runId=${beastRes.runId} interrupted=${Boolean(beastRes.interrupted)} defer=${Boolean(args.deferAssistantPersist)}`
      );

      const metaOut: Record<string, unknown> = {
        ...(beastRes.meta ?? {}),
        runId: beastRes.runId,
        malvTerminal: beastRes.interrupted ? "interrupted" : "completed",
        ...(visibleReply !== beforeGuarantee
          ? { malvReplyCoerced: true, malvReplyLenBeforeCoerce: beforeGuarantee.length }
          : {})
      };
      if (!args.onAssistantStreamChunk) {
        this.validationTelemetry.completeTurn({
          runId: beastRes.runId,
          transport: "http",
          meta: metaOut,
          requestReceivedAtMs
        });
      }

      const turnOutcomeFromMeta = metaOut["malvTurnOutcome"] as MalvAssistantTurnOutcome | undefined;
      const malvTurnOutcome: MalvAssistantTurnOutcome | undefined =
        turnOutcomeFromMeta === "partial_done" || turnOutcomeFromMeta === "complete" || turnOutcomeFromMeta === "failed_before_output"
          ? turnOutcomeFromMeta
          : undefined;

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
          malvTurnOutcome: malvTurnOutcome === "partial_done" ? "partial_done" : "complete",
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
        deferAssistantPersist: Boolean(args.deferAssistantPersist) && !beastRes.interrupted,
        malvTurnOutcome
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV CHAT] handleChat failed internalDetail=${msg.replace(/\s+/g, " ").slice(0, 800)}`);
      const errorRunId = randomUUID();
      const safeMeta = sanitizeMalvChatAssistantMetaForUser({
        runId: errorRunId,
        malvReplySource: "chat_api_exception_safe_reply",
        malvTurnFailed: true,
        malvTerminal: "error"
      });
      this.validationTelemetry.completeTurn({
        runId: errorRunId,
        transport: args.onAssistantStreamChunk ? "ws" : "http",
        meta: safeMeta,
        requestReceivedAtMs
      });
      await this.messages.update(
        { id: assistantId },
        {
          content: MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE,
          status: "done",
          source: "malv_chat_safe_error_reply",
          metadata: {
            ...safeMeta,
            malvPlaceholder: false
          }
        }
      );
      const finalAssistant = await this.messages.findOne({ where: { id: assistantId } });
      if (finalAssistant) {
        await this.emitRealtimeMessageUpdate({
          actorUserId: args.userId,
          conversation,
          message: finalAssistant
        });
      }
      return {
        reply: MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE,
        meta: safeMeta,
        conversationId: conversation.id,
        runId: errorRunId,
        interrupted: false,
        assistantMessageId: assistantId,
        deferAssistantPersist: false
      };
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

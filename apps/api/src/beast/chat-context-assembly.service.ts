import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { VaultSessionEntity } from "../db/entities/vault-session.entity";
import { MemoryService } from "../memory/memory.service";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceApprovalItemEntity } from "../db/entities/workspace-approval-item.entity";
import {
  formatStructuredContextForPrompt,
  type StructuredContext,
  type StructuredContextSignal
} from "./structured-context";
import type { MalvUserMoodHint } from "./malv-conversation-signals";

export type { MalvUserMoodHint } from "./malv-conversation-signals";

export type MalvInputMetadata = {
  inputMode?: "text" | "voice" | "video";
  sessionType?: string | null;
  callId?: string | null;
  audioContext?: string | null;
  transcriptChunkRef?: string | null;
  operatorPhase?: string | null;
  /** Explicit Super Fix flow (or use natural-language triggers). */
  superFix?: boolean;
  /** Phase 5 — biases response policy with text-derived tone (workspace / composer). */
  userMoodHint?: MalvUserMoodHint | null;
};

export type AssembledChatContext = {
  priorMessages: Array<{ role: string; content: string; createdAt?: string }>;
  conversationTitle: string | null;
  conversationMode: string;
  /** For collaboration mode only: used to scope collaboration memory context. */
  collaborationRoomId?: string | null;
  memorySnippets: Array<{ title: string | null; content: string; scope: string }>;
  vaultScoped: boolean;
  beastLevel: string;
  userMessage: string;
  inputMeta: MalvInputMetadata;
  /** Legacy flat block — same as structured prompt string for compatibility. */
  contextBlock: string;
  structured: StructuredContext;
  contextChars: number;
};

const DEFAULT_MAX_CONTEXT_CHARS = 10_000;

@Injectable()
export class ChatContextAssemblyService {
  private readonly logger = new Logger(ChatContextAssemblyService.name);

  constructor(
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(VaultSessionEntity) private readonly vaultSessions: Repository<VaultSessionEntity>,
    @InjectRepository(RoomMemberEntity) private readonly roomMembers: Repository<RoomMemberEntity>,
    @InjectRepository(WorkspaceTaskEntity) private readonly tasks: Repository<WorkspaceTaskEntity>,
    @InjectRepository(WorkspaceApprovalItemEntity) private readonly approvals: Repository<WorkspaceApprovalItemEntity>,
    private readonly memory: MemoryService
  ) {}

  async assemble(args: {
    userId: string;
    conversationId: string;
    userMessage: string;
    beastLevel: string;
    vaultSessionId?: string | null;
    inputMeta?: MalvInputMetadata | null;
    historyLimit?: number;
    maxContextChars?: number;
  }): Promise<AssembledChatContext> {
    const historyLimit = args.historyLimit ?? 14;
    const maxContextChars = args.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;

    const conversation = await this.conversations.findOne({ where: { id: args.conversationId }, relations: { user: true } });
    if (!conversation) throw new Error("Conversation not found.");

    let collaborationRoomId: string | null = null;
    if (conversation.mode !== "collaboration") {
      if (conversation.user?.id !== args.userId) {
        throw new Error("Conversation not found or not owned by user.");
      }
    } else {
      const room = await this.rooms.findOne({ where: { conversationId: conversation.id } });
      if (room) {
        const membership = await this.roomMembers.findOne({ where: { room: { id: room.id }, user: { id: args.userId } } });
        if (!membership) {
          throw new Error("Conversation not found or not authorized for this room.");
        }
        collaborationRoomId = room.id;
      } else {
        throw new Error("Collaboration conversation is not linked to a room.");
      }
    }

    let vaultScoped = false;
    if (args.vaultSessionId) {
      const vs = await this.vaultSessions.findOne({
        where: { id: args.vaultSessionId, user: { id: args.userId }, status: "open" as const }
      });
      vaultScoped = Boolean(vs);
    }

    const priorRowsRaw = await this.messages.find({
      where: { conversation: { id: args.conversationId } },
      order: { createdAt: "DESC" },
      take: historyLimit + 6
    });
    priorRowsRaw.reverse();
    const priorRows = priorRowsRaw.filter((m) => {
      const meta = m.metadata as { malvPlaceholder?: boolean } | null | undefined;
      if (meta?.malvPlaceholder) return false;
      if (m.role === "assistant" && !(m.content ?? "").trim() && ["thinking", "streaming", "pending"].includes(m.status)) {
        return false;
      }
      return true;
    });
    const trimmed = priorRows.slice(-historyLimit);

    const priorMessages = trimmed.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt?.toISOString()
    }));

    const memoryRows = await this.memory.relevantSnippetsForContext({
      userId: args.userId,
      userMessage: args.userMessage,
      take: 8,
      includeVaultOnly: vaultScoped,
      collaborationRoomId
    });

    const memorySnippets = memoryRows.map((e) => ({
      title: e.title ?? null,
      content: e.content.slice(0, 600),
      scope: e.memoryScope
    }));

    const inputMeta = args.inputMeta ?? {};

    const signals: StructuredContextSignal[] = [];
    if (vaultScoped) {
      signals.push({
        kind: "vault",
        text: "Active vault session — sealed vault is isolated; do not infer vault secrets from general memory."
      });
    }
    if (inputMeta.operatorPhase) {
      signals.push({ kind: "operator", text: `Phase: ${inputMeta.operatorPhase}` });
    }
    if (inputMeta.sessionType && /\bsupport|ticket|helpdesk\b/i.test(inputMeta.sessionType)) {
      signals.push({ kind: "support", text: `Session type: ${inputMeta.sessionType}` });
    }
    if (inputMeta.inputMode && inputMeta.inputMode !== "text") {
      signals.push({ kind: "device", text: `Input mode: ${inputMeta.inputMode}` });
    }
    const taskWhere: any = { user: { id: args.userId }, status: "todo" as const };
    const approvalWhere: any = { user: { id: args.userId }, status: "pending" as const };
    if (conversation.mode === "collaboration" && collaborationRoomId) {
      // Hard room boundary: collaboration prompts only receive room-scoped task/approval context.
      taskWhere.roomId = collaborationRoomId;
      approvalWhere.roomId = collaborationRoomId;
    }

    const [openTasks, pendingApprovals] = await Promise.all([
      this.tasks.find({
        where: taskWhere,
        order: { updatedAt: "DESC" },
        take: 6
      }),
      this.approvals.find({
        where: approvalWhere,
        order: { updatedAt: "DESC" },
        take: 4
      })
    ]);
    if (openTasks.length > 0) {
      signals.push({
        kind: "operator",
        text: `Active tasks (${openTasks.length}): ${openTasks
          .slice(0, 4)
          .map((t) => t.title)
          .join(" | ")}`
      });
    }
    if (pendingApprovals.length > 0) {
      signals.push({
        kind: "support",
        text: `Pending approvals (${pendingApprovals.length}) include ${pendingApprovals
          .slice(0, 3)
          .map((a) => a.riskLevel)
          .join(", ")} risk items.`
      });
    }
    if (conversation.mode === "collaboration" && collaborationRoomId) {
      signals.push({
        kind: "operator",
        text: `Room boundary enforced: roomId=${collaborationRoomId}. Do not use cross-room memory, tasks, approvals, or thread data.`
      });
    }

    const topicPreview = args.userMessage.replace(/\s+/g, " ").trim().slice(0, 120);
    const summaryParts = [
      conversation?.title ? `Thread: ${conversation.title}` : "Thread: (untitled)",
      `Mode: ${conversation?.mode ?? "companion"}`,
      topicPreview ? `Current message topic: ${topicPreview}` : ""
    ].filter(Boolean);

    const structured: StructuredContext = {
      summary: summaryParts.join(" · "),
      relevantMemory: memorySnippets.map((s) => ({
        title: s.title,
        summary: s.content.replace(/\s+/g, " ").trim().slice(0, 200),
        scope: s.scope
      })),
      recentMessages: priorMessages.map((m) => ({
        role: m.role,
        content: m.content ?? "",
        createdAt: m.createdAt
      })),
      signals
    };

    const contextBlock = formatStructuredContextForPrompt(structured, maxContextChars);
    const contextChars = contextBlock.length;

    this.logger.log(
      `[MALV CHAT] context assembled conversationId=${args.conversationId} priorTurns=${priorMessages.length} memoryRows=${memorySnippets.length} vaultScoped=${vaultScoped} contextChars=${contextChars}`
    );

    return {
      priorMessages,
      conversationTitle: conversation?.title ?? null,
      conversationMode: conversation?.mode ?? "companion",
      collaborationRoomId,
      memorySnippets,
      vaultScoped,
      beastLevel: args.beastLevel,
      userMessage: args.userMessage,
      inputMeta,
      contextBlock,
      structured,
      contextChars
    };
  }
}

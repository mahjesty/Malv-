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
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import {
  formatStructuredContextForPrompt,
  type StructuredContext,
  type StructuredContextSignal
} from "./structured-context";
import {
  parseExploreHandoffJson,
  resolveExploreContextForMalvWithResolution
} from "./explore-handoff-prompt.util";
import {
  buildExploreFirstResponseAdvisory,
  formatExploreFirstResponsePolicyBlock,
  type ExploreFirstResponseAdvisory
} from "./explore-first-response-advisor";
import type { MalvUserMoodHint } from "./malv-conversation-signals";
import { malvLocalInferenceChatPathBlockedFromEnv } from "../inference/malv-chat-tier-availability.util";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV } from "../inference/malv-inference-env.util";
import { resolveMalvMemoryRetrievalPolicy, type MalvMemoryRetrievalPolicy } from "./malv-memory-retrieval-policy.util";

export type { MalvMemoryRetrievalPolicy } from "./malv-memory-retrieval-policy.util";

export type { MalvUserMoodHint } from "./malv-conversation-signals";

/** `simple` skips heavy operator fetches and tightens history/memory when safe (companion chat). */
export type ContextAssemblyTier = "full" | "simple";

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
  /** Explore → Chat handoff JSON (canonical v2; v1 normalized server-side). Orchestration-only. */
  exploreHandoffJson?: string | null;
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
  /** First-turn Explore handoff advisory (null when inapplicable or no valid handoff). */
  exploreFirstResponseAdvisory?: ExploreFirstResponseAdvisory | null;
  /** Internal prompt appendix for first Explore handoff turn only. */
  exploreFirstResponsePolicyBlock?: string | null;
};

const DEFAULT_MAX_CONTEXT_CHARS = 10_000;

function malvLocalCpuInferenceEnabledFromProcessEnv(): boolean {
  const raw = malvEnvFirst((k) => process.env[k], MALV_LOCAL_CPU_INFERENCE_ENV.ENABLED);
  if (raw == null || raw === "") return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/** Tighter history limits only when API-side local llama is actually eligible for chat turns. */
function malvLocalInferenceContextTuningActiveFromProcessEnv(): boolean {
  return malvLocalCpuInferenceEnabledFromProcessEnv() && !malvLocalInferenceChatPathBlockedFromEnv((k) => process.env[k]);
}

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
    @InjectRepository(BuildUnitEntity) private readonly buildUnits: Repository<BuildUnitEntity>,
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
    /** Proportional assembly: lighter fetches for companion-light turns (not env-only). */
    contextAssemblyTier?: ContextAssemblyTier;
    /** Optional override for memory retrieval; otherwise derived from tier + message heuristics. */
    memoryRetrievalPolicy?: MalvMemoryRetrievalPolicy | null;
    /** Phase 4 — adaptive length gate for simple-tier memory retrieval. */
    memoryCueLengthThreshold?: number;
  }): Promise<AssembledChatContext> {
    const localInferenceOn = malvLocalInferenceContextTuningActiveFromProcessEnv();
    const simpleTier = args.contextAssemblyTier === "simple";
    const historyLimit =
      args.historyLimit ??
      (simpleTier ? 5 : localInferenceOn ? 6 : 14);
    const maxContextChars =
      args.maxContextChars ??
      (simpleTier && localInferenceOn
        ? 3600
        : simpleTier
          ? 5500
          : localInferenceOn
            ? 4000
            : DEFAULT_MAX_CONTEXT_CHARS);

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

    const priorAssistantTexts = priorMessages
      .filter((m) => m.role === "assistant")
      .map((m) => String(m.content ?? "").trim())
      .filter((c) => c.length > 0);
    const isFirstThreadTurn = priorAssistantTexts.length === 0;

    let exploreFirstResponseAdvisory: ExploreFirstResponseAdvisory | null = null;
    let exploreFirstResponsePolicyBlock: string | null = null;

    const collaborationMode = conversation.mode === "collaboration";
    const memoryPolicy = resolveMalvMemoryRetrievalPolicy({
      override: args.memoryRetrievalPolicy ?? null,
      vaultScoped,
      collaborationMode,
      contextAssemblyTier: simpleTier ? "simple" : "full",
      userMessage: args.userMessage,
      memoryCueLengthThreshold: args.memoryCueLengthThreshold
    });

    const memoryTake = memoryPolicy === "full" ? 8 : 3;
    const memorySlice = memoryPolicy === "full" ? 600 : 420;
    const memoryRows =
      memoryPolicy === "skip"
        ? []
        : await this.memory.relevantSnippetsForContext({
            userId: args.userId,
            userMessage: args.userMessage,
            take: memoryTake,
            includeVaultOnly: vaultScoped,
            collaborationRoomId
          });

    const memorySnippets = memoryRows.map((e) => ({
      title: e.title ?? null,
      content: e.content.slice(0, memorySlice),
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
    const exploreRaw = inputMeta.exploreHandoffJson;
    if (typeof exploreRaw === "string" && exploreRaw.trim()) {
      const parsed = parseExploreHandoffJson(exploreRaw);
      if (parsed) {
        const resolved = await resolveExploreContextForMalvWithResolution({
          userId: args.userId,
          parsed,
          units: this.buildUnits
        });
        signals.push(...resolved.signals);
        if (isFirstThreadTurn) {
          exploreFirstResponseAdvisory = buildExploreFirstResponseAdvisory({
            parsed,
            resolution: resolved.resolution,
            unitHints: resolved.unitHints ?? null
          });
          exploreFirstResponsePolicyBlock = formatExploreFirstResponsePolicyBlock(exploreFirstResponseAdvisory);
        }
      }
    }
    const taskWhere: any = { user: { id: args.userId }, status: "todo" as const };
    const approvalWhere: any = { user: { id: args.userId }, status: "pending" as const };
    if (conversation.mode === "collaboration" && collaborationRoomId) {
      // Hard room boundary: collaboration prompts only receive room-scoped task/approval context.
      taskWhere.roomId = collaborationRoomId;
      approvalWhere.roomId = collaborationRoomId;
    }

    const fetchTasksAndApprovals =
      !simpleTier ||
      Boolean(args.inputMeta?.operatorPhase && String(args.inputMeta.operatorPhase).trim()) ||
      vaultScoped ||
      conversation.mode === "collaboration";

    const [openTasks, pendingApprovals] = fetchTasksAndApprovals
      ? await Promise.all([
          this.tasks.find({
            where: taskWhere,
            order: { updatedAt: "DESC" },
            take: simpleTier ? 4 : 6
          }),
          this.approvals.find({
            where: approvalWhere,
            order: { updatedAt: "DESC" },
            take: simpleTier ? 3 : 4
          })
        ])
      : [[], []];
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

    const lastAssistantRow = [...trimmed].reverse().find((m) => m.role === "assistant");
    if (lastAssistantRow) {
      const meta = lastAssistantRow.metadata as Record<string, unknown> | null | undefined;
      const ra = meta?.malvReliabilityAssessment as { tier?: string; evidenceScore?: number } | undefined;
      const priorTier = typeof ra?.tier === "string" ? ra.tier : "";
      const ev = typeof ra?.evidenceScore === "number" && !Number.isNaN(ra.evidenceScore) ? ra.evidenceScore : null;
      const weakPrior =
        priorTier === "ungrounded" ||
        priorTier === "weakly_grounded" ||
        (priorTier === "partially_grounded" && ev != null && ev < 0.22);
      if (weakPrior) {
        signals.push({
          kind: "continuity",
          text: "The last MALV assistant message was not strongly externally verified. For this follow-up, do not extend specific businesses, addresses, branch facts, hours, or image claims from that message as if they were confirmed; answer conditionally or say what is not verified instead of silently inheriting guesses."
        });
      }
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
      `[MALV CHAT] context assembled conversationId=${args.conversationId} tier=${simpleTier ? "simple" : "full"} memoryPolicy=${memoryPolicy} priorTurns=${priorMessages.length} memoryRows=${memorySnippets.length} vaultScoped=${vaultScoped} contextChars=${contextChars}`
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
      contextChars,
      exploreFirstResponseAdvisory,
      exploreFirstResponsePolicyBlock
    };
  }

  /**
   * Minimal thread load for Tier-0 reflex turns — must block: auth + recent messages for repetition/beast-signal.
   * Does not fetch memory, tasks, approvals, or Explore handoff resolution (those belong on the normal path).
   */
  async loadReflexThreadSlice(args: {
    userId: string;
    conversationId: string;
    historyLimit?: number;
  }): Promise<{
    priorMessages: Array<{ role: string; content: string; createdAt?: string }>;
    conversationMode: string;
    isFirstThreadTurn: boolean;
  }> {
    const historyLimit = args.historyLimit ?? 12;
    const conversation = await this.conversations.findOne({ where: { id: args.conversationId }, relations: { user: true } });
    if (!conversation) throw new Error("Conversation not found.");

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
      } else {
        throw new Error("Collaboration conversation is not linked to a room.");
      }
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

    const priorAssistantTexts = priorMessages
      .filter((m) => m.role === "assistant")
      .map((m) => String(m.content ?? "").trim())
      .filter((c) => c.length > 0);
    const isFirstThreadTurn = priorAssistantTexts.length === 0;

    return {
      priorMessages,
      conversationMode: conversation.mode ?? "companion",
      isFirstThreadTurn
    };
  }
}

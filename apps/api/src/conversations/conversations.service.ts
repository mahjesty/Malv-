import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";

function conversationUpdatedAtMs(c: { updatedAt?: Date | null }): number {
  const d = c.updatedAt;
  if (!d) return 0;
  const t = d instanceof Date ? d.getTime() : Number(new Date(d));
  return Number.isFinite(t) ? t : 0;
}

/** Deep-clone JSON-like values for HTTP responses; avoids 500s from BigInt / non-JSON types in legacy metadata. */
function cloneJsonSafeForApi(raw: unknown): unknown | null {
  if (raw == null) return null;
  try {
    return JSON.parse(
      JSON.stringify(raw, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
    ) as unknown;
  } catch {
    return null;
  }
}

function normalizeMessageContent(raw: unknown): string {
  if (raw == null) return "";
  return typeof raw === "string" ? raw : String(raw);
}

function normalizeMessageStatus(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return "done";
}

function normalizeMessageRole(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return "user";
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(RoomMemberEntity) private readonly roomMembers: Repository<RoomMemberEntity>,
    private readonly killSwitch: KillSwitchService
  ) {}

  async listForUser(args: { userId: string; limit: number; offset: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_read" });

    const rawTake = args.limit + args.offset;
    // Use explicit FK column — avoids fragile JOIN + COUNT from findAndCount with nested `user: { id }`
    // (some MySQL/sql_mode combinations have surfaced 500s from the generated SQL).
    const [personalRows, personalTotal] = await this.conversations
      .createQueryBuilder("c")
      .where("c.user_id = :userId", { userId: args.userId })
      .orderBy("c.updatedAt", "DESC")
      .take(rawTake)
      .getManyAndCount();

    let collabRows: ConversationEntity[] = [];
    let collabTotal = 0;

    try {
      const memberships = await this.roomMembers.find({
        where: { user: { id: args.userId } },
        relations: { room: true },
        take: rawTake
      });
      const collabConversationIds = memberships
        .map((m) => m.room?.conversationId ?? null)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

      collabTotal = collabConversationIds.length;

      collabRows =
        collabConversationIds.length > 0
          ? await this.conversations.find({
              where: { id: In(collabConversationIds) },
              order: { updatedAt: "DESC" },
              take: rawTake
            })
          : [];
    } catch (e) {
      this.logger.warn(
        `listForUser: collaboration slice failed; returning personal conversations only. ${e instanceof Error ? e.message : String(e)}`
      );
      collabRows = [];
      collabTotal = 0;
    }

    const combined = [...personalRows, ...collabRows]
      .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
      .sort((a, b) => conversationUpdatedAtMs(b) - conversationUpdatedAtMs(a));
    const total = personalTotal + collabTotal;
    const sliced = combined.slice(args.offset, args.offset + args.limit);

    return {
      items: sliced.map((c) => ({
        id: c.id,
        title: c.title ?? null,
        mode: (c.mode ?? "companion") as ConversationEntity["mode"],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      })),
      total
    };
  }

  /**
   * Resolve collaboration room by shared thread FK. Prefer explicit `conversation_id` in QB over
   * `where: { conversationId }` on a @RelationId field — mis-generated SQL/metadata has caused lookup failures.
   */
  private async findRoomByConversationId(conversationId: string): Promise<CollaborationRoomEntity | null> {
    return this.rooms
      .createQueryBuilder("room")
      .where("room.conversation_id = :cid", { cid: conversationId })
      .getOne();
  }

  async getById(args: { userId: string; conversationId: string; messageLimit: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_read" });

    const conv = await this.conversations.findOne({ where: { id: args.conversationId }, relations: { user: true } });
    if (!conv) throw new NotFoundException("Conversation not found.");

    if (conv.mode !== "collaboration") {
      if (conv.user?.id !== args.userId) throw new NotFoundException("Conversation not found.");
    } else {
      const room = await this.findRoomByConversationId(conv.id);
      if (!room) throw new NotFoundException("Conversation not found.");
      const membership = await this.roomMembers.findOne({
        where: { room: { id: room.id }, user: { id: args.userId } }
      });
      if (!membership) throw new NotFoundException("Conversation not found.");
    }

    const take = Math.min(500, Math.max(1, Math.floor(Number(args.messageLimit))));
    // Newest-first slice, then chronological for the client (ASC + take alone returned the *oldest* N only).
    const rowsDesc = await this.messages
      .createQueryBuilder("m")
      .where("m.conversation_id = :cid", { cid: args.conversationId })
      .orderBy("m.createdAt", "DESC")
      .take(take)
      .getMany();
    const msgs = rowsDesc.slice().reverse();

    return {
      conversation: {
        id: conv.id,
        title: conv.title ?? null,
        mode: conv.mode ?? "companion",
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      },
      messages: msgs.map((m) => ({
        id: m.id,
        role: normalizeMessageRole(m.role),
        content: normalizeMessageContent(m.content),
        status: normalizeMessageStatus(m.status),
        source: m.source ?? null,
        createdAt: m.createdAt,
        metadata: cloneJsonSafeForApi(m.metadata)
      }))
    };
  }

  /**
   * Read/modify loop: assistant turns only, newest first — lightweight index for workspace panels
   * without re-fetching full thread content.
   */
  async listOutputsForUser(args: { userId: string; conversationId: string; limit: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_read" });

    const conv = await this.conversations.findOne({ where: { id: args.conversationId }, relations: { user: true } });
    if (!conv) throw new NotFoundException("Conversation not found.");

    if (conv.mode !== "collaboration") {
      if (conv.user?.id !== args.userId) throw new NotFoundException("Conversation not found.");
    } else {
      const room = await this.findRoomByConversationId(conv.id);
      if (!room) throw new NotFoundException("Conversation not found.");
      const membership = await this.roomMembers.findOne({
        where: { room: { id: room.id }, user: { id: args.userId } }
      });
      if (!membership) throw new NotFoundException("Conversation not found.");
    }

    const take = Math.min(100, Math.max(1, args.limit));
    const msgs = await this.messages.find({
      where: { conversation: { id: args.conversationId }, role: "assistant" },
      relations: { run: true },
      order: { createdAt: "DESC" },
      take
    });

    return {
      outputs: msgs.map((m) => {
        const text = normalizeMessageContent(m.content);
        const meta = cloneJsonSafeForApi(m.metadata);
        const metaKeys =
          meta != null && typeof meta === "object" && !Array.isArray(meta) ? Object.keys(meta as object) : [];
        return {
          messageId: m.id,
          runId: m.run?.id ?? null,
          createdAt: m.createdAt.toISOString(),
          preview: text.length > 400 ? `${text.slice(0, 400)}…` : text,
          source: m.source ?? null,
          status: normalizeMessageStatus(m.status),
          metadataKeys: metaKeys
        };
      })
    };
  }

  async renameForUser(args: { userId: string; conversationId: string; title: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_write" });

    const conv = await this.conversations.findOne({
      where: { id: args.conversationId, user: { id: args.userId } }
    });

    if (!conv) throw new NotFoundException("Conversation not found.");

    const trimmed = args.title.trim();
    if (!trimmed) throw new BadRequestException("Title cannot be empty.");

    conv.title = trimmed;
    await this.conversations.save(conv);
  }

  async deleteForUser(args: { userId: string; conversationId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_write" });

    const conv = await this.conversations.findOne({
      where: { id: args.conversationId, user: { id: args.userId } }
    });

    if (!conv) throw new NotFoundException("Conversation not found.");

    // Soft delete so the sidebar list stops showing the session immediately.
    await this.conversations.softRemove(conv);
  }

  async forkForUser(args: { userId: string; sourceConversationId: string; anchorMessageId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_write" });

    const sourceConversation = await this.conversations.findOne({
      where: { id: args.sourceConversationId, user: { id: args.userId } }
    });
    if (!sourceConversation) throw new NotFoundException("Conversation not found.");

    const sourceMessages = await this.messages.find({
      where: { conversation: { id: args.sourceConversationId }, user: { id: args.userId } },
      order: { createdAt: "ASC" }
    });
    if (!sourceMessages.length) throw new BadRequestException("Cannot fork an empty conversation.");

    const anchorIndex = sourceMessages.findIndex((m) => m.id === args.anchorMessageId);
    if (anchorIndex < 0) throw new NotFoundException("Fork anchor message not found.");

    const anchor = sourceMessages[anchorIndex]!;
    if (anchor.role !== "assistant") {
      throw new BadRequestException("Fork anchor must be an assistant message.");
    }

    const forkSlice = sourceMessages.slice(0, anchorIndex + 1);

    const baseTitle = (sourceConversation.title ?? "Session").trim() || "Session";
    const forkTitle = `${baseTitle} (fork)`.slice(0, 160);
    const userRef = { id: args.userId } as any;

    const forkConversation = this.conversations.create({
      user: userRef,
      mode: sourceConversation.mode,
      title: forkTitle
    });
    await this.conversations.save(forkConversation);

    const clonedRows = forkSlice.map((m) =>
      this.messages.create({
        id: randomUUID(),
        conversation: forkConversation,
        user: userRef,
        role: m.role,
        content: m.content,
        metadata: m.metadata ?? null,
        status: m.status,
        source: m.source ?? null
      })
    );
    await this.messages.save(clonedRows);

    return {
      conversation: {
        id: forkConversation.id,
        title: forkConversation.title ?? null,
        mode: forkConversation.mode,
        createdAt: forkConversation.createdAt,
        updatedAt: forkConversation.updatedAt
      },
      messages: clonedRows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        source: m.source ?? undefined,
        createdAt: m.createdAt,
        metadata: m.metadata ?? null
      }))
    };
  }

  /** Full thread copy (all messages) — companion sessions owned by the user only. */
  async duplicateForUser(args: { userId: string; sourceConversationId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "conversations_write" });

    const sourceConversation = await this.conversations.findOne({
      where: { id: args.sourceConversationId, user: { id: args.userId } }
    });
    if (!sourceConversation) throw new NotFoundException("Conversation not found.");

    const sourceMessages = await this.messages.find({
      where: { conversation: { id: args.sourceConversationId } },
      order: { createdAt: "ASC" }
    });
    if (!sourceMessages.length) throw new BadRequestException("Cannot duplicate an empty conversation.");

    const baseTitle = (sourceConversation.title ?? "Session").trim() || "Session";
    const duplicateTitle = `${baseTitle} (copy)`.slice(0, 160);
    const userRef = { id: args.userId } as any;

    const newConversation = this.conversations.create({
      user: userRef,
      mode: sourceConversation.mode,
      title: duplicateTitle
    });
    await this.conversations.save(newConversation);

    const clonedRows = sourceMessages.map((m) =>
      this.messages.create({
        id: randomUUID(),
        conversation: newConversation,
        user: userRef,
        role: m.role,
        content: m.content,
        metadata: m.metadata ?? null,
        status: m.status,
        source: m.source ?? null
      })
    );
    await this.messages.save(clonedRows);

    return {
      conversation: {
        id: newConversation.id,
        title: newConversation.title ?? null,
        mode: newConversation.mode,
        createdAt: newConversation.createdAt,
        updatedAt: newConversation.updatedAt
      }
    };
  }
}

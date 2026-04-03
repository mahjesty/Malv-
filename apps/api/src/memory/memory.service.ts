import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { MemoryEntryEntity, MemoryScope } from "../db/entities/memory-entry.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";

function tokenizeMessage(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_\-./\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function importanceBoost(row: MemoryEntryEntity): number {
  let b = 0;
  const tags = row.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === "string" && /\b(important|pinned|critical|priority)\b/i.test(tag)) b += 1.25;
    }
  }
  const mt = (row.memoryType ?? "").toLowerCase();
  if (mt.includes("preference") || mt.includes("fact") || mt.includes("constraint")) b += 0.5;
  return b;
}

function recencyBoost(row: MemoryEntryEntity): number {
  const ageMs = Date.now() - row.createdAt.getTime();
  const ageHours = Math.max(0, ageMs / 3600000);
  return Math.max(0, 2.5 - Math.min(ageHours, 168) / 48);
}

function scoreMemoryAgainstMessage(row: MemoryEntryEntity, tokens: Set<string>): number {
  const text = `${row.title ?? ""} ${row.content}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (text.includes(t)) score += 2;
  }
  if (row.memoryScope === "long_term") score += 0.85;
  if (row.memoryScope === "project") score += 0.85;
  if (row.memoryScope === "collaboration") score += 0.75;
  if (row.memoryScope === "device") score += 0.4;
  if (row.memoryScope === "session") score += 0.25;
  score += importanceBoost(row);
  score += recencyBoost(row);
  return score;
}

@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(MemoryEntryEntity) private readonly memories: Repository<MemoryEntryEntity>,
    private readonly killSwitch: KillSwitchService
  ) {}

  async listEntries(args: {
    userId: string;
    limit: number;
    offset: number;
    scope?: MemoryScope;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_read" });

    const where: Record<string, unknown> = { userId: args.userId };
    if (args.scope) {
      where.memoryScope = args.scope;
    }

    const [rows, total] = await this.memories.findAndCount({
      where: where as any,
      order: { createdAt: "DESC" },
      take: args.limit,
      skip: args.offset
    });

    return {
      items: rows.map((e) => ({
        id: e.id,
        memoryScope: e.memoryScope,
        memoryType: e.memoryType,
        title: e.title ?? null,
        content: e.content,
        tags: e.tags ?? null,
        source: e.source,
        sourceRefs: e.sourceRefs ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt
      })),
      total
    };
  }

  async getEntry(args: { userId: string; id: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_read" });
    const row = await this.memories.findOne({ where: { id: args.id, userId: args.userId } });
    if (!row) throw new NotFoundException("Memory entry not found.");
    return row;
  }

  async updateEntry(args: {
    userId: string;
    id: string;
    title?: string | null;
    content?: string;
    tags?: string[] | null;
    memoryType?: string;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_mutation" });
    const row = await this.memories.findOne({ where: { id: args.id, userId: args.userId } });
    if (!row) throw new NotFoundException("Memory entry not found.");
    if (args.title !== undefined) row.title = args.title;
    if (args.content !== undefined) row.content = args.content;
    if (args.tags !== undefined) row.tags = args.tags;
    if (args.memoryType !== undefined) row.memoryType = args.memoryType;
    await this.memories.save(row);
    return row;
  }

  async deleteEntry(args: { userId: string; id: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_mutation" });
    const row = await this.memories.findOne({ where: { id: args.id, userId: args.userId } });
    if (!row) throw new NotFoundException("Memory entry not found.");
    await this.memories.softRemove(row);
    return { ok: true as const };
  }

  /**
   * Recent memory snippets for chat context — excludes vault_only unless explicitly included.
   */
  async recentSnippetsForContext(args: { userId: string; take: number; includeVaultOnly: boolean }) {
    const scopes = args.includeVaultOnly
      ? (["session", "long_term", "project", "device", "collaboration", "vault_only"] as MemoryScope[])
      : (["session", "long_term", "project", "device", "collaboration"] as MemoryScope[]);

    const rows = await this.memories.find({
      where: { userId: args.userId, memoryScope: In(scopes) },
      order: { createdAt: "DESC" },
      take: args.take,
      relations: { collaborationRoom: true }
    });

    return rows;
  }

  /**
   * Ranks recent memories by simple token overlap with the current user message to reduce noisy injection.
   */
  async relevantSnippetsForContext(args: {
    userId: string;
    userMessage: string;
    take: number;
    includeVaultOnly: boolean;
    collaborationRoomId?: string | null;
  }) {
    const pool = await this.recentSnippetsForContext({
      userId: args.userId,
      take: Math.min(48, args.take * 8),
      includeVaultOnly: args.includeVaultOnly
    });

    const filteredPool =
      args.collaborationRoomId && args.collaborationRoomId.trim().length > 0
        ? pool.filter((row) => row.memoryScope !== "collaboration" || row.collaborationRoom?.id === args.collaborationRoomId)
        : pool;

    const tokens = tokenizeMessage(args.userMessage);
    if (tokens.size < 2) {
      return filteredPool.slice(0, args.take);
    }
    const scored = filteredPool.map((row) => ({ row, score: scoreMemoryAgainstMessage(row, tokens) }));
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.row.updatedAt.getTime() - a.row.updatedAt.getTime() ||
        b.row.createdAt.getTime() - a.row.createdAt.getTime()
    );
    return scored.slice(0, args.take).map((s) => s.row);
  }

  async addEntry(args: {
    userId: string;
    scope: MemoryScope;
    type: string;
    title?: string | null;
    content: string;
    tags?: string[] | null;
    source: "chat" | "support" | "device" | "system" | "vault";
    sourceRefs?: Record<string, unknown> | null;
    collaborationRoomId?: string | null;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_mutation" });

    const entity = this.memories.create({
      userId: args.userId,
      memoryScope: args.scope,
      memoryType: args.type,
      title: args.title ?? null,
      content: args.content,
      tags: args.tags ?? null,
      source: args.source,
      sourceRefs: args.sourceRefs ?? null,
      collaborationRoom: args.collaborationRoomId ? ({ id: args.collaborationRoomId } as any) : null
    });
    await this.memories.save(entity);
    return entity;
  }

  async buildContextPack(args: { userId: string; query: string; includeVaultOnly: boolean; take: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "memory_read" });
    const snippets = await this.relevantSnippetsForContext({
      userId: args.userId,
      userMessage: args.query,
      includeVaultOnly: args.includeVaultOnly,
      take: Math.min(24, Math.max(4, args.take))
    });
    return {
      query: args.query,
      total: snippets.length,
      groupedByScope: snippets.reduce<Record<string, number>>((acc, s) => {
        acc[s.memoryScope] = (acc[s.memoryScope] ?? 0) + 1;
        return acc;
      }, {}),
      items: snippets.map((s) => ({
        id: s.id,
        scope: s.memoryScope,
        type: s.memoryType,
        title: s.title ?? null,
        content: s.content,
        tags: s.tags ?? null,
        source: s.source,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    };
  }
}


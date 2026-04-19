import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { MalvUserContinuityStateEntity } from "../db/entities/malv-user-continuity-state.entity";

export type MalvContinuityPersistedPayload = {
  schemaVersion: number;
  activeIntent?: string;
  entities?: string[];
  lastAction?: string;
  lastSurface: string;
  timestamp: number;
  conversationId?: string | null;
  callSessionId?: string | null;
  pendingTaskId?: string | null;
  lastDevice?: string | null;
  lastAgentChannel?: string | null;
  lastInteractionAt?: string | null;
};

@Injectable()
export class MalvContinuityPersistenceService {
  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(MalvUserContinuityStateEntity)
    private readonly rows: Repository<MalvUserContinuityStateEntity>
  ) {}

  private ttlMs(): number {
    return Math.max(60_000, Number(this.cfg.get<string>("MALV_CONTINUITY_TTL_MS") ?? String(14 * 24 * 60 * 60 * 1000)));
  }

  async load(userId: string, sessionKey: string, now = new Date()): Promise<MalvContinuityPersistedPayload | null> {
    if (!userId || !sessionKey) return null;
    const row = await this.rows.findOne({ where: { user: { id: userId }, sessionKey } });
    if (!row || row.expiresAt.getTime() <= now.getTime()) {
      if (row && row.expiresAt.getTime() <= now.getTime()) {
        await this.rows.delete({ id: row.id });
      }
      return null;
    }
    const p = row.payloadJson as MalvContinuityPersistedPayload;
    return p ?? null;
  }

  async save(userId: string, sessionKey: string, payload: MalvContinuityPersistedPayload, now = new Date()): Promise<void> {
    if (!userId || !sessionKey) return;
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    const existing = await this.rows.findOne({ where: { user: { id: userId }, sessionKey } });
    if (existing) {
      await this.rows.update(
        { id: existing.id },
        {
          payloadJson: payload as unknown as Record<string, unknown>,
          schemaVersion: payload.schemaVersion ?? 1,
          expiresAt
        } as any
      );
      return;
    }
    await this.rows.save(
      this.rows.create({
        id: randomUUID(),
        user: { id: userId } as any,
        sessionKey,
        schemaVersion: payload.schemaVersion ?? 1,
        payloadJson: payload as unknown as Record<string, unknown>,
        expiresAt
      })
    );
  }
}

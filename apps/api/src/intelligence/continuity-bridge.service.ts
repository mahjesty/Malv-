import { Injectable, Optional } from "@nestjs/common";
import { MalvContinuityPersistenceService, type MalvContinuityPersistedPayload } from "../execution-bridge/malv-continuity-persistence.service";

export type Surface = "chat" | "call" | "execution" | "device";

export type ContinuityBridgeContext = {
  activeIntent?: string;
  entities?: string[];
  lastAction?: string;
  lastSurface: Surface;
  timestamp: number;
};

@Injectable()
export class ContinuityBridgeService {
  private readonly ttlMs = 12 * 60 * 1000;
  private readonly store = new Map<string, ContinuityBridgeContext>();

  constructor(@Optional() private readonly persistence?: MalvContinuityPersistenceService) {}

  private memKey(sessionId: string, continuityUserId?: string | null): string {
    return continuityUserId ? `${continuityUserId}::${sessionId}` : sessionId;
  }

  /**
   * Load durable continuity for this user/session into the in-process bridge (call from chat/call entry).
   */
  async hydrate(continuityUserId: string | undefined | null, sessionId: string): Promise<void> {
    if (!sessionId || !continuityUserId || !this.persistence) return;
    const row = await this.persistence.load(continuityUserId, sessionId);
    if (!row) return;
    const ctx = payloadToContext(row);
    this.store.set(this.memKey(sessionId, continuityUserId), ctx);
  }

  setContext(sessionId: string, data: Partial<ContinuityBridgeContext>, continuityUserId?: string | null): void {
    if (!sessionId) return;
    const key = this.memKey(sessionId, continuityUserId);
    const prev = this.getContext(sessionId, continuityUserId);
    const merged = this.mergeContext(prev, data);
    this.store.set(key, merged);
    if (continuityUserId && this.persistence) {
      void this.persistence.save(continuityUserId, sessionId, contextToPayload(merged));
    }
  }

  getContext(sessionId: string, continuityUserId?: string | null): ContinuityBridgeContext | null {
    if (!sessionId) return null;
    const key = this.memKey(sessionId, continuityUserId);
    const cur = this.store.get(key);
    if (!cur) return null;
    if (Date.now() - cur.timestamp > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return cur;
  }

  mergeContext(prev: ContinuityBridgeContext | null, next: Partial<ContinuityBridgeContext>): ContinuityBridgeContext {
    const normalizeIntent = (v?: string): string | undefined => {
      if (!v) return undefined;
      const t = v.trim().toLowerCase();
      if (t === "ask" || t === "question") return "question";
      if (t === "execute" || t === "run" || t === "command") return "command";
      return t;
    };
    const normalizeEntities = (arr?: string[]): string[] | undefined => {
      if (!Array.isArray(arr)) return undefined;
      return [...new Set(arr.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean))];
    };
    const prevTs = prev?.timestamp ?? 0;
    const nextTs = next.timestamp ?? Date.now();
    const preferNext = nextTs >= prevTs;
    return {
      activeIntent: preferNext ? normalizeIntent(next.activeIntent) ?? normalizeIntent(prev?.activeIntent) : normalizeIntent(prev?.activeIntent),
      entities: preferNext ? normalizeEntities(next.entities) ?? normalizeEntities(prev?.entities) : normalizeEntities(prev?.entities),
      lastAction: preferNext ? next.lastAction ?? prev?.lastAction : prev?.lastAction,
      lastSurface: next.lastSurface ?? prev?.lastSurface ?? "chat",
      timestamp: Math.max(prevTs, nextTs, Date.now())
    };
  }

  transferContext(
    fromSurface: Surface,
    toSurface: Surface,
    sessionId: string,
    continuityUserId?: string | null
  ): ContinuityBridgeContext | null {
    const prev = this.getContext(sessionId, continuityUserId);
    const merged = this.mergeContext(prev, {
      lastSurface: toSurface,
      lastAction: `transfer:${fromSurface}->${toSurface}`
    });
    const key = this.memKey(sessionId, continuityUserId);
    this.store.set(key, merged);
    if (continuityUserId && this.persistence) {
      void this.persistence.save(continuityUserId, sessionId, contextToPayload(merged));
    }
    return merged;
  }

  clearContext(sessionId: string, continuityUserId?: string | null): void {
    if (!sessionId) return;
    const key = this.memKey(sessionId, continuityUserId);
    this.store.delete(key);
  }
}

function contextToPayload(ctx: ContinuityBridgeContext): MalvContinuityPersistedPayload {
  return {
    schemaVersion: 1,
    activeIntent: ctx.activeIntent,
    entities: ctx.entities,
    lastAction: ctx.lastAction,
    lastSurface: ctx.lastSurface,
    timestamp: ctx.timestamp
  };
}

function payloadToContext(p: MalvContinuityPersistedPayload): ContinuityBridgeContext {
  return {
    activeIntent: p.activeIntent,
    entities: p.entities,
    lastAction: p.lastAction,
    lastSurface: (p.lastSurface as Surface) ?? "chat",
    timestamp: p.timestamp
  };
}

import { Injectable } from "@nestjs/common";

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

  setContext(sessionId: string, data: Partial<ContinuityBridgeContext>): void {
    if (!sessionId) return;
    const prev = this.getContext(sessionId);
    const merged = this.mergeContext(prev, data);
    this.store.set(sessionId, merged);
  }

  getContext(sessionId: string): ContinuityBridgeContext | null {
    if (!sessionId) return null;
    const cur = this.store.get(sessionId);
    if (!cur) return null;
    if (Date.now() - cur.timestamp > this.ttlMs) {
      this.store.delete(sessionId);
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

  transferContext(fromSurface: Surface, toSurface: Surface, sessionId: string): ContinuityBridgeContext | null {
    const prev = this.getContext(sessionId);
    const merged = this.mergeContext(prev, {
      lastSurface: toSurface,
      lastAction: `transfer:${fromSurface}->${toSurface}`
    });
    this.store.set(sessionId, merged);
    return merged;
  }

  clearContext(sessionId: string): void {
    if (!sessionId) return;
    this.store.delete(sessionId);
  }
}

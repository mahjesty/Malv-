import { normalizeExploreHandoffPayload, type ExploreActionHandoffContext } from "./exploreActionHandoff.types";
import { serializeExploreHandoffForMalvTransport } from "./exploreActionHandoff";

const STASH_KEY = "malv_explore_chat_handoff_pending_v1";
const ARMED_JSON_KEY = "malv_explore_chat_handoff_armed_json_v1";

export type ExploreChatHandoffStash = {
  visibleComposerText: string;
  /** Premium origin line, e.g. “From Explore” — no internal ids. */
  originLine: string;
  /** Secondary line (unit title hint). */
  cardSubtitle: string;
  intentLine: string;
  handoff: ExploreActionHandoffContext;
  savedAt: number;
};

function safeParse(raw: string | null): ExploreChatHandoffStash | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (typeof r.visibleComposerText !== "string") return null;
    const originLine =
      typeof r.originLine === "string" && r.originLine.trim()
        ? r.originLine
        : typeof r.cardTitle === "string" && r.cardTitle.trim()
          ? r.cardTitle
          : null;
    if (!originLine) return null;
    if (!r.handoff || typeof r.handoff !== "object") return null;
    const handoff = normalizeExploreHandoffPayload(r.handoff);
    if (!handoff) return null;
    return {
      visibleComposerText: r.visibleComposerText as string,
      originLine,
      cardSubtitle: typeof r.cardSubtitle === "string" ? r.cardSubtitle : "",
      intentLine: typeof r.intentLine === "string" ? r.intentLine : "",
      handoff,
      savedAt: typeof r.savedAt === "number" ? r.savedAt : Date.now()
    };
  } catch {
    return null;
  }
}

export function stashExploreChatHandoff(payload: Omit<ExploreChatHandoffStash, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const full: ExploreChatHandoffStash = { ...payload, savedAt: Date.now() };
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify(full));
    const transport = serializeExploreHandoffForMalvTransport(full.handoff);
    window.sessionStorage.setItem(ARMED_JSON_KEY, transport);
  } catch {
    /* ignore */
  }
}

/** Consume UI stash (card + composer seed). Armal JSON remains until first send. */
export function consumeExploreChatHandoffStash(): ExploreChatHandoffStash | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STASH_KEY);
    const p = safeParse(raw);
    if (!p) return null;
    if (Date.now() - p.savedAt > 86_400_000) {
      window.sessionStorage.removeItem(ARMED_JSON_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/** Attach to the next chat send, then clear (first user turn only). */
export function consumeArmedExploreHandoffJsonForSend(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const j = window.sessionStorage.getItem(ARMED_JSON_KEY);
    if (!j?.trim()) return null;
    window.sessionStorage.removeItem(ARMED_JSON_KEY);
    return j;
  } catch {
    return null;
  }
}

export function clearArmedExploreHandoffJson() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ARMED_JSON_KEY);
  } catch {
    /* ignore */
  }
}

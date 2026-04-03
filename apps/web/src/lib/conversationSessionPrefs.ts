const PINS_KEY = "malv.sidebar.pinnedConversationIds.v1";
const TAGS_KEY = "malv.sidebar.conversationTags.v1";

/** For `useSyncExternalStore` snapshots (pins + tags). */
export const CONVERSATION_PREFS_STORAGE_KEYS = { pins: PINS_KEY, tags: TAGS_KEY } as const;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("malv-conversation-prefs"));
  } catch {
    /* quota or private mode */
  }
}

export function getPinnedConversationIds(): string[] {
  const raw = readJson<string[]>(PINS_KEY, []);
  return Array.isArray(raw) ? raw.filter((id) => typeof id === "string" && id.length > 0) : [];
}

export function isConversationPinned(conversationId: string): boolean {
  return getPinnedConversationIds().includes(conversationId);
}

export function togglePinConversation(conversationId: string): boolean {
  const cur = getPinnedConversationIds();
  const next = cur.includes(conversationId) ? cur.filter((id) => id !== conversationId) : [conversationId, ...cur];
  writeJson(PINS_KEY, next);
  return next.includes(conversationId);
}

export function getConversationTags(conversationId: string): string[] {
  const raw = readJson<Record<string, string[]>>(TAGS_KEY, {});
  const list = raw[conversationId];
  return Array.isArray(list) ? list.filter((t) => typeof t === "string" && t.trim().length > 0).slice(0, 12) : [];
}

export function addConversationTag(conversationId: string, tag: string): void {
  const t = tag.trim().slice(0, 40);
  if (!t) return;
  const raw = readJson<Record<string, string[]>>(TAGS_KEY, {});
  const cur = new Set(raw[conversationId] ?? []);
  cur.add(t);
  writeJson(TAGS_KEY, { ...raw, [conversationId]: [...cur].slice(0, 12) });
}

export function subscribeConversationPrefs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("malv-conversation-prefs", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("malv-conversation-prefs", handler);
  };
}

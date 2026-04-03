import type { MalvChatMessage } from "./types";

/** Hydrate first-class runtime fields from persisted `metadata` (forward-compatible). */
export function mergeRuntimeFieldsFromStorage(m: MalvChatMessage): MalvChatMessage {
  if (m.runtimeSessionId?.trim()) {
    return { ...m, hasRuntimeDetail: m.hasRuntimeDetail ?? true };
  }
  const meta = m.metadata;
  if (!meta || typeof meta !== "object") return m;
  const o = meta as Record<string, unknown>;
  const sid = typeof o.runtimeSessionId === "string" ? o.runtimeSessionId.trim() : "";
  if (!sid) return m;
  return {
    ...m,
    runtimeSessionId: sid,
    hasRuntimeDetail: true,
    runtimeStatus: typeof o.runtimeStatus === "string" ? o.runtimeStatus : m.runtimeStatus,
    runtimePhase: typeof o.runtimePhase === "string" ? o.runtimePhase : m.runtimePhase
  };
}

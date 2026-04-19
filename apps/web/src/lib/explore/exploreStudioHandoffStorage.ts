import { normalizeExploreHandoffPayload, type ExploreActionHandoffContext } from "./exploreActionHandoff.types";

const KEY_PREFIX = "malv_explore_studio_unit_handoff_v1_";

export function stashExploreStudioUnitHandoff(unitId: string, handoff: ExploreActionHandoffContext) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${unitId}`, JSON.stringify({ handoff, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function consumeExploreStudioUnitHandoff(unitId: string): ExploreActionHandoffContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${KEY_PREFIX}${unitId}`);
    if (!raw) return null;
    window.sessionStorage.removeItem(`${KEY_PREFIX}${unitId}`);
    const o = JSON.parse(raw) as { handoff?: unknown; savedAt?: number };
    if (!o?.handoff || typeof o.savedAt !== "number") return null;
    if (Date.now() - o.savedAt > 86_400_000) return null;
    const normalized = normalizeExploreHandoffPayload(o.handoff);
    return normalized;
  } catch {
    return null;
  }
}

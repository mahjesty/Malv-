import type { BeastLevel } from "./malvBeastLevel";

const BEAST_KEY = "malv.beastLevel";
let volatileVaultSessionId: string | null = null;

export function getMalvBeastLevel(): BeastLevel {
  try {
    const v = localStorage.getItem(BEAST_KEY);
    if (v === "Passive" || v === "Smart" || v === "Advanced" || v === "Beast") return v;
  } catch {
    /* ignore */
  }
  return "Smart";
}

export function setMalvBeastLevel(level: BeastLevel) {
  try {
    localStorage.setItem(BEAST_KEY, level);
  } catch {
    /* ignore */
  }
}

export function getMalvVaultSessionId(): string | null {
  return volatileVaultSessionId;
}

export function setMalvVaultSessionId(id: string | null) {
  volatileVaultSessionId = id ?? null;
}

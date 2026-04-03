export type MalvUserMoodHint = "stressed" | "calm" | "urgent" | "focused" | "neutral";

const STORAGE_KEY = "malv.userMoodHint";

const ALL: MalvUserMoodHint[] = ["stressed", "calm", "urgent", "focused", "neutral"];

export function getStoredUserMoodHint(): MalvUserMoodHint | undefined {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v && (ALL as string[]).includes(v)) return v as MalvUserMoodHint;
  } catch {
    /* private mode / SSR */
  }
  return undefined;
}

export function setStoredUserMoodHint(next: MalvUserMoodHint | null): void {
  try {
    if (next === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* noop */
  }
}

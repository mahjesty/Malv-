/**
 * Shared orb energy mapping: voice UI state + mic RMS → 0–1 drive for LivingOrbVisualizer.
 * Kept separate from React state to allow ref-only updates at 60fps.
 */
export type OrbVoiceState = "idle" | "listening" | "speaking" | "thinking" | "muted";

export function audioLevelMinForVoiceState(state: OrbVoiceState): number {
  switch (state) {
    case "muted":
      return 0.008;
    case "idle":
      return 0.035;
    case "thinking":
      return 0.045;
    case "listening":
      return 0.09;
    case "speaking":
      return 0.18;
    default:
      return 0.035;
  }
}

export function orbLevelFromState(
  state: OrbVoiceState,
  smoothedInput01: number,
  socketConnected: boolean,
  micMuted: boolean
): number {
  const base = audioLevelMinForVoiceState(state);
  if (micMuted || !socketConnected) return base;
  if (state === "listening") {
    return Math.max(base, Math.min(1, smoothedInput01 * 0.95 + 0.02));
  }
  if (state === "speaking") {
    return Math.max(base, base + 0.06);
  }
  if (state === "thinking") {
    return Math.max(base, base + 0.035);
  }
  if (state === "idle") {
    return Math.max(base, base + smoothedInput01 * 0.14);
  }
  return base;
}

/** Drive level toward orb target with fast attack / gentle release. */
export function smoothOrbDisplayEnergy(prev: number, target: number): number {
  const t = target > prev ? 0.22 : 0.1;
  return prev + (target - prev) * t;
}

import type { MalvUserLearningProfilePayload } from "../db/entities/malv-user-learning-profile.entity";

export const MALV_ADAPTIVE_BASE = {
  tierUpgradeIntentMax: 0.52,
  tierUpgradeAmbIntentMax: 0.62,
  tierUpgradeComplexIntentMax: 0.65,
  tierDowngradeIntentMin: 0.82,
  softClarificationIntentMax: 0.4,
  memoryMinimalLengthThreshold: 200
} as const;

export type MalvAdaptiveBiases = {
  tierBias: number;
  clarificationBias: number;
  memoryBias: number;
  verbosityBias: number;
};

export type MalvAdaptiveTierThresholds = {
  upgradeIntentMax: number;
  upgradeAmbIntentMax: number;
  upgradeComplexIntentMax: number;
  downgradeIntentMin: number;
  softClarificationIntentMax: number;
  memoryMinimalLengthThreshold: number;
};

export type MalvLearningAdaptiveSnapshot = MalvAdaptiveBiases & {
  tierThresholds: MalvAdaptiveTierThresholds;
  adaptiveStyleHint: string | null;
};

export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function clampBias(n: number): number {
  return clamp(n, -0.08, 0.08);
}

/**
 * Derive small biases from rolling counters — conservative, bounded.
 * Never weakens safety: only nudges orchestration heuristics.
 */
export function computeBiasesFromAggregate(a: MalvUserLearningProfilePayload): MalvAdaptiveBiases {
  const t = Math.max(1, a.turns);
  const upgradeRate = a.tierUpgrade12 / t;
  const downRate = a.tierDowngrade21 / t;
  const clarRate = a.clarificationReplies / t;
  const corrRate = a.userCorrectionHeuristic / t;
  const lowConfRate = a.lowResponseConf / t;
  const refineRate = a.refinementTriggered / t;
  const driftRate = a.driftSignals / t;

  // Many needed upgrades → slightly easier Tier-1→2 escalation (negative tierBias lowers numeric gates).
  let tierBias = clamp((0.09 - upgradeRate) * 0.55, -0.06, 0.06);
  if (downRate > 0.05) tierBias += 0.012;

  // Many clarifications with few corrections → raise bar for soft clarification (positive clarificationBias).
  let clarificationBias = 0;
  if (clarRate > 0.11 && corrRate < 0.035) {
    clarificationBias += clamp((clarRate - 0.11) * 0.45, 0, 0.045);
  }
  if (corrRate > 0.07) clarificationBias -= 0.018;

  // Weak answers → bias toward pulling a bit more memory context.
  let memoryBias = clamp((lowConfRate - 0.045) * 0.35, -0.045, 0.045);

  // Refinement churn + drift → concise bias; heavy questions with drift → slight depth bias.
  let verbosityBias = clamp(-refineRate * 0.55 + driftRate * 0.22, -0.06, 0.06);

  return {
    tierBias: clampBias(tierBias),
    clarificationBias: clampBias(clarificationBias),
    memoryBias: clampBias(memoryBias),
    verbosityBias: clampBias(verbosityBias)
  };
}

export function mergeGlobalAndUserBiases(
  globalB: MalvAdaptiveBiases,
  userB: MalvAdaptiveBiases
): MalvAdaptiveBiases {
  return {
    tierBias: clampBias(globalB.tierBias + userB.tierBias * 0.55),
    clarificationBias: clampBias(globalB.clarificationBias + userB.clarificationBias * 0.55),
    memoryBias: clampBias(globalB.memoryBias + userB.memoryBias * 0.55),
    verbosityBias: clampBias(globalB.verbosityBias + userB.verbosityBias * 0.55)
  };
}

export function buildTierThresholds(tierBias: number, clarificationBias: number): MalvAdaptiveTierThresholds {
  const tb = clamp(tierBias, -0.08, 0.08);
  const cb = clamp(clarificationBias, -0.08, 0.08);
  return {
    upgradeIntentMax: clamp(MALV_ADAPTIVE_BASE.tierUpgradeIntentMax + tb * 0.34, 0.44, 0.58),
    upgradeAmbIntentMax: clamp(MALV_ADAPTIVE_BASE.tierUpgradeAmbIntentMax + tb * 0.28, 0.52, 0.68),
    upgradeComplexIntentMax: clamp(MALV_ADAPTIVE_BASE.tierUpgradeComplexIntentMax + tb * 0.26, 0.55, 0.72),
    downgradeIntentMin: clamp(MALV_ADAPTIVE_BASE.tierDowngradeIntentMin - tb * 0.12, 0.74, 0.88),
    softClarificationIntentMax: clamp(MALV_ADAPTIVE_BASE.softClarificationIntentMax - cb * 0.14, 0.28, 0.46),
    memoryMinimalLengthThreshold: clamp(
      MALV_ADAPTIVE_BASE.memoryMinimalLengthThreshold,
      120,
      260
    )
  };
}

export function applyMemoryLengthBias(baseThreshold: number, memoryBias: number): number {
  const mb = clamp(memoryBias, -0.08, 0.08);
  return clamp(Math.round(baseThreshold - mb * 140), 120, 280);
}

export function buildAdaptiveStyleHint(verbosityBias: number): string | null {
  const vb = clamp(verbosityBias, -0.08, 0.08);
  if (vb < -0.02) {
    return "Adaptation hint: this user tends to prefer concise replies — keep answers dense and skip long preambles.";
  }
  if (vb > 0.025) {
    return "Adaptation hint: this user often benefits from a bit more structure — use short sections when it helps.";
  }
  return null;
}

export function buildLearningAdaptiveSnapshot(merged: MalvAdaptiveBiases): MalvLearningAdaptiveSnapshot {
  const tierThresholds = buildTierThresholds(merged.tierBias, merged.clarificationBias);
  tierThresholds.memoryMinimalLengthThreshold = applyMemoryLengthBias(
    MALV_ADAPTIVE_BASE.memoryMinimalLengthThreshold,
    merged.memoryBias
  );
  return {
    ...merged,
    tierThresholds,
    adaptiveStyleHint: buildAdaptiveStyleHint(merged.verbosityBias)
  };
}

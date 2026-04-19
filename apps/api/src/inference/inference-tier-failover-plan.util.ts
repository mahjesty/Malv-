export type MalvModelTier = "cpu" | "gpu";

/**
 * Ordered worker attempts for chat: each step chooses whether to apply the CPU sidecar patch
 * (beast-worker `lightweight_local` via context) or run the default primary GPU chain only.
 */
export type MalvTierFailoverStep = {
  tier: MalvModelTier;
  applyCpuSidecarPatch: boolean;
};

export type MalvChatTierFailoverPlan = {
  preferredTier: MalvModelTier;
  steps: MalvTierFailoverStep[];
};

/**
 * Build deterministic CPU↔GPU attempt order for beast-worker inference.
 *
 * - CPU tier is intentional for cheap/small work, not merely “when GPU is down”.
 * - GPU tier is preferred for heavy/reasoning-rich turns.
 * - When the preferred tier is unavailable (e.g. lightweight disabled), the plan degrades to GPU-only.
 */
export function buildMalvChatTierFailoverPlan(args: {
  preferredTier: MalvModelTier;
  /** Lightweight sidecar is configured and allowed for this surface/task shape. */
  cpuSidecarConfigured: boolean;
  /** Task still fits lightweight budgets / policy (same gates as routing eligibility). */
  cpuSidecarEligibleForTask: boolean;
}): MalvChatTierFailoverPlan {
  const { preferredTier, cpuSidecarConfigured, cpuSidecarEligibleForTask } = args;
  const cpuOk = cpuSidecarConfigured && cpuSidecarEligibleForTask;

  if (preferredTier === "cpu") {
    if (cpuOk) {
      return {
        preferredTier: "cpu",
        steps: [
          { tier: "cpu", applyCpuSidecarPatch: true },
          { tier: "gpu", applyCpuSidecarPatch: false }
        ]
      };
    }
    return { preferredTier: "cpu", steps: [{ tier: "gpu", applyCpuSidecarPatch: false }] };
  }

  // GPU-preferred
  if (cpuOk) {
    return {
      preferredTier: "gpu",
      steps: [
        { tier: "gpu", applyCpuSidecarPatch: false },
        { tier: "cpu", applyCpuSidecarPatch: true }
      ]
    };
  }
  return { preferredTier: "gpu", steps: [{ tier: "gpu", applyCpuSidecarPatch: false }] };
}

export function materializeWorkerContextForTierStep(args: {
  neutralContext: Record<string, unknown>;
  cpuSidecarPatch: Record<string, unknown>;
  step: MalvTierFailoverStep;
}): Record<string, unknown> {
  const ctx = { ...args.neutralContext };
  if (args.step.applyCpuSidecarPatch) {
    Object.assign(ctx, args.cpuSidecarPatch);
  } else {
    for (const k of Object.keys(args.cpuSidecarPatch)) {
      delete ctx[k];
    }
    delete ctx.malvInferenceBackend;
    delete ctx.malvInferenceModel;
  }
  return ctx;
}

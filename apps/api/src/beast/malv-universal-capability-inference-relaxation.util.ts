import type { MalvTaskCapabilityDemand } from "../inference/malv-inference-tier-capability.types";

/**
 * When universal capability demand excludes the CPU tier but no failover step remains
 * (e.g. GPU unreachable and CPU filtered out), inference routing must relax so the turn can still complete.
 */
export function shouldRelaxUniversalCapabilityChatInferenceDemand(args: {
  universalDemandPatch: MalvTaskCapabilityDemand | null | undefined;
  filteredFailoverPlanStepCount: number;
}): boolean {
  return Boolean(args.universalDemandPatch && args.filteredFailoverPlanStepCount === 0);
}

/**
 * Phase 5 — single source of truth for when the API runs multi-step server phased worker orchestration.
 * Transport-agnostic: WebSocket and HTTP use the same eligibility so intelligence parity holds.
 */
export function malvServerPhasedOrchestrationEligible(args: {
  phasedModuleEnabled: boolean;
  executionStrategyMode: "single_step" | "phased" | "require_clarification";
  superFix: boolean;
  internalPhaseCount: number;
}): boolean {
  return (
    args.phasedModuleEnabled &&
    args.executionStrategyMode === "phased" &&
    !args.superFix &&
    args.internalPhaseCount > 0
  );
}

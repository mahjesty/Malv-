export function malvFlagTruthy(raw: string | undefined | null, defaultWhenEmpty = false): boolean {
  if (raw == null || raw === "") return defaultWhenEmpty;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function malvValidationModeEnabled(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_VALIDATION_MODE"), false);
}

export function malvTraceVerboseEnabled(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_TRACE_VERBOSE"), false);
}

export function malvWsPhaseProgressEnabled(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_WS_PHASE_PROGRESS_ENABLED"), true);
}

export function malvLoadTestModeEnabled(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_LOAD_TEST_MODE"), false);
}

export function malvForceGlobalLearningOnly(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_FORCE_GLOBAL_LEARNING_ONLY"), false);
}

export function malvDisableRefinementForTesting(getEnv: (k: string) => string | undefined): boolean {
  return malvFlagTruthy(getEnv("MALV_DISABLE_REFINEMENT_FOR_TESTING"), false);
}

export function malvSimulationEnabled(getEnv: (k: string) => string | undefined, simFlag: string): boolean {
  if (!malvValidationModeEnabled(getEnv)) return false;
  return malvFlagTruthy(getEnv(simFlag), false);
}

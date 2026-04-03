import {
  buildStateCoverageSummary,
  buildUxScenarioSimulationSummary,
  distinctNonDefaultStatesFromArtifacts,
  errorVariantUrlPath,
  isDefaultOnlyCapturedStates,
  mergeStateAwareRisks,
  routeMaySupportEmptyStateHeuristic
} from "./ui-state-capture-plan";

describe("ui-state-capture-plan", () => {
  it("maps list routes to error detail URLs", () => {
    expect(errorVariantUrlPath("/app/tickets")).toContain("00000000-0000-0000-0000-000000000000");
    expect(errorVariantUrlPath("/app/conversations")).toContain("00000000");
    expect(errorVariantUrlPath("/app/chat")).toBeNull();
  });

  it("heuristics for empty-friendly routes", () => {
    expect(routeMaySupportEmptyStateHeuristic("/app/tickets")).toBe(true);
    expect(routeMaySupportEmptyStateHeuristic("/app/chat")).toBe(false);
  });

  it("buildStateCoverageSummary is explicit for default-only", () => {
    const s = buildStateCoverageSummary([
      { uiState: "default", routePath: "/app", viewport: "desktop", colorScheme: "light", captured: true },
      { uiState: "default", routePath: "/app", viewport: "mobile", colorScheme: "light", captured: true }
    ]);
    expect(s).toContain("Only default");
  });

  it("counts distinct non-default captured states", () => {
    expect(distinctNonDefaultStatesFromArtifacts(["default", "default", "loading"])).toBe(1);
    expect(isDefaultOnlyCapturedStates(["default", "default"])).toBe(true);
    expect(isDefaultOnlyCapturedStates(["default", "loading"])).toBe(false);
  });

  it("buildUxScenarioSimulationSummary ties journeys to capture evidence", () => {
    const s = buildUxScenarioSimulationSummary([
      { uiState: "default", routePath: "/app", viewport: "desktop", colorScheme: "light", captured: true },
      { uiState: "empty", routePath: "/app", viewport: "desktop", colorScheme: "light", captured: true },
      { uiState: "error", routePath: "/app", viewport: "desktop", colorScheme: "light", captured: false, skipReason: "nav_failed" }
    ]);
    expect(s).toContain("Returning / normal session load");
    expect(s).toContain("First-time or cold-storage");
    expect(s).toContain("not evidenced");
  });

  it("mergeStateAwareRisks combines vision and unproven skips", () => {
    const out = mergeStateAwareRisks({
      visionRisks: "Gap between empty and error.",
      stateCoverageSummary: "Only default (settled) UI states were captured.",
      reviewedStates: [
        {
          uiState: "empty",
          routePath: "/app",
          viewport: "desktop",
          colorScheme: "light",
          captured: false,
          skipReason: "budget_exhausted"
        }
      ]
    });
    expect(out).toContain("Gap between");
    expect(out).toContain("Unproven");
  });
});

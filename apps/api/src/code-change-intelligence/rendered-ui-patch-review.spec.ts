import { previewPathsForTouchedFrontendFiles } from "./ui-preview-route-map";
import { patchReviewServiceForTests } from "./patch-review-test-utils";
import { buildUxScenarioSimulationSummary } from "./ui-state-capture-plan";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Rendered UI review + patch review", () => {
  it("maps touched page files to preview paths", () => {
    const paths = previewPathsForTouchedFrontendFiles([
      "apps/web/src/pages/app/DashboardPage.tsx",
      "apps/api/src/x.ts"
    ]);
    expect(paths).toContain("/app");
  });

  it("skips rendered critique gracefully when preview capture is disabled", async () => {
    const patch = patchReviewServiceForTests();
    const out = await patch.review({
      filesChanged: ["apps/web/src/pages/app/DashboardPage.tsx"],
      patchSummary: "ui tweak",
      audit: null,
      plan: { visualStrategy: { visualDirection: "premium calm" } } as any
    });
    expect(typeof out.designQualityScore).toBe("number");
    expect(out.renderedReviewAvailable).toBe(false);
    expect(out.visualQualityScore).toBeNull();
    expect(out.renderedReviewSkipReason).toBeTruthy();
    expect(out.reviewedStates).toEqual([]);
    expect(out.stateCoverageSummary ?? "").toContain("Preview capture did not run");
  });

  it("default-only capture path: honest state coverage + reviewedStates in output", async () => {
    const rendered = {
      tryCapturePreview: jest.fn().mockResolvedValue({
        ok: true,
        artifacts: [
          {
            routePath: "/app",
            viewport: "desktop" as const,
            uiState: "default" as const,
            colorScheme: "light" as const,
            imageDataUrl: pixel
          }
        ],
        reviewedStates: [
          {
            uiState: "default",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          },
          {
            uiState: "loading",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: "budget_exhausted"
          }
        ],
        stateCoverageSummary:
          "Only default (settled) UI states were captured (1 screenshot(s)). Loading, empty, error, and interaction states were not proven in this run.",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([
          {
            uiState: "default",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          },
          {
            uiState: "loading",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: "budget_exhausted"
          }
        ]),
        meta: { baseUrl: "http://127.0.0.1:5173", captureMs: 10, pathsAttempted: ["/app"], playwrightLoaded: true }
      })
    };
    const visual = {
      critiqueScreenshots: jest.fn().mockResolvedValue({
        renderedReviewAvailable: true,
        visualQualityScore: 70,
        visualCritiqueSummary: "Default dashboard state looks balanced.",
        stateAwareDesignRisks: "Only settled default UI was captured; loading/empty/error flows unproven.",
        issues: [],
        suggestions: [],
        uxQualityScore: 68,
        userExperienceSummary: "Dashboard appears complete for a settled state; empty and error paths not visible.",
        frictionAnalysis: "Not assessable from screenshots for alternate flows.",
        usabilityIssues: [],
        frictionPoints: []
      })
    };
    const patch = patchReviewServiceForTests({ renderedUi: rendered as any, visual: visual as any });
    const out = await patch.review({
      filesChanged: ["apps/web/src/pages/app/DashboardPage.tsx"],
      patchSummary: "dashboard",
      audit: null,
      plan: null
    });
    expect(out.renderedReviewAvailable).toBe(true);
    expect(out.reviewedStates.some((r) => r.uiState === "default" && r.captured)).toBe(true);
    expect(out.stateCoverageSummary).toContain("Only default");
    expect(out.stateAwareDesignRisks).toContain("Unproven");
    expect(visual.critiqueScreenshots).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        stateCoverageSummary: expect.stringContaining("Only default"),
        reviewedStates: expect.any(Array),
        uxScenarioSimulationSummary: expect.stringContaining("UX scenario simulation")
      })
    );
    expect(out.uxQualityScore).toBe(68);
    expect(out.userExperienceSummary).toContain("Dashboard");
  });

  it("multi-state capture path: reviewedStates, coverage summary, and state-aware risks", async () => {
    const rendered = {
      tryCapturePreview: jest.fn().mockResolvedValue({
        ok: true,
        artifacts: [
          {
            routePath: "/app/tickets",
            viewport: "desktop" as const,
            uiState: "default" as const,
            colorScheme: "light" as const,
            imageDataUrl: pixel
          },
          {
            routePath: "/app/tickets",
            viewport: "desktop" as const,
            uiState: "loading" as const,
            colorScheme: "light" as const,
            imageDataUrl: pixel
          }
        ],
        reviewedStates: [
          {
            uiState: "default",
            routePath: "/app/tickets",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          },
          {
            uiState: "loading",
            routePath: "/app/tickets",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          }
        ],
        stateCoverageSummary: "State-aware capture: default, loading (2 screenshot(s)).",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([
          {
            uiState: "default",
            routePath: "/app/tickets",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          },
          {
            uiState: "loading",
            routePath: "/app/tickets",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          }
        ]),
        meta: { baseUrl: "http://127.0.0.1:5173", captureMs: 10, pathsAttempted: ["/app/tickets"], playwrightLoaded: true }
      })
    };
    const visual = {
      critiqueScreenshots: jest.fn().mockResolvedValue({
        renderedReviewAvailable: true,
        visualQualityScore: 78,
        visualCritiqueSummary: "Default and delayed-load frames show consistent shell.",
        stateAwareDesignRisks: "Empty and error tickets states were not in the capture set.",
        issues: [],
        suggestions: [],
        uxQualityScore: 75,
        userExperienceSummary: "Tickets list shell is coherent; empty and error not shown.",
        frictionAnalysis: "Limited to default and loading frames.",
        usabilityIssues: [{ code: "weak_empty_hint", severity: "low" as const, note: "No empty state visible in capture." }],
        frictionPoints: []
      })
    };
    const patch = patchReviewServiceForTests({ renderedUi: rendered as any, visual: visual as any });
    const out = await patch.review({
      filesChanged: ["apps/web/src/pages/app/TicketListPage.tsx"],
      patchSummary: "tickets",
      audit: null,
      plan: null
    });
    expect(out.renderedReviewAvailable).toBe(true);
    expect(out.reviewedStates.filter((r) => r.captured).length).toBe(2);
    expect(out.stateCoverageSummary).toContain("State-aware capture");
    expect(out.stateAwareDesignRisks).toContain("Empty and error");
    expect(out.issuesFound.some((i) => (i as { domain?: string }).domain === "ux")).toBe(true);
  });

  it("combines code-pattern critique with rendered critique when capture and vision succeed", async () => {
    const rendered = {
      tryCapturePreview: jest.fn().mockResolvedValue({
        ok: true,
        artifacts: [
          {
            routePath: "/app",
            viewport: "desktop" as const,
            uiState: "default" as const,
            colorScheme: "light" as const,
            imageDataUrl: pixel
          }
        ],
        reviewedStates: [
          {
            uiState: "default",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          }
        ],
        stateCoverageSummary: "Only default (settled) UI states were captured (1 screenshot(s)). Loading, empty, error, and interaction states were not proven in this run.",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([
          {
            uiState: "default",
            routePath: "/app",
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          }
        ]),
        meta: { baseUrl: "http://127.0.0.1:5173", captureMs: 10, pathsAttempted: ["/app"], playwrightLoaded: true }
      })
    };
    const visual = {
      critiqueScreenshots: jest.fn().mockResolvedValue({
        renderedReviewAvailable: true,
        visualQualityScore: 72,
        visualCritiqueSummary: "Layout is readable; primary actions are visible in the header region.",
        stateAwareDesignRisks: "Default only.",
        issues: [{ code: "vertical_rhythm", severity: "low" as const, note: "Slight crowding in the main column." }],
        suggestions: ["Add breathing room between stacked sections."],
        uxQualityScore: 70,
        userExperienceSummary: "Primary task path looks reachable.",
        frictionAnalysis: "Not assessable from screenshots for onboarding.",
        usabilityIssues: [],
        frictionPoints: []
      })
    };
    const patch = patchReviewServiceForTests({ renderedUi: rendered as any, visual: visual as any });
    const out = await patch.review({
      filesChanged: ["apps/web/src/pages/app/DashboardPage.tsx"],
      patchSummary: "dashboard polish",
      audit: null,
      plan: null
    });
    expect(out.renderedReviewAvailable).toBe(true);
    expect(out.visualQualityScore).toBe(72);
    expect(out.renderedCritiqueSummary).toContain("readable");
    expect(rendered.tryCapturePreview).toHaveBeenCalled();
    expect(visual.critiqueScreenshots).toHaveBeenCalled();
    expect(out.issuesFound.some((i) => (i as { code?: string }).code === "rendered_visual_vertical_rhythm")).toBe(true);
    expect(out.reviewSummary).toContain("rendered visual");
    expect(out.renderedUiCaptureMeta?.ok).toBe(true);
  });

  it("does not claim rendered success when vision layer returns unparseable / unavailable", async () => {
    const rendered = {
      tryCapturePreview: jest.fn().mockResolvedValue({
        ok: true,
        artifacts: [
          {
            routePath: "/app",
            viewport: "mobile" as const,
            uiState: "default" as const,
            imageDataUrl: pixel
          }
        ],
        reviewedStates: [
          {
            uiState: "default",
            routePath: "/app",
            viewport: "mobile",
            colorScheme: "light",
            captured: true
          }
        ],
        stateCoverageSummary: "Only default (settled) UI states were captured (1 screenshot(s)). Loading, empty, error, and interaction states were not proven in this run.",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([
          {
            uiState: "default",
            routePath: "/app",
            viewport: "mobile",
            colorScheme: "light",
            captured: true
          }
        ]),
        meta: { baseUrl: "http://127.0.0.1:5173", captureMs: 5, pathsAttempted: ["/app"], playwrightLoaded: true }
      })
    };
    const visual = {
      critiqueScreenshots: jest.fn().mockResolvedValue({
        renderedReviewAvailable: false,
        skipReason: "vision_response_unparseable",
        visualQualityScore: null,
        visualCritiqueSummary: null,
        issues: [],
        suggestions: [],
        stateAwareDesignRisks: null,
        uxQualityScore: null,
        userExperienceSummary: null,
        frictionAnalysis: null,
        usabilityIssues: [],
        frictionPoints: []
      })
    };
    const patch = patchReviewServiceForTests({ renderedUi: rendered as any, visual: visual as any });
    const out = await patch.review({
      filesChanged: ["apps/web/src/pages/app/SettingsPage.tsx"],
      patchSummary: "settings",
      audit: null,
      plan: null
    });
    expect(out.renderedReviewAvailable).toBe(false);
    expect(out.visualQualityScore).toBeNull();
    expect(out.renderedCritiqueSummary).toBeNull();
    expect(out.renderedReviewSkipReason).toBe("vision_response_unparseable");
    expect(out.stateAwareDesignRisks).toBeTruthy();
  });
});

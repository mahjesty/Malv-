import { RenderedUiReviewService } from "./rendered-ui-review.service";

function cfg(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as any;
}

describe("RenderedUiReviewService", () => {
  it("gracefully skips when preview screenshots are disabled", async () => {
    const svc = new RenderedUiReviewService(
      cfg({
        MALV_UI_PREVIEW_SCREENSHOTS: "0",
        MALV_UI_PREVIEW_BASE_URL: "http://127.0.0.1:5173"
      })
    );
    const out = await svc.tryCapturePreview({ touchedRelPaths: ["apps/web/src/pages/app/DashboardPage.tsx"] });
    expect(out.ok).toBe(false);
    expect(out.skipReason).toContain("MALV_UI_PREVIEW_SCREENSHOTS");
    expect(out.artifacts).toEqual([]);
    expect(out.reviewedStates).toEqual([]);
    expect(out.stateCoverageSummary).toContain("Preview capture did not run");
    expect(out.uxScenarioSimulationSummary).toContain("UX scenario simulation");
  });

  it("gracefully skips when base URL is missing", async () => {
    const svc = new RenderedUiReviewService(
      cfg({
        MALV_UI_PREVIEW_SCREENSHOTS: "1"
      })
    );
    const out = await svc.tryCapturePreview({ touchedRelPaths: ["apps/web/src/pages/app/DashboardPage.tsx"] });
    expect(out.ok).toBe(false);
    expect(out.skipReason).toContain("BASE_URL");
    expect(out.stateCoverageSummary).toContain("Preview capture did not run");
  });

  it("gracefully skips when change has no frontend paths", async () => {
    const svc = new RenderedUiReviewService(
      cfg({
        MALV_UI_PREVIEW_SCREENSHOTS: "1",
        MALV_UI_PREVIEW_BASE_URL: "http://127.0.0.1:5173"
      })
    );
    const out = await svc.tryCapturePreview({ touchedRelPaths: ["apps/api/src/main.ts"] });
    expect(out.skipReason).toContain("no_frontend_paths");
  });
});

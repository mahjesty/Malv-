import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isFrontendRepoPath } from "./frontend-repo-paths";
import { previewPathsForTouchedFrontendFiles } from "./ui-preview-route-map";
import {
  buildStateCoverageSummary,
  buildUxScenarioSimulationSummary,
  errorVariantUrlPath,
  routeMaySupportEmptyStateHeuristic,
  type RenderedCaptureViewport,
  type ReviewedStateRecord,
  type UiCaptureState
} from "./ui-state-capture-plan";

export type { RenderedCaptureViewport, ReviewedStateRecord, UiCaptureState } from "./ui-state-capture-plan";

export type RenderedCaptureArtifact = {
  routePath: string;
  viewport: RenderedCaptureViewport;
  uiState: UiCaptureState;
  colorScheme?: "light" | "dark";
  imageDataUrl: string;
};

export type RenderedUiReviewCaptureResult = {
  ok: boolean;
  skipReason?: string;
  artifacts: RenderedCaptureArtifact[];
  /** Every state we attempted (success or honest skip). */
  reviewedStates: ReviewedStateRecord[];
  /** Human-readable coverage; emphasizes default-only when applicable. */
  stateCoverageSummary: string;
  /** How captures map to first-time / returning / error / empty journeys (no fabricated flows). */
  uxScenarioSimulationSummary: string;
  meta: {
    baseUrl: string;
    captureMs: number;
    pathsAttempted: string[];
    playwrightLoaded: boolean;
  };
};

const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

@Injectable()
export class RenderedUiReviewService {
  private readonly logger = new Logger(RenderedUiReviewService.name);

  constructor(private readonly cfg: ConfigService) {}

  private screenshotsEnabled(): boolean {
    const v = (this.cfg.get<string>("MALV_UI_PREVIEW_SCREENSHOTS") ?? "").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes";
  }

  private previewBaseUrl(): string | null {
    const raw = (this.cfg.get<string>("MALV_UI_PREVIEW_BASE_URL") ?? "").trim().replace(/\/$/, "");
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) return null;
    return raw;
  }

  private maxArtifacts(): number {
    const n = Number(this.cfg.get<string>("MALV_UI_PREVIEW_MAX_ARTIFACTS") ?? 6);
    if (!Number.isFinite(n)) return 6;
    return Math.max(1, Math.min(12, Math.floor(n)));
  }

  private navTimeoutMs(): number {
    const n = Number(this.cfg.get<string>("MALV_UI_PREVIEW_NAV_TIMEOUT_MS") ?? 12_000);
    if (!Number.isFinite(n)) return 12_000;
    return Math.max(3000, Math.min(45_000, Math.floor(n)));
  }

  private dualThemeCaptures(): boolean {
    const v = (this.cfg.get<string>("MALV_UI_PREVIEW_DUAL_THEME") ?? "").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes";
  }

  private loadingDelayMs(): number {
    const n = Number(this.cfg.get<string>("MALV_UI_PREVIEW_LOADING_DELAY_MS") ?? 650);
    if (!Number.isFinite(n)) return 650;
    return Math.max(200, Math.min(2000, Math.floor(n)));
  }

  /**
   * Best-effort state-aware PNG captures. Never throws.
   */
  async tryCapturePreview(args: { touchedRelPaths: string[] }): Promise<RenderedUiReviewCaptureResult> {
    const started = Date.now();
    const pathsAttempted: string[] = [];
    const reviewedStates: ReviewedStateRecord[] = [];

    const emptyMeta = (skip: string, routes: string[] = [], pw = false): RenderedUiReviewCaptureResult => ({
      ok: false,
      skipReason: skip,
      artifacts: [],
      reviewedStates: [],
      stateCoverageSummary: "Preview capture did not run — no state coverage to report.",
      uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([]),
      meta: { baseUrl: "", captureMs: Date.now() - started, pathsAttempted: routes, playwrightLoaded: pw }
    });

    if (!this.screenshotsEnabled()) {
      return emptyMeta("MALV_UI_PREVIEW_SCREENSHOTS_not_enabled");
    }
    const baseUrl = this.previewBaseUrl();
    if (!baseUrl) {
      return emptyMeta("MALV_UI_PREVIEW_BASE_URL_missing_or_invalid");
    }

    const normalized = args.touchedRelPaths.map((p) => p.replace(/\\/g, "/"));
    const fe = normalized.filter((f) => isFrontendRepoPath(f));
    if (fe.length === 0) {
      return {
        ok: false,
        skipReason: "no_frontend_paths_in_change",
        artifacts: [],
        reviewedStates: [],
        stateCoverageSummary: "Preview capture did not run — no state coverage to report.",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([]),
        meta: { baseUrl, captureMs: Date.now() - started, pathsAttempted: [], playwrightLoaded: false }
      };
    }

    const routes = previewPathsForTouchedFrontendFiles(fe).slice(0, 3);
    if (routes.length === 0) {
      return {
        ok: false,
        skipReason: "no_mapped_preview_routes_for_touched_files",
        artifacts: [],
        reviewedStates: [],
        stateCoverageSummary: "Preview capture did not run — no mapped routes for touched files.",
        uxScenarioSimulationSummary: buildUxScenarioSimulationSummary([]),
        meta: { baseUrl, captureMs: Date.now() - started, pathsAttempted: [], playwrightLoaded: false }
      };
    }

    let chromium: typeof import("playwright").chromium | null = null;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      this.logger.debug("playwright module not available — rendered UI capture skipped");
      return emptyMeta("playwright_module_unavailable", routes, false);
    }

    const max = this.maxArtifacts();
    const navTimeout = this.navTimeoutMs();
    const artifacts: RenderedCaptureArtifact[] = [];
    let browser: import("playwright").Browser | null = null;
    const dualTheme = this.dualThemeCaptures();
    const loadDelay = this.loadingDelayMs();

    const record = (r: ReviewedStateRecord) => {
      reviewedStates.push(r);
    };

    const canTake = () => artifacts.length < max;

    const pushArtifact = (
      routePath: string,
      viewport: RenderedCaptureViewport,
      uiState: UiCaptureState,
      colorScheme: "light" | "dark",
      buf: Buffer
    ): void => {
      if (artifacts.length >= max) return;
      const b64 = Buffer.from(buf).toString("base64");
      artifacts.push({
        routePath,
        viewport,
        uiState,
        colorScheme,
        imageDataUrl: `data:image/png;base64,${b64}`
      });
    };

    try {
      browser = await chromium.launch({ headless: true });
      const viewports: Array<{ viewport: RenderedCaptureViewport; size: { width: number; height: number } }> = [
        { viewport: "desktop", size: DESKTOP },
        { viewport: "mobile", size: MOBILE }
      ];

      const captureDefault = async (
        page: import("playwright").Page,
        routePath: string,
        viewport: RenderedCaptureViewport,
        colorScheme: "light" | "dark"
      ) => {
        const key: UiCaptureState = "default";
        if (!canTake()) {
          record({ uiState: key, routePath, viewport, colorScheme, captured: false, skipReason: "budget_exhausted" });
          return;
        }
        try {
          await page.emulateMedia({ colorScheme });
          const url = `${baseUrl}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 400));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          if (!canTake()) {
            record({ uiState: key, routePath, viewport, colorScheme, captured: false, skipReason: "budget_exhausted" });
            return;
          }
          pushArtifact(routePath, viewport, key, colorScheme, buf);
          record({ uiState: key, routePath, viewport, colorScheme, captured: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          record({ uiState: key, routePath, viewport, colorScheme, captured: false, skipReason: msg.slice(0, 200) });
          this.logger.warn(`default capture failed ${routePath} ${viewport}: ${msg}`);
        }
      };

      for (let ri = 0; ri < routes.length; ri++) {
        const routePath = routes[ri];
        pathsAttempted.push(routePath);
        for (const { viewport, size } of viewports) {
          if (!canTake()) break;
          const page = await browser.newPage({ viewport: size });
          try {
            await captureDefault(page, routePath, viewport, "light");
          } finally {
            await page.close().catch(() => undefined);
          }
        }

        if (dualTheme && ri === 0 && canTake()) {
          const page = await browser.newPage({ viewport: DESKTOP });
          try {
            await captureDefault(page, routePath, "desktop", "dark");
          } finally {
            await page.close().catch(() => undefined);
          }
        }
      }

      const primary = routes[0];

      const tryLoading = async () => {
        const viewport: RenderedCaptureViewport = "desktop";
        const uiState: UiCaptureState = "loading";
        const colorScheme = "light" as const;
        if (!canTake()) {
          record({ uiState, routePath: primary, viewport, colorScheme, captured: false, skipReason: "budget_exhausted" });
          return;
        }
        const page = await browser!.newPage({ viewport: DESKTOP });
        try {
          await page.route("**/*", async (route) => {
            await new Promise((r) => setTimeout(r, loadDelay));
            await route.continue();
          });
          await page.emulateMedia({ colorScheme });
          const url = `${baseUrl}${primary.startsWith("/") ? primary : `/${primary}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 120));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          await page.unroute("**/*");
          if (!canTake()) {
            record({ uiState, routePath: primary, viewport, colorScheme, captured: false, skipReason: "budget_exhausted" });
            return;
          }
          pushArtifact(primary, viewport, uiState, colorScheme, buf);
          record({ uiState, routePath: primary, viewport, colorScheme, captured: true });
        } catch (e) {
          await page.unroute("**/*").catch(() => undefined);
          const msg = e instanceof Error ? e.message : String(e);
          record({ uiState, routePath: primary, viewport, colorScheme, captured: false, skipReason: msg.slice(0, 200) });
          this.logger.warn(`loading capture failed: ${msg}`);
        } finally {
          await page.close().catch(() => undefined);
        }
      };

      const tryEmpty = async () => {
        if (!routeMaySupportEmptyStateHeuristic(primary)) {
          record({
            uiState: "empty",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: "route_not_heuristic_empty_candidate"
          });
          return;
        }
        const page = await browser!.newPage({ viewport: DESKTOP });
        try {
          if (!canTake()) {
            record({
              uiState: "empty",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          await page.emulateMedia({ colorScheme: "light" });
          const url = `${baseUrl}${primary.startsWith("/") ? primary : `/${primary}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await page.evaluate(() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
          });
          await page.reload({ waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 400));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          if (!canTake()) {
            record({
              uiState: "empty",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          pushArtifact(primary, "desktop", "empty", "light", buf);
          record({ uiState: "empty", routePath: primary, viewport: "desktop", colorScheme: "light", captured: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          record({
            uiState: "empty",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: msg.slice(0, 200)
          });
          this.logger.warn(`empty-state capture failed: ${msg}`);
        } finally {
          await page.close().catch(() => undefined);
        }
      };

      const tryError = async () => {
        const errPath = errorVariantUrlPath(primary);
        if (!errPath) {
          record({
            uiState: "error",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: "no_error_url_heuristic_for_route"
          });
          return;
        }
        const page = await browser!.newPage({ viewport: DESKTOP });
        try {
          if (!canTake()) {
            record({
              uiState: "error",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          await page.emulateMedia({ colorScheme: "light" });
          const url = `${baseUrl}${errPath.startsWith("/") ? errPath : `/${errPath}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 400));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          if (!canTake()) {
            record({
              uiState: "error",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          pushArtifact(primary, "desktop", "error", "light", buf);
          record({ uiState: "error", routePath: primary, viewport: "desktop", colorScheme: "light", captured: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          record({
            uiState: "error",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: msg.slice(0, 200)
          });
          this.logger.warn(`error-state capture failed: ${msg}`);
        } finally {
          await page.close().catch(() => undefined);
        }
      };

      const tryInteractionHover = async () => {
        const page = await browser!.newPage({ viewport: DESKTOP });
        try {
          if (!canTake()) {
            record({
              uiState: "interaction_hover",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          await page.emulateMedia({ colorScheme: "light" });
          const url = `${baseUrl}${primary.startsWith("/") ? primary : `/${primary}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 300));
          const el = page.locator('button, a[href], [role="button"], input:not([type="hidden"])').first();
          const n = await el.count().catch(() => 0);
          if (n < 1) {
            record({
              uiState: "interaction_hover",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "no_interactive_target"
            });
            return;
          }
          await el.hover({ timeout: 4000 }).catch(() => undefined);
          await new Promise((r) => setTimeout(r, 200));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          if (!canTake()) {
            record({
              uiState: "interaction_hover",
              routePath: primary,
              viewport: "desktop",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          pushArtifact(primary, "desktop", "interaction_hover", "light", buf);
          record({
            uiState: "interaction_hover",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: true
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          record({
            uiState: "interaction_hover",
            routePath: primary,
            viewport: "desktop",
            colorScheme: "light",
            captured: false,
            skipReason: msg.slice(0, 200)
          });
        } finally {
          await page.close().catch(() => undefined);
        }
      };

      const tryInteractionFocus = async () => {
        const page = await browser!.newPage({ viewport: MOBILE });
        try {
          if (!canTake()) {
            record({
              uiState: "interaction_focus",
              routePath: primary,
              viewport: "mobile",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          await page.emulateMedia({ colorScheme: "light" });
          const url = `${baseUrl}${primary.startsWith("/") ? primary : `/${primary}`}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
          await new Promise((r) => setTimeout(r, 300));
          const el = page.locator('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])').first();
          const n = await el.count().catch(() => 0);
          if (n < 1) {
            record({
              uiState: "interaction_focus",
              routePath: primary,
              viewport: "mobile",
              colorScheme: "light",
              captured: false,
              skipReason: "no_focusable_target"
            });
            return;
          }
          await el.focus().catch(() => undefined);
          await new Promise((r) => setTimeout(r, 200));
          const buf = await page.screenshot({ type: "png", fullPage: false });
          if (!canTake()) {
            record({
              uiState: "interaction_focus",
              routePath: primary,
              viewport: "mobile",
              colorScheme: "light",
              captured: false,
              skipReason: "budget_exhausted"
            });
            return;
          }
          pushArtifact(primary, "mobile", "interaction_focus", "light", buf);
          record({
            uiState: "interaction_focus",
            routePath: primary,
            viewport: "mobile",
            colorScheme: "light",
            captured: true
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          record({
            uiState: "interaction_focus",
            routePath: primary,
            viewport: "mobile",
            colorScheme: "light",
            captured: false,
            skipReason: msg.slice(0, 200)
          });
        } finally {
          await page.close().catch(() => undefined);
        }
      };

      if (routes.length > 0) {
        await tryLoading();
        await tryEmpty();
        await tryError();
        await tryInteractionHover();
        await tryInteractionFocus();
      }
    } finally {
      await browser?.close().catch(() => undefined);
    }

    const stateCoverageSummary = buildStateCoverageSummary(reviewedStates);
    const uxScenarioSimulationSummary = buildUxScenarioSimulationSummary(reviewedStates);

    if (artifacts.length === 0) {
      return {
        ok: false,
        skipReason: "all_preview_navigations_failed",
        artifacts: [],
        reviewedStates,
        stateCoverageSummary,
        uxScenarioSimulationSummary,
        meta: { baseUrl, captureMs: Date.now() - started, pathsAttempted, playwrightLoaded: true }
      };
    }

    return {
      ok: true,
      artifacts,
      reviewedStates,
      stateCoverageSummary,
      uxScenarioSimulationSummary,
      meta: { baseUrl, captureMs: Date.now() - started, pathsAttempted, playwrightLoaded: true }
    };
  }
}

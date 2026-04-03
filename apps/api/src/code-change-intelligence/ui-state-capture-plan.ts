/**
 * State-aware UI capture planning for rendered design review.
 * Heuristics are bounded and honest: we only claim states that were actually captured.
 */

export type UiCaptureState =
  | "default"
  | "loading"
  | "empty"
  | "error"
  | "interaction_hover"
  | "interaction_focus";

export type RenderedCaptureViewport = "desktop" | "mobile";

export type ReviewedStateRecord = {
  uiState: UiCaptureState;
  routePath: string;
  viewport: RenderedCaptureViewport;
  colorScheme: "light" | "dark";
  captured: boolean;
  skipReason?: string;
};

const EMPTY_FRIENDLY_ROUTES =
  /^\/app\/(conversations|tickets|notifications|files|memory|devices|collaboration)(\/|$)/;

/** Routes where a bogus detail id may surface an in-app error / empty detail UI. */
export function errorVariantUrlPath(routePath: string): string | null {
  const p = routePath.replace(/\/$/, "") || "/";
  const dead = "00000000-0000-0000-0000-000000000000";
  if (p === "/app/tickets" || p === "/app/conversations") return `${p}/${dead}`;
  if (p === "/app/admin/self-upgrade") return `${p}/${dead}`;
  return null;
}

export function routeMaySupportEmptyStateHeuristic(routePath: string): boolean {
  return EMPTY_FRIENDLY_ROUTES.test(routePath.replace(/\/$/, "") || "/");
}

export function distinctNonDefaultStatesFromArtifacts(states: UiCaptureState[]): number {
  return new Set(states.filter((s) => s !== "default")).size;
}

export function isDefaultOnlyCapturedStates(states: UiCaptureState[]): boolean {
  const nonDef = states.filter((s) => s !== "default");
  return nonDef.length === 0;
}

export function buildStateCoverageSummary(reviewed: ReviewedStateRecord[]): string {
  const succeeded = reviewed.filter((r) => r.captured);
  const failed = reviewed.filter((r) => !r.captured);
  if (succeeded.length === 0) {
    return failed.length
      ? `No UI states were successfully captured; ${failed.length} attempt(s) failed.`
      : "No UI state capture attempts were recorded.";
  }
  const kindsOk = new Set(succeeded.map((r) => r.uiState));
  if (kindsOk.size === 1 && kindsOk.has("default")) {
    return `Only default (settled) UI states were captured (${succeeded.length} screenshot(s)). Loading, empty, error, and interaction states were not proven in this run.`;
  }
  const okLabel = [...kindsOk].sort().join(", ");
  const failHint =
    failed.length > 0
      ? ` Attempts not captured: ${failed.map((f) => `${f.uiState}${f.skipReason ? ` (${f.skipReason})` : ""}`).join("; ")}.`
      : "";
  return `State-aware capture: ${okLabel} (${succeeded.length} screenshot(s)).${failHint}`;
}

export function mergeStateAwareRisks(args: {
  visionRisks: string | null | undefined;
  stateCoverageSummary: string;
  reviewedStates: ReviewedStateRecord[];
}): string {
  const parts: string[] = [];
  if (args.visionRisks?.trim()) parts.push(args.visionRisks.trim());
  const failed = args.reviewedStates.filter((r) => !r.captured && r.skipReason);
  if (failed.length) {
    parts.push(`Unproven state targets: ${failed.map((f) => `${f.uiState} — ${f.skipReason}`).join("; ")}.`);
  }
  if (args.stateCoverageSummary.includes("Only default")) {
    parts.push(args.stateCoverageSummary);
  }
  const out = parts.join(" ").trim();
  return out.slice(0, 2500) || args.stateCoverageSummary.slice(0, 2500);
}

/**
 * Maps capture attempts to user-journey language without inventing flows.
 * Default load = warm browser storage (not cleared). Empty capture = cold storage reload when that path ran.
 */
export function buildUxScenarioSimulationSummary(reviewed: ReviewedStateRecord[]): string {
  const lines: string[] = ["UX scenario simulation (evidence-bound only; do not invent flows):"];

  const defOk = reviewed.filter((r) => r.uiState === "default" && r.captured);
  lines.push(
    defOk.length
      ? `- Returning / normal session load: default navigations did not clear storage before paint (${defOk.length} screenshot(s); desktop/mobile as captured).`
      : `- Returning / normal session load: no successful default capture — not evidenced.`
  );

  const emptyAttempts = reviewed.filter((r) => r.uiState === "empty");
  const emptyOk = emptyAttempts.filter((r) => r.captured);
  if (emptyOk.length) {
    lines.push(
      `- First-time or cold-storage surface: evidenced by empty-state capture (storage cleared then reload on route).`
    );
  } else if (emptyAttempts.some((r) => !r.captured)) {
    lines.push(
      `- First-time or cold-storage surface: empty-state simulation was attempted but not captured (${emptyAttempts
        .filter((r) => !r.captured)
        .map((e) => e.skipReason ?? "unknown")
        .join("; ")}).`
    );
  } else {
    lines.push(`- First-time or cold-storage surface: empty-state simulation not applicable or not attempted for this route.`);
  }

  const errOk = reviewed.filter((r) => r.uiState === "error" && r.captured);
  lines.push(
    errOk.length
      ? `- Error / failure path: evidenced by error-route or invalid-id navigation capture.`
      : `- Error / failure path: not evidenced in screenshots (skipped, no heuristic URL, or navigation failed).`
  );

  const loadOk = reviewed.filter((r) => r.uiState === "loading" && r.captured);
  lines.push(
    loadOk.length
      ? `- Loading / in-flight: evidenced by throttled-network capture (may still resemble settled UI).`
      : `- Loading / in-flight: not evidenced (skipped, failed, or not distinguishable in pixels).`
  );

  const hoverOk = reviewed.filter((r) => r.uiState === "interaction_hover" && r.captured);
  const focusOk = reviewed.filter((r) => r.uiState === "interaction_focus" && r.captured);
  lines.push(
    `- Interaction: hover ${hoverOk.length ? "captured" : "not evidenced"}; focus ${focusOk.length ? "captured" : "not evidenced"}.`
  );

  const mob = reviewed.filter((r) => r.viewport === "mobile" && r.captured);
  const desk = reviewed.filter((r) => r.viewport === "desktop" && r.captured);
  lines.push(`- Form factors: ${desk.length} desktop shot(s), ${mob.length} mobile shot(s).`);

  return lines.join("\n").slice(0, 3500);
}

/**
 * Lightweight preview observability — extend with product analytics when wired.
 */
export type MalvPreviewTelemetryEvent =
  | { type: "preview_requested"; unitId: string; reasonCode?: string }
  | { type: "preview_loaded"; unitId: string; reasonCode?: string; mimeType?: string | null }
  | { type: "preview_failed"; unitId: string; reasonCode: string; detail?: string };

export function emitMalvPreviewTelemetry(event: MalvPreviewTelemetryEvent): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("malv:preview-telemetry", { detail: event }));
  }
  if (import.meta.env.DEV) {
    console.debug("[MALV preview]", event.type, event);
  }
}

export type MalvPreviewStatusDetail = {
  unitId: string;
  /** `temporary_failure` = live preview shell stays active; user can retry (transient iframe/fetch/timeout). */
  state: "loading" | "ready" | "failed_to_load" | "temporary_failure" | "unavailable";
  reasonCode?: string;
};

export function emitMalvPreviewStatus(detail: MalvPreviewStatusDetail): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("malv:preview-status", { detail }));
  }
}

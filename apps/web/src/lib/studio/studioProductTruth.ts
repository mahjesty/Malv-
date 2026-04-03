/**
 * Pure helpers for Studio UI truthfulness — what to show when backend sends
 * heuristics vs attached patch/diff artifacts.
 */

export type StudioProductTruth = {
  fileHintsAreInferred?: boolean;
  unifiedDiffAttached?: boolean;
};

export function readProductTruth(pending: Record<string, unknown> | null | undefined): StudioProductTruth {
  const raw = pending?.productTruth as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return { fileHintsAreInferred: true, unifiedDiffAttached: false };
  }
  return {
    fileHintsAreInferred: raw.fileHintsAreInferred !== false,
    unifiedDiffAttached: raw.unifiedDiffAttached === true
  };
}

export function studioResultHeadline(args: {
  pendingTitle: string | undefined;
  lastUserLine: string | undefined;
  selectedLabel: string | undefined;
  hasPreviewRun: boolean;
}): string {
  const t = args.pendingTitle?.trim();
  if (t) return t;
  if (args.hasPreviewRun && args.lastUserLine) {
    const short = args.lastUserLine.length > 120 ? `${args.lastUserLine.slice(0, 117)}…` : args.lastUserLine;
    return `Preview for: ${short}`;
  }
  if (args.selectedLabel) return `Target: ${args.selectedLabel} — describe a change to generate a preview.`;
  return "Select a preview target and send an instruction to generate a studio preview.";
}

export function studioResultSummaryLines(args: {
  pending: Record<string, unknown> | null | undefined;
  selectedLabel: string | undefined;
  scopeMode: string;
  stateTag: "preview" | "applied";
  previewStatusNote: string;
}): string[] {
  const lines: string[] = [];
  const exec = args.pending?.execution as Record<string, unknown> | undefined;
  const mode = exec?.mode != null ? String(exec.mode) : "preview_only";
  const prodWrite = exec?.productionWrite === true;
  lines.push(
    args.stateTag === "applied"
      ? "Last apply went through the sandbox patch flow (not direct production)."
      : `Preview mode: ${mode}. Production writes: ${prodWrite ? "yes (policy-gated)" : "no"}.`
  );
  if (args.selectedLabel) {
    lines.push(`Target: ${args.selectedLabel} · Scope: ${args.scopeMode}.`);
  }
  if (args.previewStatusNote) lines.push(args.previewStatusNote);
  return lines;
}

export function diffPanelCaption(truth: StudioProductTruth, hasDiffText: boolean): string {
  if (truth.unifiedDiffAttached && hasDiffText) return "Patch preview (from run)";
  if (hasDiffText) return "Patch preview";
  return "No unified diff attached for this preview tier — file hints below are inferred from your instruction.";
}

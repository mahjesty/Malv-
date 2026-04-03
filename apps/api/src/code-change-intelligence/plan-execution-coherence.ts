/**
 * Compares submitted implementation metadata (filesChanged) against planned targets.
 * Default usage is soft warnings + codes for downstream confidence; strict blocking is opt-in via env.
 */

import type { PlanExecutionAlignment, PlanExecutionCoherence } from "./change-intelligence.types";

function normPath(p: string): string {
  return p.replace(/\\/g, "/").trim().replace(/^(\.\/)+/, "");
}

export function pathsLooselyMatch(submitted: string, planned: string): boolean {
  const s = normPath(submitted);
  const pl = normPath(planned);
  if (!s || !pl) return false;
  if (s === pl) return true;
  if (s.endsWith(pl)) {
    return s.length === pl.length || s[s.length - pl.length - 1] === "/";
  }
  if (pl.endsWith(s)) {
    return pl.length === s.length || pl[pl.length - s.length - 1] === "/";
  }
  return false;
}

export function validateExecutionMatchesPlan(args: {
  filesChanged: string[];
  filesToModify: string[];
  filesToCreate: string[];
}): PlanExecutionCoherence {
  const plannedTargets = Array.from(
    new Set(
      [...(args.filesToModify ?? []), ...(args.filesToCreate ?? [])]
        .map((p) => normPath(p))
        .filter((p) => p.length > 0)
    )
  );
  const filesChangedNormalized = Array.from(
    new Set((args.filesChanged ?? []).map((p) => normPath(p)).filter((p) => p.length > 0))
  );

  const warnings: string[] = [];
  const codes: string[] = [];

  if (plannedTargets.length === 0) {
    return {
      alignment: "unknown",
      plannedTargets,
      filesChangedNormalized,
      overlapMatches: [],
      unmatchedPlanned: [],
      unmatchedSubmitted: [...filesChangedNormalized],
      warnings,
      codes
    };
  }

  const matchedPlannedIdx = new Set<number>();
  const matchedSubmittedIdx = new Set<number>();

  for (let i = 0; i < filesChangedNormalized.length; i++) {
    const s = filesChangedNormalized[i]!;
    for (let j = 0; j < plannedTargets.length; j++) {
      if (matchedPlannedIdx.has(j)) continue;
      if (pathsLooselyMatch(s, plannedTargets[j]!)) {
        matchedPlannedIdx.add(j);
        matchedSubmittedIdx.add(i);
        break;
      }
    }
  }

  const overlapMatches = filesChangedNormalized.filter((_, i) => matchedSubmittedIdx.has(i));
  const unmatchedPlanned = plannedTargets.filter((_, j) => !matchedPlannedIdx.has(j));
  const unmatchedSubmitted = filesChangedNormalized.filter((_, i) => !matchedSubmittedIdx.has(i));

  let alignment: PlanExecutionAlignment;

  if (filesChangedNormalized.length === 0) {
    alignment = "none";
    warnings.push(
      `Implementation reported no files changed, but the plan lists ${plannedTargets.length} target file(s) to modify or create.`
    );
    codes.push("cci_plan_execution_empty_vs_planned_targets");
  } else if (overlapMatches.length === 0) {
    alignment = "none";
    warnings.push(
      `No overlap between submitted filesChanged (${filesChangedNormalized.length}) and planned targets (${plannedTargets.length}).`
    );
    codes.push("cci_plan_execution_no_overlap");
  } else if (unmatchedPlanned.length === 0 && unmatchedSubmitted.length === 0) {
    alignment = "full";
  } else {
    alignment = "partial";
    if (unmatchedPlanned.length > 0) {
      warnings.push(
        `Planned file(s) not present in filesChanged: ${unmatchedPlanned.slice(0, 8).join(", ")}${unmatchedPlanned.length > 8 ? "…" : ""}`
      );
      codes.push("cci_plan_execution_partial_missing_planned");
    }
    if (unmatchedSubmitted.length > 0) {
      warnings.push(
        `filesChanged includes path(s) outside plan targets: ${unmatchedSubmitted.slice(0, 8).join(", ")}${unmatchedSubmitted.length > 8 ? "…" : ""}`
      );
      codes.push("cci_plan_execution_partial_extra_submitted");
    }
  }

  return {
    alignment,
    plannedTargets,
    filesChangedNormalized,
    overlapMatches,
    unmatchedPlanned,
    unmatchedSubmitted,
    warnings,
    codes
  };
}

/** Opt-in strict gate via env `MALV_CCI_STRICT_PLAN_COHERENCE` (1/true/yes). */
export function isCciStrictPlanCoherenceEnabled(): boolean {
  const v = (process.env.MALV_CCI_STRICT_PLAN_COHERENCE ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

/** Opt-in strict gate: block only empty-vs-planned or total mismatch (no overlap). */
export function shouldBlockStrictPlanExecution(coherence: PlanExecutionCoherence): boolean {
  if (coherence.alignment === "unknown") return false;
  if (coherence.plannedTargets.length === 0) return false;
  if (coherence.filesChangedNormalized.length === 0) return true;
  if (coherence.overlapMatches.length === 0) return true;
  return false;
}

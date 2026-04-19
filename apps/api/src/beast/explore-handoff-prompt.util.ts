import { IsNull } from "typeorm";
import { Repository } from "typeorm";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import type { StructuredContextSignal } from "./structured-context";
import { parseExploreHandoffJson, type ExploreActionHandoffContext } from "@malv/explore-action-handoff";

export { parseExploreHandoffJson, type ExploreActionHandoffContext };

/** @deprecated Prefer {@link ExploreActionHandoffContext}. */
export type ExploreHandoffPayloadV1 = ExploreActionHandoffContext;

/** DB-backed resolution outcome for Explore handoff (additive; used for first-turn shaping). */
export type ExploreHandoffUnitResolution = "ok" | "missing" | "forbidden";

/** Safe unit fields for deterministic advisory shaping — no ids. */
export type ExploreHandoffResolvedUnitHints = Pick<
  BuildUnitEntity,
  "title" | "previewKind" | "category" | "tags" | "metadataJson" | "intakePreviewState"
>;

export type ExploreHandoffResolutionResult = {
  signals: StructuredContextSignal[];
  resolution: ExploreHandoffUnitResolution;
  /** Set when resolution is ok; omitted otherwise. */
  unitHints?: ExploreHandoffResolvedUnitHints;
};

/**
 * Resolve Explore handoff into orchestration signals plus access resolution (single unit fetch).
 */
export async function resolveExploreContextForMalvWithResolution(args: {
  userId: string;
  parsed: ExploreActionHandoffContext;
  units: Repository<BuildUnitEntity>;
}): Promise<ExploreHandoffResolutionResult> {
  const { userId, parsed, units } = args;
  const out: StructuredContextSignal[] = [];

  const unit = await units.findOne({ where: { id: parsed.unitId, archivedAt: IsNull() } });
  if (!unit) {
    out.push({
      kind: "operator",
      text: "Explore handoff referenced a build unit that is not available (missing or archived). Ask the user briefly which unit they meant."
    });
    return { signals: out, resolution: "missing" };
  }
  if (unit.visibility === "private" && unit.authorUserId !== userId) {
    out.push({
      kind: "operator",
      text: "Explore handoff referenced a private build unit the user cannot access. Do not infer contents; ask one short clarifying question."
    });
    return { signals: out, resolution: "forbidden" };
  }

  const title = (unit.title ?? "").trim() || "Untitled unit";
  out.push({
    kind: "operator",
    text: `Explore continuity: the user opened «${title}» from Explore and expects you to continue with that unit as the active subject. Do not ask which catalog item or which screen — context is already established. Acknowledge the Explore preview posture (live/static/fallback) in natural language.`
  });

  out.push({
    kind: "operator",
    text: `Explore surface: ${parsed.sourceSubsurface.replace(/_/g, " ")} · user action: ${parsed.actionType.replace(/_/g, " ")}`
  });

  const prev = parsed.previewContext;
  const why = prev.reasonLabel?.trim() ? ` · ${prev.reasonLabel.trim()}` : "";
  out.push({
    kind: "operator",
    text: `Explore preview posture: ${prev.mode.replace(/_/g, " ")} · confidence ${prev.confidence}${why}`
  });

  const pres = parsed.presentationContext;
  const bits: string[] = [];
  if (pres.fullscreen) bits.push("fullscreen");
  if (pres.compareMode) bits.push("compare mode");
  if (pres.viewport && pres.viewport !== "fit") bits.push(`${pres.viewport} viewport`);
  if (bits.length) {
    out.push({ kind: "operator", text: `Presentation context: ${bits.join(", ")}` });
  }

  const rev = parsed.reviewContext;
  if (rev.decision.trim()) {
    out.push({
      kind: "operator",
      text: `Review policy snapshot: decision ${rev.decision}; preview allowed: ${rev.previewAllowed ? "yes" : "no"}; publish allowed: ${
        rev.publishAllowed ? "yes" : "no"
      }`
    });
  }

  const imp = parsed.improvementContext;
  if (imp?.intent) {
    out.push({ kind: "operator", text: `Improvement focus: ${imp.intent.replace(/_/g, " ")}` });
  }

  const unitHints: ExploreHandoffResolvedUnitHints = {
    title: unit.title,
    previewKind: unit.previewKind,
    category: unit.category,
    tags: unit.tags,
    metadataJson: unit.metadataJson,
    intakePreviewState: unit.intakePreviewState
  };

  return { signals: out, resolution: "ok", unitHints };
}

/**
 * Resolve Explore handoff into orchestration signals (operator channel).
 * Validates unit access; emits human-readable lines without dumping raw JSON into user-visible chat chrome.
 * Never instructs the model to ask “which item?” when the handoff resolved to an accessible unit.
 */
export async function resolveExploreContextForMalv(args: {
  userId: string;
  parsed: ExploreActionHandoffContext;
  units: Repository<BuildUnitEntity>;
}): Promise<StructuredContextSignal[]> {
  const r = await resolveExploreContextForMalvWithResolution(args);
  return r.signals;
}

/** @deprecated Use {@link resolveExploreContextForMalv}. */
export const resolveActiveExploreContextForMalv = resolveExploreContextForMalv;

import type { QueryClient } from "@tanstack/react-query";
import type { ApiBuildUnit } from "../api/dataPlane";
import {
  devWarnPreviewInvariantViolation,
  isLikelyPlaceholderPreviewImageUrl,
  isUsableExternalPreviewImageUrl,
  mergePreviewImageUrlWhenSupplementNewer,
  sanitizeBuildUnitPreviewFields,
  usableExternalPreviewImageUrl
} from "./previewArtifactValidation";

/**
 * Preview Authority Layer — single merge pipeline for **preview-relevant** `ApiBuildUnit` fields.
 *
 * **Rule:** All preview chrome (Explore cards, detail pane, compose thumbs, Studio preview, Tasks/Inbox
 * when they gain preview) MUST obtain `ApiBuildUnit` preview fields (and upload-derived detection/source
 * fields folded by the same merge) through `resolveAuthoritativePreviewUnit` (or a hook that calls it).
 * Do not read `previewSnapshotId`, `previewFileId`, `livePreview`, pipeline status, feasibility, intake
 * preview fields, or `intakeDetectionJson` directly from a stale list row when a fresher cache may exist.
 *
 * **Placeholders / unusable URLs:** Sanitized at API normalize and again on resolve via
 * `sanitizeBuildUnitPreviewFields` so they never persist as catalog truth.
 */

const PREVIEW_AUTHORITY_RESOLVED = Symbol.for("malv.previewAuthority.resolved");

export type AuthoritativePreviewUnit = ApiBuildUnit;

export type ResolveAuthoritativePreviewUnitOptions = {
  /** Freshly normalized unit from an import/publish handoff before list caches align. */
  handoffUnit?: ApiBuildUnit | null;
  /** Run after built-in collectors (Tasks, Inbox, Studio session outputs, …). */
  extraCollectors?: PreviewAuthorityCollector[];
};

export type PreviewAuthoritySupplement = ApiBuildUnit | undefined | null;

/**
 * Returns one or more supplemental rows for the same `unitId`. Arrays are folded in order.
 * Future sources (Tasks cache, Inbox, Studio) implement this shape.
 */
export type PreviewAuthorityCollector = (
  queryClient: QueryClient,
  unitId: string
) => PreviewAuthoritySupplement | ReadonlyArray<PreviewAuthoritySupplement>;

const warnedRawPreviewKeys = new Set<string>();

export function isAuthoritativePreviewUnit(unit: unknown): boolean {
  return (
    typeof unit === "object" &&
    unit !== null &&
    (unit as Record<symbol, boolean | undefined>)[PREVIEW_AUTHORITY_RESOLVED] === true
  );
}

/**
 * Dev-only: call from preview surfaces (iframe, static blob, pipeline chrome) when the prop is expected
 * to carry merged cache state. Logs once per surface + unit id per session to limit noise.
 */
export function devWarnIfRawPreviewUnitForRender(unit: ApiBuildUnit, surface: string): void {
  if (!import.meta.env.DEV) return;
  if (isAuthoritativePreviewUnit(unit)) return;
  const key = `${surface}::${unit.id}`;
  if (warnedRawPreviewKeys.has(key)) return;
  warnedRawPreviewKeys.add(key);
  console.warn(
    `[MALV Preview Authority] "${surface}" is rendering preview data from a raw ApiBuildUnit. ` +
      "Use resolveAuthoritativePreviewUnit (or useEffectiveExplorePreviewUnit) so preview fields match the freshest query caches.",
    { unitId: unit.id }
  );
}

function ensureDevAuthorityMark(u: ApiBuildUnit): AuthoritativePreviewUnit {
  if (!import.meta.env.DEV) return u as AuthoritativePreviewUnit;
  if (isAuthoritativePreviewUnit(u)) return u as AuthoritativePreviewUnit;
  const out = { ...u };
  Object.defineProperty(out, PREVIEW_AUTHORITY_RESOLVED, {
    value: true,
    enumerable: false,
    configurable: true
  });
  return out as AuthoritativePreviewUnit;
}

function flattenCollectorResult(
  r: PreviewAuthoritySupplement | ReadonlyArray<PreviewAuthoritySupplement>
): ApiBuildUnit[] {
  if (Array.isArray(r)) {
    return r.filter((x): x is ApiBuildUnit => x != null && typeof x === "object" && "id" in x);
  }
  const row = r as PreviewAuthoritySupplement;
  if (row == null) return [];
  return [row];
}

function applyCollector(
  canonical: ApiBuildUnit,
  queryClient: QueryClient,
  unitId: string,
  collector: PreviewAuthorityCollector
): ApiBuildUnit {
  const raw = collector(queryClient, unitId);
  let u = canonical;
  for (const row of flattenCollectorResult(raw)) {
    u = mergeExplorePreviewSupplementOntoCanonical(u, row);
  }
  return u;
}

function isNonEmptyTrimmedString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function intakeDetectionJsonKeyCount(d: Record<string, unknown> | null | undefined): number {
  return d != null && typeof d === "object" && !Array.isArray(d) ? Object.keys(d).length : 0;
}

function intakeDetectionJsonIsMeaningful(d: Record<string, unknown> | null | undefined): boolean {
  return intakeDetectionJsonKeyCount(d) > 0;
}

/**
 * Prefer supplement detection when it is strictly more informative, or when equally sized but newer.
 * Avoid replacing richer canonical rows with sparser list/cache rows.
 */
function preferIntakeDetectionJson(merged: ApiBuildUnit, supplement: ApiBuildUnit): Record<string, unknown> | null {
  const c = merged.intakeDetectionJson;
  const s = supplement.intakeDetectionJson;
  const cN = intakeDetectionJsonKeyCount(c);
  const sN = intakeDetectionJsonKeyCount(s);
  if (!intakeDetectionJsonIsMeaningful(s)) return c ?? null;
  if (!intakeDetectionJsonIsMeaningful(c)) return s ?? null;
  if (sN > cN) return s!;
  if (sN < cN) return c!;
  return Date.parse(supplement.updatedAt) >= Date.parse(merged.updatedAt) ? s! : c!;
}

/**
 * Adds `sourceIntakeSessionId` from supplement only when canonical metadata lacks it (presentation linkage).
 */
function mergeMetadataJsonWithIntakeSessionLink(
  merged: ApiBuildUnit,
  supplement: ApiBuildUnit
): Record<string, unknown> | null {
  const sMeta = supplement.metadataJson;
  if (!sMeta || typeof sMeta !== "object" || Array.isArray(sMeta)) return merged.metadataJson;
  const sid = (sMeta as Record<string, unknown>).sourceIntakeSessionId;
  if (sid == null || sid === "") return merged.metadataJson;

  const cMeta = merged.metadataJson;
  const cObj = cMeta && typeof cMeta === "object" && !Array.isArray(cMeta) ? (cMeta as Record<string, unknown>) : null;
  const existing = cObj?.sourceIntakeSessionId;
  if (existing != null && existing !== "") return merged.metadataJson;

  if (cObj) {
    return { ...cObj, sourceIntakeSessionId: sid };
  }
  return { sourceIntakeSessionId: sid };
}

/**
 * Uploaded-source / intake scan fields that list rows often omit but detail (or another cache) may hold.
 * Applied after preview-field merge so cards and detail stay consistent without broad object spreads.
 */
function mergeUploadedSourceIntelFromSupplement(merged: ApiBuildUnit, supplement: ApiBuildUnit): ApiBuildUnit {
  if (supplement.id !== merged.id) return merged;

  const nextDet = preferIntakeDetectionJson(merged, supplement);
  const nextMeta = mergeMetadataJsonWithIntakeSessionLink(merged, supplement);

  const patch: Partial<ApiBuildUnit> = {};

  if (nextDet !== (merged.intakeDetectionJson ?? null)) {
    patch.intakeDetectionJson = nextDet;
  }

  if (!isNonEmptyTrimmedString(merged.sourceFileId) && isNonEmptyTrimmedString(supplement.sourceFileId)) {
    patch.sourceFileId = supplement.sourceFileId ?? null;
  }
  if (!isNonEmptyTrimmedString(merged.sourceFileName) && isNonEmptyTrimmedString(supplement.sourceFileName)) {
    patch.sourceFileName = supplement.sourceFileName ?? null;
  }
  if (!isNonEmptyTrimmedString(merged.sourceFileMime) && isNonEmptyTrimmedString(supplement.sourceFileMime)) {
    patch.sourceFileMime = supplement.sourceFileMime ?? null;
  }
  if (!isNonEmptyTrimmedString(merged.sourceFileUrl) && isNonEmptyTrimmedString(supplement.sourceFileUrl)) {
    patch.sourceFileUrl = supplement.sourceFileUrl ?? null;
  }

  if (merged.intakeAuditDecision == null && supplement.intakeAuditDecision != null) {
    patch.intakeAuditDecision = supplement.intakeAuditDecision;
  }

  if (merged.executionProfileJson == null && supplement.executionProfileJson != null) {
    patch.executionProfileJson = supplement.executionProfileJson;
  }

  if (nextMeta !== merged.metadataJson) {
    patch.metadataJson = nextMeta ?? null;
  }

  if (Object.keys(patch).length === 0) return merged;
  return { ...merged, ...patch };
}

function withUploadedSourceIntel(
  previewMerged: ApiBuildUnit,
  supplement: ApiBuildUnit
): ApiBuildUnit {
  return mergeUploadedSourceIntelFromSupplement(previewMerged, supplement);
}

/**
 * Fold preview-related fields from a supplemental row (list cache, detail cache, compose-resolve, etc.)
 * onto the canonical row for this surface.
 *
 * Merge priorities (preview correctness over a single stale tab row):
 * 1. Any supplemental row that introduces stored artifact ids the canonical lacks wins immediately
 *    (snapshot/file ids are the strongest signal that a static preview exists).
 * 2. When both sides already have artifacts, prefer a **snapshot id** on the supplement over a
 *    file-only canonical (better catalog parity with the panel), else prefer strictly newer `updatedAt`
 *    when artifact ids differ (tie-break for competing cache rows).
 * 3. When neither side has bytes yet, propagate **terminal** `previewPipelineStatus === "failed"` and
 *    **live delivery** `livePreview.available === true` from the supplement so the panel does not
 *    silently disagree with a fresher detail payload while the grid row is still catching up.
 *
 * After preview-field resolution, **upload intelligence** from the supplement is folded in when it is
 * strictly additive or richer (e.g. `intakeDetectionJson`, source file columns, `intakeAuditDecision`,
 * `metadataJson.sourceIntakeSessionId`, `executionProfileJson`) so catalog rows gain detail truth without
 * overwriting stronger canonical detection.
 */
export function mergeExplorePreviewSupplementOntoCanonical(
  canonical: ApiBuildUnit,
  supplement: ApiBuildUnit | undefined | null
): ApiBuildUnit {
  if (!supplement || supplement.id !== canonical.id) return canonical;

  const listHasArtifact = Boolean(supplement.previewSnapshotId || supplement.previewFileId);
  const canonicalHasArtifact = Boolean(canonical.previewSnapshotId || canonical.previewFileId);

  if (listHasArtifact && !canonicalHasArtifact) {
    return withUploadedSourceIntel(
      {
        ...canonical,
        previewSnapshotId: supplement.previewSnapshotId ?? canonical.previewSnapshotId,
        previewFileId: supplement.previewFileId ?? canonical.previewFileId,
        previewKind: supplement.previewKind ?? canonical.previewKind,
        /** New artifact on the supplement row — only adopt a usable static URL; never placeholder lineage. */
        previewImageUrl: usableExternalPreviewImageUrl(supplement.previewImageUrl) ?? null,
        intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
        intakePreviewUnavailableReason:
          supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
        previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
        livePreview: supplement.livePreview ?? canonical.livePreview,
        previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
        normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
        updatedAt: supplement.updatedAt
      },
      supplement
    );
  }

  if (listHasArtifact && canonicalHasArtifact) {
    const idsChanged =
      (supplement.previewSnapshotId ?? "") !== (canonical.previewSnapshotId ?? "") ||
      (supplement.previewFileId ?? "") !== (canonical.previewFileId ?? "");
    if (idsChanged) {
      const preferSupplementArtifact =
        (Boolean(supplement.previewSnapshotId) && !canonical.previewSnapshotId) ||
        Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt);
      if (preferSupplementArtifact) {
        return withUploadedSourceIntel(
          {
            ...canonical,
            previewSnapshotId: supplement.previewSnapshotId ?? canonical.previewSnapshotId,
            previewFileId: supplement.previewFileId ?? canonical.previewFileId,
            previewKind: supplement.previewKind ?? canonical.previewKind,
            /**
             * New artifact lineage: do not retain the prior row’s catalog image URL — it often belongs to
             * the old snapshot and causes raster cascade leakage ahead of fresh blob bytes.
             */
            previewImageUrl: usableExternalPreviewImageUrl(supplement.previewImageUrl) ?? null,
            intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
            intakePreviewUnavailableReason:
              supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
            previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
            livePreview: supplement.livePreview ?? canonical.livePreview,
            previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
            normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
            updatedAt:
              Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
                ? supplement.updatedAt
                : canonical.updatedAt
          },
          supplement
        );
      }
    } else if (Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)) {
      return withUploadedSourceIntel(
        {
          ...canonical,
          previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
          livePreview: supplement.livePreview ?? canonical.livePreview,
          intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
          intakePreviewUnavailableReason:
            supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
          previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
          normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
          previewImageUrl: mergePreviewImageUrlWhenSupplementNewer(canonical, supplement),
          updatedAt: supplement.updatedAt
        },
        supplement
      );
    }
  }

  if (
    !canonicalHasArtifact &&
    !listHasArtifact &&
    isUsableExternalPreviewImageUrl(supplement.previewImageUrl) &&
    !isUsableExternalPreviewImageUrl(canonical.previewImageUrl)
  ) {
    const adopted = usableExternalPreviewImageUrl(supplement.previewImageUrl);
    return withUploadedSourceIntel(
      {
        ...canonical,
        previewImageUrl: adopted,
        previewKind: supplement.previewKind ?? canonical.previewKind,
        previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
        livePreview: supplement.livePreview ?? canonical.livePreview,
        previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
        intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
        intakePreviewUnavailableReason:
          supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
        normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
        updatedAt:
          Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
            ? supplement.updatedAt
            : canonical.updatedAt
      },
      supplement
    );
  }

  if (
    !canonicalHasArtifact &&
    !listHasArtifact &&
    (supplement.previewPipelineStatus != null ||
      supplement.previewFeasibility != null ||
      supplement.livePreview != null ||
      supplement.normalizedReview != null) &&
    (canonical.previewPipelineStatus == null ||
      canonical.previewFeasibility == null ||
      canonical.livePreview == null ||
      canonical.normalizedReview == null)
  ) {
    return withUploadedSourceIntel(
      {
        ...canonical,
        previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
        livePreview: supplement.livePreview ?? canonical.livePreview,
        previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
        normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
        intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
        intakePreviewUnavailableReason:
          supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
        updatedAt:
          Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
            ? supplement.updatedAt
            : canonical.updatedAt
      },
      supplement
    );
  }

  if (
    !canonicalHasArtifact &&
    !listHasArtifact &&
    supplement.previewPipelineStatus === "failed" &&
    canonical.previewPipelineStatus !== "failed"
  ) {
    return withUploadedSourceIntel(
      {
        ...canonical,
        previewPipelineStatus: supplement.previewPipelineStatus,
        intakePreviewUnavailableReason:
          supplement.intakePreviewUnavailableReason ?? canonical.intakePreviewUnavailableReason,
        intakePreviewState: supplement.intakePreviewState ?? canonical.intakePreviewState,
        livePreview: supplement.livePreview ?? canonical.livePreview,
        previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
        normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
        updatedAt:
          Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
            ? supplement.updatedAt
            : canonical.updatedAt
      },
      supplement
    );
  }

  if (
    supplement.livePreview?.available === true &&
    canonical.livePreview?.available !== true &&
    !canonicalHasArtifact &&
    !listHasArtifact
  ) {
    return withUploadedSourceIntel(
      {
        ...canonical,
        livePreview: supplement.livePreview,
        previewPipelineStatus: supplement.previewPipelineStatus ?? canonical.previewPipelineStatus,
        previewFeasibility: supplement.previewFeasibility ?? canonical.previewFeasibility,
        normalizedReview: supplement.normalizedReview ?? canonical.normalizedReview,
        updatedAt:
          Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
            ? supplement.updatedAt
            : canonical.updatedAt
      },
      supplement
    );
  }

  if (supplement.livePreview?.available === true && canonical.livePreview?.available !== true) {
    return withUploadedSourceIntel(
      {
        ...canonical,
        livePreview: supplement.livePreview,
        updatedAt:
          Date.parse(supplement.updatedAt) > Date.parse(canonical.updatedAt)
            ? supplement.updatedAt
            : canonical.updatedAt
      },
      supplement
    );
  }

  return withUploadedSourceIntel(canonical, supplement);
}

function previewMetadataScoreForAuthority(u: ApiBuildUnit): number {
  let score = 0;
  if (u.previewSnapshotId) score += 16;
  if (u.previewFileId) score += 12;
  if (u.livePreview?.available === true) score += 8;
  if (u.previewPipelineStatus != null) score += 4;
  if (u.previewFeasibility != null) score += 3;
  if (u.normalizedReview != null) score += 2;
  if (u.intakePreviewState != null) score += 1;
  if (isUsableExternalPreviewImageUrl(u.previewImageUrl)) score += 2;
  return score;
}

/** When two cached rows represent the same unit id, pick the one with richer preview metadata. */
export function preferPreviewRicherBuildUnitRow(best: ApiBuildUnit, hit: ApiBuildUnit): ApiBuildUnit {
  const hitArt = Boolean(hit.previewSnapshotId || hit.previewFileId);
  const bestArt = Boolean(best.previewSnapshotId || best.previewFileId);
  if (hitArt && !bestArt) {
    return hit;
  }
  if (bestArt && !hitArt) {
    return best;
  }
  if (hitArt && bestArt) {
    const idsHit = `${hit.previewSnapshotId ?? ""}|${hit.previewFileId ?? ""}`;
    const idsBest = `${best.previewSnapshotId ?? ""}|${best.previewFileId ?? ""}`;
    if (idsHit !== idsBest) {
      return Date.parse(hit.updatedAt) >= Date.parse(best.updatedAt) ? hit : best;
    }
  }
  const hitScore = previewMetadataScoreForAuthority(hit);
  const bestScore = previewMetadataScoreForAuthority(best);
  if (hitScore !== bestScore) {
    return hitScore > bestScore ? hit : best;
  }
  const hitTs = Date.parse(hit.updatedAt);
  const bestTs = Date.parse(best.updatedAt);
  if (hitTs === bestTs) {
    const hitImg = isUsableExternalPreviewImageUrl(hit.previewImageUrl);
    const bestImg = isUsableExternalPreviewImageUrl(best.previewImageUrl);
    if (hitImg !== bestImg) return hitImg ? hit : best;
  }
  return hitTs >= bestTs ? hit : best;
}

/**
 * Best-effort list row for this id across all cached `build-units` query variants (tabs/filters).
 * Prefers rows with stored preview artifacts, then newer `updatedAt`, then differing artifact ids.
 */
export function pickBestBuildUnitListRowFromCaches(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit | undefined {
  const rows = queryClient.getQueriesData<ApiBuildUnit[]>({ queryKey: ["build-units"], exact: false });
  let best: ApiBuildUnit | undefined;
  for (const [, data] of rows) {
    const hit = data?.find((u) => u.id === unitId);
    if (!hit) continue;
    best = best ? preferPreviewRicherBuildUnitRow(best, hit) : hit;
  }
  return best;
}

/**
 * Legacy Explore catalog query cache shape (`["explore-v2","catalog"]`) — kept for Studio preview preference fallbacks.
 */
export function pickBestExploreV2CatalogRowFromCaches(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit | undefined {
  const rows = queryClient.getQueriesData<{ ok?: boolean; units?: ApiBuildUnit[] }>({
    queryKey: ["explore-v2", "catalog"],
    exact: false
  });
  let best: ApiBuildUnit | undefined;
  for (const [, raw] of rows) {
    const data = raw?.ok ? raw.units : undefined;
    const hit = data?.find((u) => u.id === unitId);
    if (!hit) continue;
    best = best ? preferPreviewRicherBuildUnitRow(best, hit) : hit;
  }
  return best;
}

function parseExploreV2DetailQueryPayload(data: unknown): ApiBuildUnit | undefined {
  if (!data || typeof data !== "object") return undefined;
  const o = data as { ok?: boolean; unit?: ApiBuildUnit };
  if (o.ok && o.unit && typeof o.unit.id === "string") return o.unit;
  return undefined;
}

/**
 * Legacy Explore unit-detail query cache (`["explore-v2","detail", unitId]`) — key may include token suffix.
 */
export function collectFromExploreV2Detail(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit | undefined {
  const rows = queryClient.getQueriesData<unknown>({
    queryKey: ["explore-v2", "detail", unitId],
    exact: false
  });
  let best: ApiBuildUnit | undefined;
  for (const [, data] of rows) {
    const hit = parseExploreV2DetailQueryPayload(data);
    if (!hit || hit.id !== unitId) continue;
    best = best ? preferPreviewRicherBuildUnitRow(best, hit) : hit;
  }
  return best;
}

export function collectFromBuildUnitsList(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit | undefined {
  return pickBestBuildUnitListRowFromCaches(queryClient, unitId);
}

export function collectFromBuildUnitDetail(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit | undefined {
  return queryClient.getQueryData<ApiBuildUnit>(["build-unit-detail", unitId]);
}

export function collectFromComposeResolve(
  queryClient: QueryClient,
  unitId: string
): ApiBuildUnit[] {
  const composeRows = queryClient.getQueriesData<ApiBuildUnit | null>({
    queryKey: ["build-unit", "compose-resolve"],
    exact: false
  });
  const out: ApiBuildUnit[] = [];
  for (const [, row] of composeRows) {
    if (row?.id === unitId) out.push(row);
  }
  return out;
}

const DEFAULT_PREVIEW_AUTHORITY_COLLECTORS: PreviewAuthorityCollector[] = [
  collectFromBuildUnitsList,
  pickBestExploreV2CatalogRowFromCaches,
  collectFromBuildUnitDetail,
  collectFromExploreV2Detail,
  collectFromComposeResolve
];

/**
 * Resolves the freshest preview-relevant slice of a build unit across React Query caches (and optional
 * handoff). Same shape as `ApiBuildUnit`; preview-adjacent fields are merged per
 * `mergeExplorePreviewSupplementOntoCanonical`.
 *
 * @param primaryUnit — Surface row (grid selection, detail props, etc.). When omitted, seeds from list
 *   then detail cache (both must match `unitId`).
 */
export function resolveAuthoritativePreviewUnit(
  queryClient: QueryClient,
  unitId: string,
  primaryUnit?: ApiBuildUnit,
  options?: ResolveAuthoritativePreviewUnitOptions
): AuthoritativePreviewUnit {
  if (primaryUnit && primaryUnit.id !== unitId) {
    return ensureDevAuthorityMark(sanitizeBuildUnitPreviewFields(primaryUnit)) as AuthoritativePreviewUnit;
  }

  const seed =
    primaryUnit?.id === unitId
      ? primaryUnit
      : pickBestBuildUnitListRowFromCaches(queryClient, unitId) ??
        pickBestExploreV2CatalogRowFromCaches(queryClient, unitId) ??
        queryClient.getQueryData<ApiBuildUnit>(["build-unit-detail", unitId]) ??
        collectFromExploreV2Detail(queryClient, unitId);

  if (!seed || seed.id !== unitId) {
    if (import.meta.env.DEV) {
      console.warn(
        "[previewAuthority] resolveAuthoritativePreviewUnit: no matching primary or cache seed",
        { unitId }
      );
    }
    return ({ id: unitId } as ApiBuildUnit) as AuthoritativePreviewUnit;
  }

  let u = sanitizeBuildUnitPreviewFields(seed);
  for (const collector of DEFAULT_PREVIEW_AUTHORITY_COLLECTORS) {
    u = applyCollector(u, queryClient, unitId, collector);
  }
  for (const collector of options?.extraCollectors ?? []) {
    u = applyCollector(u, queryClient, unitId, collector);
  }

  const handoff = options?.handoffUnit?.id === unitId ? options.handoffUnit : undefined;
  if (handoff) u = mergeExplorePreviewSupplementOntoCanonical(u, sanitizeBuildUnitPreviewFields(handoff));

  u = sanitizeBuildUnitPreviewFields(u);
  if (import.meta.env.DEV && isLikelyPlaceholderPreviewImageUrl(u.previewImageUrl)) {
    devWarnPreviewInvariantViolation("resolveAuthoritativePreviewUnit_post_merge", {
      unitId: u.id,
      previewImageUrl: u.previewImageUrl ?? null
    });
  }

  return ensureDevAuthorityMark(u);
}

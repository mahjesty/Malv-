import type { ApiBuildUnit } from "../api/dataPlane";

/** Must match `FIXTURE_UNIT_TAG` in `apps/api/src/dev-seed/dev-explore-fixtures.service.ts`. */
export const MALV_LIVE_PREVIEW_FIXTURE_METADATA_TAG = "explore-landing-preview-unit";

/** Stable title for the seeded golden-path live preview unit. */
export const MALV_LIVE_PREVIEW_FIXTURE_TITLE = "MALV Live Preview Fixture";

export function isMalvLivePreviewFixtureUnit(u: ApiBuildUnit): boolean {
  const m = u.metadataJson;
  const tag =
    m && typeof m === "object" && !Array.isArray(m)
      ? (m as { malvDevFixture?: unknown }).malvDevFixture
      : undefined;
  if (tag === MALV_LIVE_PREVIEW_FIXTURE_METADATA_TAG) return true;
  return u.title === MALV_LIVE_PREVIEW_FIXTURE_TITLE;
}

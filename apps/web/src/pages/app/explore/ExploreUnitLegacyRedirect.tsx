import { Navigate, useParams } from "react-router-dom";

/** Legacy catalog deep links → Studio build unit context (honest handoff, no dead Explore detail page). */
export function ExploreUnitLegacyRedirect() {
  const { unitId } = useParams();
  const id = unitId?.trim();
  if (!id) return <Navigate to="/app/explore" replace />;
  return <Navigate to={`/app/studio?unitId=${encodeURIComponent(id)}&fromSurface=explore_legacy`} replace />;
}

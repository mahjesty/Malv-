import { Navigate, useParams } from "react-router-dom";

/** Maps `/admin/self-upgrade` → `/app/admin/self-upgrade` (authenticated app shell). */
export function RedirectAdminSelfUpgrade() {
  const { id } = useParams();
  return <Navigate to={id ? `/app/admin/self-upgrade/${id}` : "/app/admin/self-upgrade"} replace />;
}

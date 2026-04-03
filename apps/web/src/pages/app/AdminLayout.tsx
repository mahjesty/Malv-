import { Outlet } from "react-router-dom";

/** Nested admin routes share the same AdminGate parent in AppShellPage. */
export default function AdminLayout() {
  return <Outlet />;
}

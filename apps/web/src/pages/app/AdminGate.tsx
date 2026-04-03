import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { Card } from "@malv/ui";

export function AdminGate(props: { children: ReactNode }) {
  const { status, role } = useAuth();
  const allowed = status === "authenticated" ? role === "admin" : null;

  if (status === "loading" || allowed === null) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <Card variant="glass" className="p-6 max-w-md w-full">
          <div className="text-sm text-malv-text/70">Verifying admin role…</div>
        </Card>
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  return <>{props.children}</>;
}

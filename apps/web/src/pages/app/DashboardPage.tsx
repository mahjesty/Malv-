import { Navigate } from "react-router-dom";

/** Dashboard route redirects to the real Operator chat — avoids duplicate mock shell. Chat UI is a premium surface (`src/lib/ui/premiumUiBoundary.ts`). */
export function DashboardPage() {
  return <Navigate to="/app/chat" replace />;
}

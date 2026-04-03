import { Link } from "react-router-dom";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip } from "@malv/ui";

export function NotificationsPage() {
  return (
    <ModuleShell
      kicker="Signals"
      title="Activity"
      subtitle="No live notification feed in this build — use sessions and tickets for actionable history."
    >
      <Card variant="glass" className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-bold text-sm">Feed</div>
          <StatusChip label="Not connected" status="neutral" />
        </div>
        <p className="text-sm text-malv-text/65 mt-3 leading-relaxed">
          Job and audit events are not subscribed here yet. For real threads, open{" "}
          <Link to="/app/tickets" className="text-brand underline-offset-2 hover:underline">
            support tickets
          </Link>{" "}
          or recent{" "}
          <Link to="/app/conversations" className="text-brand underline-offset-2 hover:underline">
            sessions
          </Link>
          .
        </p>
      </Card>
    </ModuleShell>
  );
}

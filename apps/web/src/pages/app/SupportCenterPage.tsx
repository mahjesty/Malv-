import { useNavigate } from "react-router-dom";
import { ModuleShell } from "./common/ModuleShell";
import { Card, Button, StatusChip } from "@malv/ui";

export function SupportCenterPage() {
  const navigate = useNavigate();
  return (
    <ModuleShell
      kicker="Human loop"
      title="Support center"
      subtitle="AI-assisted triage is not connected yet. Use tickets for real escalation — the same system the team uses."
      right={<StatusChip label="Tickets live" status="ok" />}
    >
      <div className="space-y-3">
        <Card variant="glass" className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-sm">Create a support ticket</div>
            <StatusChip label="Beta" status="neutral" />
          </div>
          <p className="text-sm text-malv-text/70 mt-2 leading-relaxed">
            Open the ticket workspace to create a threaded conversation with support. Messages are stored in MALV and show up in the
            detail view.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="px-5" onClick={() => navigate("/app/tickets")}>
              Go to tickets
            </Button>
            <Button variant="secondary" className="px-5" onClick={() => navigate("/help")}>
              Help center index
            </Button>
          </div>
        </Card>

        <Card variant="glass" className="border border-white/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-sm">AI-assisted triage</div>
            <StatusChip label="Not connected" status="neutral" />
          </div>
          <p className="text-sm text-malv-text/70 mt-2 leading-relaxed">
            Automated first-line answers from help articles are not wired in this build. Use tickets or email for human support.
          </p>
        </Card>

        <Card variant="glass" className="p-4">
          <div className="font-bold text-sm">Help center quick picks</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { t: "Reset password & OTP", d: "Secure recovery flows and trusted device guidance." },
              { t: "Beast Mode safety", d: "How proactive suggestions are gated and audited." },
              { t: "Vault access rules", d: "Secret phrase triggers and isolation guarantees." },
              { t: "Files & private understanding", d: "How uploads are processed in the sandbox + GPU worker." }
            ].map((x) => (
              <div key={x.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="text-sm font-semibold">{x.t}</div>
                <div className="text-sm text-malv-text/70 mt-1 leading-relaxed">{x.d}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-malv-text/50">Full article pages are indexed only — browse categories on the public help hub.</p>
        </Card>
      </div>
    </ModuleShell>
  );
}

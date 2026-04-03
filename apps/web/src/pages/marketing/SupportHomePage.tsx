import MarketingLayout from "./MarketingLayout";
import { Card, Button } from "@malv/ui";

export default function SupportHomePage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Support</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          AI-first helpdesk integrated with live escalation and audit-safe ticketing.
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card variant="glass" className="p-4">
            <div className="font-bold text-sm">Help Center</div>
            <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
              Search articles by category and get curated answers before escalation.
            </div>
            <div className="mt-4">
              <Button className="w-full px-6" onClick={() => (window.location.href = "/help")}>
                Browse help articles
              </Button>
            </div>
          </Card>
          <Card variant="glass" className="p-4">
            <div className="font-bold text-sm">Live Support</div>
            <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
              When AI guidance can’t resolve the issue, you can open a ticket and escalate to support staff.
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="px-6" onClick={() => (window.location.href = "/auth/signup")}>
                Open ticket
              </Button>
              <Button variant="secondary" className="px-6" onClick={() => (window.location.href = "/help")}>
                Contact options
              </Button>
            </div>
          </Card>
        </div>

        <div className="mt-6 text-xs text-malv-text/55">
          Privacy: sensitive details should be minimized until identity/session checks are satisfied.
        </div>
      </div>
    </MarketingLayout>
  );
}


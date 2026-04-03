import MarketingLayout from "../marketing/MarketingLayout";
import { Card } from "@malv/ui";

export default function TermsPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Terms of Service</div>
        <Card variant="glass" className="p-4 mt-6">
          <div className="text-sm text-malv-text/70 leading-relaxed whitespace-pre-wrap">
            MALV provides a private AI operating platform. You agree to use MALV responsibly, avoid prohibited content, and respect ownership boundaries.
            Admin emergency kill-switch supervision may interrupt certain operations during security events.
            Some features may depend on deployment configuration (CPU/GPU workers, private inference runtime).
          </div>
          <div className="mt-4 text-sm text-malv-text/70 leading-relaxed whitespace-pre-wrap">
            This is a template terms surface for the MALV product foundation. Legal review is required before public launch.
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}


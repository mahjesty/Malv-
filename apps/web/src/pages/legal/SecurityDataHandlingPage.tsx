import MarketingLayout from "../marketing/MarketingLayout";
import { Card } from "@malv/ui";

export default function SecurityDataHandlingPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Security & Data Handling</div>
        <Card variant="glass" className="p-4 mt-6">
          <div className="text-sm text-malv-text/70 leading-relaxed whitespace-pre-wrap">
            MALV is designed with: role/ownership checks, vault isolation, policy-gated memory access, audit events for sensitive actions,
            sandbox execution for risky operations, and external supervisor kill-switch enforcement.
            The private Beast worker runs locally/private and does not rely on external model APIs for core operation.
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}


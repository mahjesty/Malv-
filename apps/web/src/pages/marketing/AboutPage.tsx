import MarketingLayout from "./MarketingLayout";
import { Card } from "@malv/ui";

export default function AboutPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-4">
        <div className="text-2xl font-extrabold tracking-tight">About MALV</div>
        <div className="text-sm text-malv-text/70 leading-relaxed">
          MALV is a private AI operating platform that combines companion intelligence, proactive Beast Mode, isolated vault memory,
          sandboxed execution, support/helpdesk systems, and admin command/control—backed by private/local GPU worker architecture.
        </div>

        <Card variant="glass" className="p-4">
          <div className="font-bold text-sm">Design principles</div>
          <div className="mt-3 text-sm text-malv-text/70 leading-relaxed space-y-2">
            <div>• Private-first by design: vault isolation and policy gates.</div>
            <div>• Modular by engineering: strict layer separation.</div>
            <div>• Premium by UX: mobile-first, elegant, smooth, data-dense where needed.</div>
            <div>• Auditable by default: admin control, audit events, and kill-switch monitoring.</div>
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}


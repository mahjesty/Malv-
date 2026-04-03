import MarketingLayout from "./MarketingLayout";
import { Card, Button } from "@malv/ui";

function PlanCard(props: { name: string; price: string; desc: string; perks: string[]; cta: string }) {
  return (
    <Card variant="glass" className="p-4">
      <div className="text-sm font-bold">{props.name}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight">{props.price}</div>
      <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">{props.desc}</div>
      <div className="mt-3 space-y-1">
        {props.perks.map((p) => (
          <div key={p} className="text-sm text-malv-text/70">
            • {p}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button onClick={() => (window.location.href = "/auth/signup")} className="w-full px-6">
          {props.cta}
        </Button>
      </div>
    </Card>
  );
}

export default function PricingPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Pricing</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          Premium private intelligence. Local/private workers can be supported from day one with a clear architecture.
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlanCard
            name="Starter"
            price="$0"
            desc="Explore the product foundation."
            perks={["Companion chat UI", "Basic memory controls", "Help center + tickets"]}
            cta="Create account"
          />
          <PlanCard
            name="Private Plus"
            price="$29"
            desc="Premium companion + Beast-ready orchestration."
            perks={["Beast Mode levels", "Vault isolation UX", "File understanding pipeline"]}
            cta="Go Private Plus"
          />
        </div>

        <div className="mt-4 text-xs text-malv-text/55">
          Final pricing depends on deployment model and worker hardware. MALV architecture supports CPU-only or GPU dispatch paths.
        </div>
      </div>
    </MarketingLayout>
  );
}


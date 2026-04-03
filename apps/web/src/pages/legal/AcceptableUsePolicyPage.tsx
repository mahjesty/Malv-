import MarketingLayout from "../marketing/MarketingLayout";
import { Card } from "@malv/ui";

export default function AcceptableUsePolicyPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Acceptable Use Policy</div>
        <Card variant="glass" className="p-4 mt-6">
          <div className="text-sm text-malv-text/70 leading-relaxed whitespace-pre-wrap">
            You agree not to use MALV to violate law, facilitate wrongdoing, or attempt unauthorized access.
            Advanced actions may require sandbox policy gates and approvals.
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}


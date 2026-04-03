import MarketingLayout from "../marketing/MarketingLayout";
import { Card } from "@malv/ui";

export default function CookiePolicyPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Cookie Policy</div>
        <Card variant="glass" className="p-4 mt-6">
          <div className="text-sm text-malv-text/70 leading-relaxed whitespace-pre-wrap">
            MALV may use cookies or similar storage for secure session handling, trusted device state, and UI preferences.
            We aim to minimize tracking and preserve privacy. Disable non-essential cookies when supported by your browser.
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}


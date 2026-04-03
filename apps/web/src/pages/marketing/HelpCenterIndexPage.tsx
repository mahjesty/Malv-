import MarketingLayout from "./MarketingLayout";
import { Card, StatusChip } from "@malv/ui";

export default function HelpCenterIndexPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-2xl font-extrabold tracking-tight">Help Center</div>
          <StatusChip label="Preview index" status="neutral" />
        </div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          Category overview only — searchable articles and deep links are not wired in this build. Use in-app tickets for account-specific
          help.
        </div>

        <div className="mt-6 space-y-3">
          {[
            { c: "Account", d: "Login, verification, trusted devices, and secure recovery." },
            { c: "Beast Mode", d: "Beast proactive intelligence levels and safety gates." },
            { c: "Vault", d: "Secret phrases, vault isolation, and capture flows." },
            { c: "Files", d: "Uploads, private understanding, transcription hooks, sandbox policy." },
            { c: "Support Tickets", d: "Ticket status, attachments, escalation rules, and audit safety." }
          ].map((x) => (
            <Card key={x.c} variant="glass" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{x.c}</div>
                  <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">{x.d}</div>
                </div>
                <StatusChip label="Topic" status="neutral" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}

import MarketingLayout from "./MarketingLayout";
import { Card, StatusChip } from "@malv/ui";

export default function FeaturesPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Features</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          Built as a premium private operating platform: clear module boundaries, policy gates, vault isolation, private GPU workers, and live support.
        </div>

        <div className="mt-6 space-y-3">
          {[
            { chip: "Companion", t: "Emotionally intelligent chat + operator", d: "Streaming responses with memory scope boundaries, file understanding, and premium UX ergonomics." },
            { chip: "Builder", t: "Project/work productivity intelligence", d: "Friction detection, unfinished work detection, and staged planning for eligible sandbox workflows." },
            { chip: "Voice/Video", t: "Real call foundations", d: "WebRTC signaling architecture with call state, transcript schema, and vault trigger flows (policy-gated)." },
            { chip: "Memory/Vault", t: "Layered memory + isolated secret vault", d: "Vault memory is separated by design; no casual leakage into normal chat flow." },
            { chip: "Beast Mode", t: "Proactive Beast Mode with GPU routing", d: "Passive → Smart → Advanced → Beast levels, with heavy reasoning dispatched to the private GPU worker." },
            { chip: "Support", t: "AI-first helpdesk with live escalation", d: "Summarize issues, open tickets, manage status history, and route to support staff when needed." },
            { chip: "Admin/Control", t: "Admin command & audit visibility", d: "Role separation, kill-switch control UI, worker health visibility, logs and audits." },
            { chip: "Sandbox", t: "Isolated execution layer", d: "Risky operations stage in a sandbox with validation, audit logs, approvals and safe status outcomes." }
          ].map((x) => (
            <Card key={x.t} variant="glass" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{x.t}</div>
                  <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">{x.d}</div>
                </div>
                <StatusChip label={x.chip} status="neutral" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}


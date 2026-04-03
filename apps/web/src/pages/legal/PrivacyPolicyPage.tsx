import MarketingLayout from "../marketing/MarketingLayout";
import { Card } from "@malv/ui";

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="font-bold text-sm">{props.title}</div>
      <div className="text-sm text-malv-text/70 mt-2 leading-relaxed whitespace-pre-wrap">{props.children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Privacy Policy</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          This document describes how MALV handles data. MALV is designed with private-first architecture, vault isolation, and auditable access control.
        </div>

        <Card variant="glass" className="p-4 mt-6">
          <Section title="Overview">
            MALV is a private AI operating platform. The architecture separates companion memory from vault memory and routes heavy operations to private/local workers.
            When deployed, MALV may store account data, conversation metadata, and audit events required for security and service continuity.
          </Section>
          <Section title="Data categories">
            Account data: display name, email, and verification status.
            Session data: trusted device/session state and access token refresh records.
            Intelligence data: conversation transcripts, message metadata, memory entries (scoped by user policy).
            Vault data: secret vault entries stored in a dedicated, isolated vault layer.
            Support data: help center article references, tickets, and support messages.
          </Section>
          <Section title="Local/private worker posture">
            MALV does not require external AI APIs for core operation. The private Beast worker runs locally/private and can be GPU-aware.
            Kill-switch supervision is external to MALV’s normal decision layer to allow admin emergency shutdown.
          </Section>
          <Section title="Security and retention">
            MALV enforces role-based access checks and ownership checks. Audit events are logged for sensitive admin actions.
            Retention periods depend on user settings and operational policy.
          </Section>
          <Section title="Contact">
            For privacy requests, use the support center or contact the MALV team.
          </Section>
        </Card>
      </div>
    </MarketingLayout>
  );
}


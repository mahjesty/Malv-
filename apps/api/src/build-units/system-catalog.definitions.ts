import type { BuildUnitEntity } from "../db/entities/build-unit.entity";

/**
 * Curated static card art lives under the web app `public/explore-catalog/`. Rows store root-relative
 * paths; {@link normalizePublishedPreviewImageUrl} expands them to absolute URLs on API responses
 * using `WEB_ORIGIN` / `SOCKET_CORS_ORIGIN`.
 */

/** Default preview/source columns for seeded system units. */
export const BU_ASSET_DEFAULTS = {
  previewKind: "none" as const,
  previewFileId: null as string | null,
  previewSnapshotId: null as string | null,
  sourceFileId: null as string | null,
  sourceFileName: null as string | null,
  sourceFileMime: null as string | null,
  sourceFileUrl: null as string | null,
  intakePreviewState: null as null,
  intakePreviewUnavailableReason: null as null,
  intakeAuditDecision: null as null,
  intakeDetectionJson: null as null
};

/** Grid card preview treatment + deterministic Featured ordering (web client). */
export function catalogIllustratedMeta(rank: number): Record<string, unknown> {
  return {
    malvExplorePreviewClass: "catalog_illustrated_static",
    malvExploreFeaturedRank: rank
  };
}

function hiddenCatalogMeta(): Record<string, unknown> {
  return {
    malvExplorePreviewClass: "catalog_illustrated_static",
    malvExploreBrowseExclude: true
  };
}

/**
 * Curated MALV Explore system catalog — seeded on API boot (idempotent by slug).
 * `malvExploreBrowseExclude` hides units from the default catalog list (still findable via search).
 * `malvExploreFeaturedRank` orders the first-screen grid when not searching.
 */
export const SYSTEM_UNITS: Omit<
  BuildUnitEntity,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
  | "usesCount"
  | "forksCount"
  | "downloadsCount"
  | "executionProfileJson"
>[] = [
  {
    ...BU_ASSET_DEFAULTS,
    slug: "landing-page",
    title: "SaaS Landing Page",
    description:
      "Premium marketing surface: hero, proof, feature grid, pricing teaser, FAQ, and footer — responsive and conversion-ready.",
    type: "template",
    category: "site",
    tags: ["nextjs", "tailwind", "marketing", "saas"],
    prompt:
      "Design and build a premium SaaS landing page: bold hero, social proof, feature grid, pricing teaser, FAQ, and polished footer. Keep layout responsive, minimal, and conversion-focused.",
    codeSnippet: `// Hero — swap copy, keep rhythm
export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 text-center">
      <Badge>New</Badge>
      <h1 className="mt-6 text-5xl font-bold tracking-tight">
        Ship product, not process
      </h1>
      <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
        MALV turns intent into working software your team can run.
      </p>
      <div className="mt-10 flex justify-center gap-4">
        <Button size="lg">Start free</Button>
        <Button size="lg" variant="outline">View demo</Button>
      </div>
    </section>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.65 0.14 220)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/landing-page.svg",
    metadataJson: catalogIllustratedMeta(1)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "product-pricing-page",
    title: "Product Pricing Page",
    description:
      "Plan comparison, annual toggle, feature matrix, FAQs, and enterprise contact — built to clarify value and drive upgrades.",
    type: "template",
    category: "site",
    tags: ["pricing", "billing", "conversion", "saas"],
    prompt:
      "Build a polished pricing page: three-tier plan cards, monthly/annual toggle, comparison table, trust badges, FAQ block, and enterprise sales CTA. Emphasize clarity over clutter.",
    codeSnippet: `<section className="mx-auto max-w-6xl px-6 py-20">
  <h1 className="text-center text-4xl font-bold">Simple pricing</h1>
  <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
    Start small, scale when you are ready. Every plan includes core execution tools.
  </p>
  <BillingToggle className="mx-auto mt-10" />
  <div className="mt-12 grid gap-6 md:grid-cols-3">
    {PLANS.map((p) => <PlanCard key={p.id} plan={p} />)}
  </div>
</section>`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: true,
    isNew: false,
    accent: "oklch(0.66 0.14 30)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/product-pricing-page.svg",
    metadataJson: catalogIllustratedMeta(2)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "dashboard-overview",
    title: "Dashboard Overview",
    description:
      "Executive overview with KPI tiles, trend sparklines, activity feed, and quick actions — tuned for daily operations.",
    type: "template",
    category: "site",
    tags: ["dashboard", "analytics", "admin", "tailwind"],
    prompt:
      "Create a modern product dashboard overview: KPI stat tiles with deltas, small trend charts, recent activity list, segmented quick actions, and empty states. Dark-friendly, accessible contrast.",
    codeSnippet: `export function Overview() {
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-12">
      <div className="lg:col-span-8 space-y-6">
        <KpiStrip metrics={METRICS} />
        <RevenueChart range={range} />
      </div>
      <aside className="lg:col-span-4 space-y-6">
        <ActivityFeed items={events} />
        <QuickActions />
      </aside>
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.68 0.12 260)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/dashboard-overview.svg",
    metadataJson: catalogIllustratedMeta(3)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "auth-sign-in-experience",
    title: "Auth / Sign-in Experience",
    description:
      "Email + OAuth entry, magic link path, error states, and security copy — feels trustworthy on first launch.",
    type: "template",
    category: "ui",
    tags: ["auth", "oauth", "security", "onboarding"],
    prompt:
      "Design a premium sign-in experience: split layout with product story, email + password form, Google/GitHub OAuth, magic-link option, rate-limit messaging, and accessible focus states.",
    codeSnippet: `export function SignIn() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel tagline="Execution-first workspace" />
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Welcome back</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <OAuthRow />
            <Divider label="or continue with email" />
            <SignInForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: true,
    accent: "oklch(0.68 0.15 280)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/auth-sign-in-experience.svg",
    metadataJson: catalogIllustratedMeta(4)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "command-palette",
    title: "Command Palette",
    description: "Keyboard-first command surface — fuzzy search, groups, and instant navigation across your app.",
    type: "component",
    category: "ui",
    tags: ["react", "accessibility", "keyboard", "productivity"],
    prompt:
      "Build a production command palette: fuzzy search, grouped commands, keyboard navigation (↑↓ Enter Esc), recent commands, and extension hooks for third-party actions.",
    codeSnippet: `function CommandPalette({ commands }: { commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = useMemo(() => fuzzyFilter(commands, query), [commands, query]);
  return (
    <Dialog>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} />
      <CommandList results={results} selected={selected} onSelect={setSelected} />
    </Dialog>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.68 0.15 280)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/command-palette.svg",
    metadataJson: catalogIllustratedMeta(5)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "ai-chat-interface",
    title: "AI Chat Interface",
    description:
      "Streaming assistant UI with history, tool-call cards, citations, and model controls — ready for production workloads.",
    type: "component",
    category: "ai",
    tags: ["ai", "streaming", "react", "copilot"],
    prompt:
      "Build a production AI chat UI: streaming tokens, message history with branches, tool invocation cards, code blocks with copy, model selector, and token budget hints.",
    codeSnippet: `function ChatInterface({ modelId }: { modelId: string }) {
  const { messages, input, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    body: { modelId },
  });
  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} />
      <ChatInput value={input} onSubmit={handleSubmit} disabled={isLoading} />
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.68 0.15 280)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/ai-chat-interface.svg",
    metadataJson: catalogIllustratedMeta(6)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "settings-preferences-surface",
    title: "Settings / Preferences Surface",
    description:
      "Account, workspace, notifications, and billing sections with clear hierarchy, autosave cues, and destructive-action guards.",
    type: "component",
    category: "ui",
    tags: ["settings", "forms", "ux", "account"],
    prompt:
      "Design a comprehensive settings surface: left nav sections (profile, workspace, notifications, security, billing), inline validation, optimistic saves with toast feedback, and confirm modals for destructive changes.",
    codeSnippet: `export function SettingsLayout() {
  return (
    <div className="mx-auto flex max-w-5xl gap-10 p-8">
      <SettingsNav sections={SECTIONS} active={section} onChange={setSection} />
      <div className="flex-1 space-y-8">
        {section === "profile" && <ProfileForm />}
        {section === "notifications" && <NotificationMatrix />}
      </div>
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: true,
    accent: "oklch(0.67 0.14 150)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/settings-preferences-surface.svg",
    metadataJson: catalogIllustratedMeta(7)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "analytics-panel",
    title: "Analytics Panel",
    description:
      "Funnel, cohort summary, and KPI drill-down panel with export — ideal for in-app insights without leaving context.",
    type: "component",
    category: "site",
    tags: ["analytics", "charts", "data", "product"],
    prompt:
      "Build an analytics panel for a SaaS app: date range control, primary KPI row, funnel visualization, cohort table with heat emphasis, and CSV export. Responsive down to tablet.",
    codeSnippet: `export function AnalyticsPanel({ workspaceId }: { workspaceId: string }) {
  const { range, setRange, data } = useAnalytics(workspaceId);
  return (
    <div className="space-y-6 p-6">
      <Toolbar range={range} onRangeChange={setRange} onExport={exportCsv} />
      <KpiRow metrics={data.kpis} />
      <FunnelChart steps={data.funnel} />
      <CohortTable matrix={data.cohorts} />
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: true,
    isNew: false,
    accent: "oklch(0.65 0.12 260)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/analytics-panel.svg",
    metadataJson: catalogIllustratedMeta(8)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "data-table",
    title: "Data Table",
    description:
      "Sortable, filterable, paginated grid with row selection, column resize, sticky header, and CSV export.",
    type: "component",
    category: "ui",
    tags: ["react", "table", "data", "tanstack"],
    prompt:
      "Build a production data table: multi-sort, faceted filters, pagination, row selection with bulk actions, column resize, sticky header, and CSV export via TanStack Table.",
    codeSnippet: `function DataTable<T>({ data, columns }: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true
  });
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader table={table} />
        <TableBody table={table} />
      </Table>
    </div>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.68 0.15 280)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/data-table.svg",
    metadataJson: catalogIllustratedMeta(9)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "content-approval-workflow",
    title: "Content Approval Flow",
    description:
      "Draft → review → approve → publish with stakeholder routing, SLAs, and a full audit trail for marketing teams.",
    type: "workflow",
    category: "marketing",
    tags: ["approval", "content", "governance", "automation"],
    prompt:
      "Design a marketing content approval workflow: draft intake, reviewer routing by brand and channel, SLA timers with escalation, comment rounds, final publish gate, and immutable audit log.",
    codeSnippet: `# content-approval.workflow.yaml
name: Content Approval Flow
triggers:
  - event: content.submitted
steps:
  - id: assign_reviewer
    type: task
    assign_to: "{{content.owner.manager}}"
    timeout: 48h
  - id: review_gate
    type: approval
    approvers: ["{{reviewer}}", "{{brand_lead}}"]
  - id: publish_step
    type: action
    run: cms.publish("{{content.id}}")`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.67 0.14 150)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/content-approval-workflow.svg",
    metadataJson: catalogIllustratedMeta(10)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "lead-intake-qualification",
    title: "Lead Intake & Qualification",
    description:
      "Capture inbound leads, score fit, route to reps, and sync to CRM — tuned for speed without sacrificing quality.",
    type: "workflow",
    category: "marketing",
    tags: ["crm", "sales", "routing", "automation"],
    prompt:
      "Model a lead intake and qualification workflow: form capture, enrichment, scoring rules, round-robin or territory routing, SLA for first response, and CRM upsert with dedupe.",
    codeSnippet: `# lead-intake.workflow.yaml
name: Lead Intake & Qualification
triggers:
  - event: lead.created
steps:
  - id: enrich
    run: enrichment.lookup("{{lead.email}}")
  - id: score
    run: rules.evaluate("lead_scoring_v3", lead)
  - id: route
    type: task
    assign_to: "{{routing.owner_for(lead.region)}}"
  - id: crm_sync
    run: salesforce.upsert("Lead", lead)`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: true,
    isNew: false,
    accent: "oklch(0.65 0.14 220)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/lead-intake-qualification.svg",
    metadataJson: catalogIllustratedMeta(11)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "support-escalation-workflow",
    title: "Support Escalation Workflow",
    description:
      "Tiered response with severity rules, on-call paging, and customer comms — keeps incidents controlled and visible.",
    type: "workflow",
    category: "site",
    tags: ["support", "sla", "incident", "operations"],
    prompt:
      "Design a customer support escalation workflow: severity matrix, first-line triage, engineering escalation with on-call rotation, customer status page updates, and post-incident summary task.",
    codeSnippet: `# support-escalation.workflow.yaml
name: Support Escalation
triggers:
  - event: ticket.severity_changed
steps:
  - id: triage
    type: task
    assign_to: "{{tier1.next_available}}"
  - id: escalate
    when: ticket.severity >= 2
    page: oncall.engineering
  - id: customer_comms
    run: statuspage.publish_update(ticket.public_summary)`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.66 0.14 30)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/support-escalation-workflow.svg",
    metadataJson: catalogIllustratedMeta(12)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "publish-review-pipeline",
    title: "Publish / Review Pipeline",
    description:
      "Protected branch flow: preview deploys, required checks, changelog generation, and staged production promotion.",
    type: "workflow",
    category: "code",
    tags: ["release", "github", "quality", "devops"],
    prompt:
      "Define a publish and review pipeline: feature branches, preview environments per PR, required reviewers, automated changelog from conventional commits, canary deploy, and production promotion with rollback hooks.",
    codeSnippet: `# publish-review.pipeline.yaml
name: Publish / Review Pipeline
triggers:
  - event: pull_request.ready_for_review
steps:
  - id: preview_env
    run: deploy.preview(pr.head.sha)
  - id: checks
    require: [lint, test, e2e_smoke]
  - id: changelog
    run: malv.generate_changelog(since_last_tag)
  - id: promote
    when: pr.merged && branch == main
    run: deploy.production(canary: true)`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: true,
    accent: "oklch(0.67 0.14 150)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/publish-review-pipeline.svg",
    metadataJson: catalogIllustratedMeta(13)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "saas-mvp-blueprint",
    title: "SaaS MVP Blueprint",
    description:
      "Opinionated full-stack starter: auth, billing, org model, feature flags, admin, and deployment wiring.",
    type: "blueprint",
    category: "site",
    tags: ["nextjs", "prisma", "stripe", "auth", "architecture"],
    prompt:
      "Architect a SaaS MVP blueprint: Next.js app shell, auth (magic link + OAuth), Stripe subscriptions, org/team tenancy, feature flags, admin console, observability hooks, and Vercel + managed DB deployment.",
    codeSnippet: `src/
  app/(auth)/login
  app/(dashboard)/**
  app/api/billing/webhook
  lib/auth.ts
  lib/billing.ts
  lib/flags.ts
  components/OrgSwitcher.tsx
prisma/schema.prisma  # User, Org, Membership, Subscription`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: true,
    recommended: false,
    isNew: false,
    accent: "oklch(0.65 0.12 260)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/saas-mvp-blueprint.svg",
    metadataJson: catalogIllustratedMeta(14)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "team-workspace-blueprint",
    title: "Team Workspace Blueprint",
    description:
      "Multi-tenant workspace shell: roles, shared library, task inbox, and audit-friendly activity — collaboration-first.",
    type: "blueprint",
    category: "site",
    tags: ["workspace", "collaboration", "rbac", "tasks"],
    prompt:
      "Scaffold a team workspace blueprint: workspace switcher, role matrix (owner/admin/member), shared unit library, task inbox with assignments, mentions, and activity feed with exportable audit trail.",
    codeSnippet: `entities:
  Workspace: { id, name, plan }
  Member: { workspaceId, userId, role }
routes:
  /w/:id/library    # shared build units
  /w/:id/inbox      # tasks + mentions
  /w/:id/activity   # audit stream
policies:
  library.read: member
  library.publish: admin`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: true,
    isNew: false,
    accent: "oklch(0.68 0.12 200)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/team-workspace-blueprint.svg",
    metadataJson: catalogIllustratedMeta(15)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "creator-commerce-blueprint",
    title: "Creator Commerce Blueprint",
    description:
      "Launch stack for digital products: storefront, checkout, fulfillment hooks, and lightweight CRM for fans.",
    type: "blueprint",
    category: "marketing",
    tags: ["commerce", "creators", "checkout", "digital-goods"],
    prompt:
      "Design a creator commerce blueprint: product catalog with variants, hosted checkout, license delivery, email receipts, affiliate codes, and lightweight CRM segments for superfans.",
    codeSnippet: `modules:
  catalog:     # SKUs, bundles, limited drops
  checkout:    # Stripe + tax hints
  fulfillment: # signed URLs + license keys
  crm:         # tags, segments, broadcast hooks
integrations:
  - stripe
  - resend
  - segment (optional)`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: true,
    accent: "oklch(0.70 0.16 330)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/creator-commerce-blueprint.svg",
    metadataJson: catalogIllustratedMeta(16)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "stripe-payments",
    title: "Stripe Payments",
    description:
      "Checkout, subscriptions, webhooks, customer portal, and invoice flows — production patterns, not toy demos.",
    type: "plugin",
    category: "integration",
    tags: ["stripe", "payments", "billing", "webhooks"],
    prompt:
      "Integrate Stripe end-to-end: Checkout Sessions for one-time and subscription modes, webhook handler with idempotency, customer portal deep links, invoice PDFs, and test-mode safety guards.",
    codeSnippet: `export async function createCheckout(req: Request) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: req.body.priceId, quantity: 1 }],
    success_url: \`\${BASE_URL}/success?session={CHECKOUT_SESSION_ID}\`,
    customer_email: req.user.email
  });
  return { url: session.url };
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: true,
    isNew: false,
    accent: "oklch(0.66 0.14 30)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/stripe-payments.svg",
    metadataJson: catalogIllustratedMeta(17)
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "oauth-integration",
    title: "OAuth Integration",
    description:
      "Google, GitHub, and Microsoft sign-in with token refresh, revocation, and secure server-side storage.",
    type: "plugin",
    category: "integration",
    tags: ["auth", "oauth", "security", "sso"],
    prompt:
      "Implement multi-provider OAuth (Google, GitHub, Microsoft): PKCE where required, secure httpOnly session bridging, refresh rotation, revocation handling, and minimal scopes documented per provider.",
    codeSnippet: `async function oauthCallback(code: string, provider: OAuthProvider) {
  const tokens = await exchangeCode(code, provider);
  const profile = await fetchProfile(tokens.accessToken, provider);
  const user = await upsertUserFromProfile(profile);
  await storeOAuthTokens(user.id, provider, tokens);
  return createSession(user.id);
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: true,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.66 0.14 30)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/oauth-integration.svg",
    metadataJson: catalogIllustratedMeta(18)
  },
  /* ─── Internal / depth catalog — hidden from default browse, still searchable ─── */
  {
    ...BU_ASSET_DEFAULTS,
    slug: "scroll-reveal-animations",
    title: "Scroll Reveal Animations",
    description: "Intersection Observer entry motion: fade-up, stagger, GPU-safe — great for polish, not the hero browse tile.",
    type: "behavior",
    category: "ui",
    tags: ["animation", "css", "performance"],
    prompt:
      "Build a reusable scroll reveal system using Intersection Observer: fade-up, fade-in, stagger children, reduced-motion fallbacks, and zero layout shift.",
    codeSnippet: `function useScrollReveal() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.70 0.15 200)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/scroll-reveal-animations.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "gradient-orb-background",
    title: "Gradient Orb Background",
    description: "Ambient gradient orbs for marketing shells — supportive visual, not a standalone product story.",
    type: "behavior",
    category: "ui",
    tags: ["css", "animation", "visual"],
    prompt:
      "Create an animated gradient orb background: blurred orbs with slow drift, theme tokens, and perf-safe will-change usage.",
    codeSnippet: `.orb-field { position: relative; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px);
  animation: drift 14s ease-in-out infinite alternate; }`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.70 0.15 200)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/gradient-orb-background.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "cicd-pipeline",
    title: "CI/CD Pipeline",
    description: "GitHub Actions: lint, test, container build, staging deploy, and production gating.",
    type: "workflow",
    category: "code",
    tags: ["github-actions", "docker", "devops"],
    prompt:
      "Author a CI/CD pipeline: lint and test on every PR, Docker build and registry push, preview deploy for branches, production workflow with manual approval and rollback documentation.",
    codeSnippet: `# .github/workflows/deploy.yml
jobs:
  test: { runs-on: ubuntu-latest, steps: [checkout, npm ci, lint, test] }
  build: { needs: test, steps: [docker build & push] }
  deploy-prod: { needs: build, environment: production }`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.67 0.14 150)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/cicd-pipeline.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "toast-notification-system",
    title: "Toast Notification System",
    description: "Accessible stacked toasts — useful utility, kept in depth catalog to avoid crowding premium tiles.",
    type: "component",
    category: "ui",
    tags: ["react", "accessibility", "ux"],
    prompt:
      "Build a toast system: positions, stacking cap, auto-dismiss, action slots, screen-reader live regions, and reduced-motion respect.",
    codeSnippet: `export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((opts: ToastOptions) => { /* ... */ }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.68 0.15 280)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/toast-notification-system.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "email-drip-sequence",
    title: "Email Drip Sequence",
    description: "Five-email nurture arc with subjects and CTAs — strong copy asset, surfaced via search rather than default grid.",
    type: "template",
    category: "marketing",
    tags: ["email", "copywriting", "crm", "lifecycle"],
    prompt:
      "Write a five-email onboarding drip: welcome, two feature spotlights, social proof story, and conversion push — each with subject, preview text, and one CTA.",
    codeSnippet: `emails:
  - id: welcome
    day: 0
    subject: "Welcome — your workspace is ready"
  - id: convert
    day: 7
    subject: "Ready to remove the trial limits?"`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.65 0.14 220)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/email-drip-sequence.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "code-review-workflow",
    title: "Code Review Workflow",
    description: "Automated PR checks: lint, types, security scan, and summarized findings — pairs with publish pipeline for depth.",
    type: "workflow",
    category: "code",
    tags: ["code-quality", "security", "automation"],
    prompt:
      "Automate code review assistance: ESLint/TS gates, dependency audit, SAST pass, complexity heuristics, and a structured summary comment on the PR.",
    codeSnippet: `# code-review.workflow.yaml
triggers: [pull_request.opened]
steps:
  - parallel: [eslint, tsc, semgrep]
  - summarize:
      type: malv_task
      post_to: pull_request.comment`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.67 0.14 150)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/code-review-workflow.svg",
    metadataJson: hiddenCatalogMeta()
  },
  {
    ...BU_ASSET_DEFAULTS,
    slug: "typewriter-effect",
    title: "Typewriter Effect",
    description: "Typed headline micro-interaction — polish utility, excluded from the default gallery.",
    type: "behavior",
    category: "ui",
    tags: ["animation", "text", "ux"],
    prompt:
      "Implement a typewriter hook: speed control, cursor blink, multi-string rotation, skip-on-click, and prefers-reduced-motion handling.",
    codeSnippet: `function useTypewriter(strings: string[], opts?: { speed?: number }) {
  const [out, setOut] = useState("");
  // character loop + rotation
  return out;
}`,
    authorUserId: null,
    authorLabel: "MALV",
    visibility: "public",
    sourceKind: "system",
    originalBuildUnitId: null,
    forkable: true,
    downloadable: true,
    verified: false,
    trending: false,
    recommended: false,
    isNew: false,
    accent: "oklch(0.70 0.15 200)",
    previewKind: "image",
    previewImageUrl: "/explore-catalog/typewriter-effect.svg",
    metadataJson: hiddenCatalogMeta()
  }
];

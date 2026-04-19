import { Injectable } from "@nestjs/common";
import type { ClassifiedIntent } from "../../beast/intent-understanding.types";
import type {
  MalvAgentHandoff,
  MalvAgentRequestContext,
  MalvAgentResultEnvelope,
  MalvAgentPartialStatus,
  MalvWorkShape,
  MalvWorkSurface
} from "../contracts/malv-agent.contracts";
import {
  agentIdentity,
  assertNotAborted,
  envelopeBase,
  malvAgentDefaultConfidence,
  type MalvAgentContract
} from "../foundation/malv-base-agent";

/** Shared resolver/router context for Stage 2 build agents. */
export type MalvStage2AgentInput = {
  userText: string;
  workShape: MalvWorkShape;
  surface: MalvWorkSurface;
  complexityScore: number;
  executionRisk: "low" | "medium" | "high";
  vaultScoped: boolean;
  studioContext: boolean;
  classified?: ClassifiedIntent | null;
};

function ok<T>(
  kind: MalvAgentResultEnvelope<T>["agentKind"],
  id: string,
  label: string,
  payload: T,
  opts: Partial<{
    confidence: number;
    rationale: string;
    handoffs: MalvAgentHandoff[];
    partialStatus: MalvAgentPartialStatus;
    tier: MalvAgentResultEnvelope<T>["tierPreference"];
  }> = {}
): MalvAgentResultEnvelope<T> {
  const identity = agentIdentity(kind, id, label);
  return {
    ...envelopeBase({
      identity,
      truthState: "advisory",
      grounding: "partial",
      confidence: malvAgentDefaultConfidence(opts.confidence ?? 0.74, opts.rationale ?? "stage2_heuristic"),
      policy: "allow_advisory",
      executionMode: "passive_analysis",
      tierPreference: opts.tier ?? "hybrid",
      partialStatus: opts.partialStatus ?? "complete"
    }),
    payload,
    handoffs: opts.handoffs
  };
}

const lower = (s: string) => s.toLowerCase();

function pathLikeTouches(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:src\/|apps\/|packages\/|lib\/|components\/)[\w./-]+/gi)) {
    out.add(m[0].replace(/\/+$/, ""));
  }
  if (out.size === 0 && /\b(api|route|controller|service|module)\b/i.test(text)) {
    out.add("workspace: inferred_module_touch");
  }
  if (out.size === 0) out.add("workspace: scope_tbd");
  return [...out].slice(0, 12);
}

function cciNotes(vault: boolean, risk: string): string[] {
  const n = [
    "CCI diff review required before merge",
    "Sandbox policy gate for executable paths",
    vault ? "Vault: redact secrets from logs and traces" : "Standard telemetry OK"
  ];
  if (risk === "high") n.push("High risk: explicit human approval before apply");
  return n;
}

@Injectable()
export class MalvCodingAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("coding", "malv.agent.coding", "Coding");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText;
    const l = lower(t);
    const scopeBand = t.length > 2400 || input.complexityScore > 0.65 ? "wide" : t.length < 140 ? "narrow" : "medium";
    const goals = [
      l.includes("refactor") ? "Refactor with behavior parity" : "Implement requested change with tests",
      "Map CCI diff boundaries and rollback path",
      input.studioContext || input.workShape === "studio_oriented" ? "Align with Studio preview / build unit" : "Keep workspace task linkage explicit"
    ];
    const steps = [
      "Inventory affected modules and public contracts",
      "Draft patch slices (types → logic → wiring → tests)",
      "Run tier-appropriate static checks before sandbox apply",
      "Verify via quality_verification + policy review"
    ];
    const patchKind = /\b(fix|bug|broken)\b/i.test(l) ? "fix" : /\brefactor\b/i.test(l) ? "refactor" : "feature";
    return ok(
      "coding",
      this.identity.id,
      this.identity.internalLabel,
      {
        codeImplementationPlan: { goals, steps, scopeBand, estimatedEffortBand: scopeBand === "wide" ? "multi_session" : "single_session" },
        patchIntent: {
          kind: patchKind,
          summary: t.slice(0, 400),
          acceptanceCriteria: [
            "Behavior matches stated intent",
            "No policy/sandbox bypass",
            "Tests or verification path named"
          ]
        },
        fileTouchSet: pathLikeTouches(t),
        implementationRiskNotes: cciNotes(input.vaultScoped, input.executionRisk)
      },
      {
        tier: input.complexityScore > 0.55 ? "gpu" : "hybrid",
        confidence: 0.78,
        rationale: "implementation_decomposition",
        handoffs: [{ to: "quality_verification", reason: "post_implementation_verify" }]
      }
    );
  }
}

@Injectable()
export class MalvDebugAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("debug", "malv.agent.debug_specialist", "Debug");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText;
    const l = lower(t);
    const hypotheses = [
      { hypothesis: "Regression near recent change or dependency bump", likelihood: "medium" as const },
      { hypothesis: "Environmental/config drift vs code defect", likelihood: l.includes("prod") || l.includes("only on") ? "high" : "low" },
      { hypothesis: "Incorrect assumption in data contract or API boundary", likelihood: /\b422|400|schema\b/i.test(l) ? "high" : "medium" }
    ];
    const candidates = [
      "Type/runtime mismatch in integration boundary",
      "Async race or missing await in hot path",
      "Resource exhaustion or timeout misclassification"
    ].filter((_, i) => input.complexityScore > 0.35 || i < 2);
    const priority = [
      "Stabilize minimal reproduction (fixture or scripted steps)",
      "Bisect to failing layer (app vs infra vs data)",
      "Attach CCI-readable diff context for suspected files",
      "Validate fix with targeted tests before broaden"
    ];
    const needsLocal = !l.includes("ci only") && !l.includes("only in production");
    return ok(
      "debug",
      this.identity.id,
      this.identity.internalLabel,
      {
        debugHypothesisSet: hypotheses,
        rootCauseCandidates: candidates,
        debugPriorityPath: priority,
        reproductionShape: {
          needsLocalRepro: needsLocal,
          minimalFixture: needsLocal ? ["seed_state", "single_entry_command", "expected_vs_actual"] : ["pipeline_log_slice", "artifact_pointer"],
          observabilityHints: l.includes("trace") ? ["distributed_trace_id", "span_waterfall"] : ["structured_logs", "error_code"]
        }
      },
      {
        tier: "hybrid",
        confidence: 0.71,
        rationale: "diagnostic_structure",
        handoffs: [{ to: "coding", reason: "after_root_cause_narrowing" }]
      }
    );
  }
}

@Injectable()
export class MalvSystemDesignAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("system_design", "malv.agent.system_design", "System design");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText;
    const boundaries = [
      { component: "API / application layer", owns: ["request_validation", "orchestration"], calls: ["domain_core", "integrations"] },
      { component: "Domain core", owns: ["invariants", "policies"], calls: ["persistence", "async_workers"] },
      { component: "Integrations", owns: ["adapters", "rate_limits"], calls: ["external_vendors"] }
    ];
    const tradeoffs = [
      {
        axis: "Consistency vs availability",
        options: ["strong_consistency", "eventual_with_compensation"],
        pick: input.executionRisk === "high" ? "eventual_with_compensation" : "strong_consistency",
        rationale: "Risk posture from router executionRisk"
      },
      {
        axis: "Monolith module vs service split",
        options: ["modular_monolith", "fine_grained_services"],
        pick: input.complexityScore > 0.6 ? "fine_grained_services" : "modular_monolith",
        rationale: "Complexity heuristic from conversation scope"
      }
    ];
    return ok(
      "system_design",
      this.identity.id,
      this.identity.internalLabel,
      {
        systemDesignBrief: {
          summary: t.slice(0, 500),
          constraints: ["Stay within MALV sandbox and workspace execution boundaries", "Explicit trust boundaries for PII"],
          nonGoals: ["Physical infra provisioning", "Third-party contract negotiation"]
        },
        componentBoundaryMap: boundaries,
        tradeoffMatrix: tradeoffs,
        integrationImpactSummary: [
          "Database schema or migration sequencing",
          "Queue / worker contracts if async introduced",
          "Observability: metrics and alerts on new edges"
        ]
      },
      {
        tier: "gpu",
        confidence: 0.73,
        rationale: "architecture_synthesis",
        handoffs: [{ to: "planning", reason: "phase_plan_from_design" }]
      }
    );
  }
}

@Injectable()
export class MalvDesignerAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("designer", "malv.agent.designer", "Designer");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText;
    const l = lower(t);
    const tone = l.includes("enterprise") || l.includes("b2b") ? "confident_minimal" : l.includes("playful") ? "warm_expressive" : "clear_neutral";
    return ok(
      "designer",
      this.identity.id,
      this.identity.internalLabel,
      {
        designDirectionBrief: {
          northStar: t.slice(0, 280),
          audience: l.includes("developer") ? "technical_users" : "general_users",
          density: input.complexityScore > 0.55 ? "dense_dashboard" : "focused_flow"
        },
        uiPrinciples: ["Progressive disclosure", "Consistent spacing scale", "Accessible contrast defaults"],
        interactionTone: tone,
        visualConstraintSet: [
          "Honor existing MALV design system tokens where present",
          "Mobile-first breakpoints unless desktop-only stated",
          input.vaultScoped ? "Minimize decorative imagery that could leak context" : "Brand-safe imagery only"
        ]
      },
      {
        tier: "hybrid",
        confidence: 0.69,
        rationale: "design_direction_pack",
        handoffs: [{ to: "frontend_experience", reason: "ux_deep_dive" }]
      }
    );
  }
}

@Injectable()
export class MalvFrontendExperienceAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("frontend_experience", "malv.agent.frontend_experience", "Frontend experience");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText;
    const l = lower(t);
    return ok(
      "frontend_experience",
      this.identity.id,
      this.identity.internalLabel,
      {
        uxFlowAssessment: [
          "Entry clarity: user knows primary action within first viewport",
          "Error recovery: dead-ends avoided with explicit next steps",
          "Cognitive load: limit simultaneous decisions per screen"
        ],
        responsivenessRiskSummary: [
          l.includes("table") || l.includes("grid") ? "Wide tables on mobile — horizontal scroll or column collapse" : "Standard stack layout risk low",
          "Touch target sizing for primary CTAs",
          "Image-heavy hero may LCP-regress without priority hints"
        ],
        interactionFrictionMap: [
          { step: "onboarding", friction: "Form length vs value proof ordering" },
          { step: "checkout_or_commit", friction: "Irreversible actions need confirmation pattern" },
          { step: "settings", friction: "Advanced options hidden behind progressive disclosure" }
        ],
        polishOpportunitySet: [
          "Skeleton loaders for async panels",
          "Focus management on modal open/close",
          "Microcopy consistency for validation errors"
        ]
      },
      {
        tier: "hybrid",
        confidence: 0.72,
        rationale: "ux_surface_analysis",
        handoffs: [{ to: "animation", reason: "motion_when_requested" }]
      }
    );
  }
}

@Injectable()
export class MalvAnimationAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("animation", "malv.agent.animation", "Animation");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const l = lower(input.userText);
    const prefersReduced = l.includes("reduced motion") || l.includes("a11y");
    return ok(
      "animation",
      this.identity.id,
      this.identity.internalLabel,
      {
        motionPlan: [
          "Establish duration scale (fast 120ms / base 200ms / slow 320ms)",
          "Prefer transform/opacity; avoid layout-thrashing properties",
          prefersReduced ? "Provide non-animated equivalent states" : "Stagger list reveals max 50ms offset"
        ],
        transitionChoreography: [
          { from: "route_exit", to: "route_enter", easing: "cubic_out" },
          { from: "modal_closed", to: "modal_open", easing: "spring_soft" },
          { from: "loading", to: "content_ready", easing: "ease_out" }
        ],
        animationRiskSummary: [
          "Jank on low-end devices if simultaneous blurs",
          "Hydration mismatch if motion runs before SSR stable",
          "WCAG: vestibular triggers on parallax"
        ],
        performanceGuardrails: [
          "Cap concurrent CSS animations in viewport",
          "Use content-visibility for offscreen lists",
          "Measure FPS on target devices before ship"
        ]
      },
      {
        tier: "gpu",
        confidence: 0.67,
        rationale: "motion_planning",
        handoffs: [{ to: "quality_verification", reason: "motion_acceptance" }]
      }
    );
  }
}

@Injectable()
export class MalvStudioAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("studio", "malv.agent.studio_intel", "Studio");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const target =
      input.surface === "studio" || input.studioContext
        ? { target: "build_unit" as const, focusAreas: ["preview_diff", "inspect_panel", "patch_apply_queue"] }
        : { target: "workspace_patch" as const, focusAreas: ["cci_context", "local_workspace"] };
    return ok(
      "studio",
      this.identity.id,
      this.identity.internalLabel,
      {
        studioTargetProfile: target,
        buildChangePlan: [
          "Snapshot current build unit / workspace revision pointer",
          "Partition changes: schema vs UI vs worker",
          "Run preview pipeline feasibility check before user-facing promise",
          "Route sandbox_action only after policy_safety_review"
        ],
        inspectDiffStrategy: [
          "Side-by-side file list with risk tags (auth, data, sandbox)",
          "Highlight generated vs hand-edited regions",
          "Attach Beast worker trace ids for reproducibility"
        ],
        previewImpactSummary: [
          "Live preview: cold start vs warm cache latency",
          "Asset upload size and CDN invalidation",
          "Feature flags that affect preview-only paths"
        ]
      },
      {
        tier: "hybrid",
        confidence: 0.76,
        rationale: "studio_targeting",
        handoffs: [
          { to: "studio_builder", reason: "materialize_build_unit" },
          { to: "coding", reason: "implementation_follow_up" }
        ]
      }
    );
  }
}

@Injectable()
export class MalvWebsiteBuilderAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("website_builder", "malv.agent.website_builder", "Website builder");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const l = lower(input.userText);
    const marketing = l.includes("marketing") || l.includes("landing");
    return ok(
      "website_builder",
      this.identity.id,
      this.identity.internalLabel,
      {
        siteStructurePlan: [
          `Request digest: ${input.userText.slice(0, 160)}`,
          "Information architecture: primary nav + utility nav",
          marketing ? "Landing → proof → CTA ladder" : "App shell: marketing + authenticated zones",
          "Legal / trust pages placement",
          "SEO baseline: titles, meta, structured data hooks"
        ],
        pageSystemOutline: [
          { page: "Home", purpose: "Positioning + primary CTA" },
          { page: "Product", purpose: "Capability map + social proof" },
          { page: "Pricing", purpose: "Tier comparison + FAQ" },
          { page: "Contact", purpose: "Lead capture with spam resistance" }
        ],
        conversionFlowMap: [
          "Awareness entry → value prop scan → trust signals → CTA",
          "Form friction vs field completeness tradeoff",
          "Post-submit confirmation and expectation setting"
        ],
        buildSequence: [
          "Static shell + routing",
          "Design system tokens + layout grid",
          "Content modules + CMS hooks if applicable",
          "website_security + testing + qa gates"
        ]
      },
      {
        tier: "gpu",
        confidence: 0.7,
        rationale: "web_composition",
        handoffs: [{ to: "website_security", reason: "security_review_gate" }]
      }
    );
  }
}

@Injectable()
export class MalvWebsiteSecurityAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("website_security", "malv.agent.website_security", "Website security");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const vault = input.vaultScoped;
    return ok(
      "website_security",
      this.identity.id,
      this.identity.internalLabel,
      {
        webSecurityRiskProfile: [
          "XSS via rich text or markdown render paths",
          "CSRF on state-changing forms",
          "Auth session fixation and token storage",
          vault ? "Vault: stricter CSP and no third-party embeds by default" : "Third-party script supply chain"
        ],
        authExposureSummary: [
          "Password vs OIDC vs magic link threat models",
          "Session lifetime and rotation",
          "Admin vs user role separation on routes"
        ],
        inputSurfaceRiskMap: [
          { surface: "public_forms", risk: "injection_and_spam" },
          { surface: "file_uploads", risk: "malware_and_ssrf" },
          { surface: "webhooks", risk: "replay_and_signature_validation" }
        ],
        hardeningChecklist: [
          "CSP + trusted types where feasible",
          "Rate limits and bot protection on auth endpoints",
          "Secrets only via managed stores — never client bundles",
          "Dependency audit for known CVEs before release"
        ]
      },
      {
        tier: "cpu",
        confidence: 0.81,
        rationale: "web_threat_model_stub",
        handoffs: [{ to: "policy_safety_review", reason: "security_policy_alignment" }]
      }
    );
  }
}

@Injectable()
export class MalvTestingAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("testing", "malv.agent.testing", "Testing");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const l = lower(input.userText);
    const coverage =
      input.complexityScore > 0.62 || l.includes("e2e") ? "full_stack" : l.includes("unit") ? "narrow" : "layered";
    return ok(
      "testing",
      this.identity.id,
      this.identity.internalLabel,
      {
        testStrategy: [
          "Contract tests on public APIs and DTO boundaries",
          "Integration tests for DB + queue adapters",
          l.includes("playwright") || l.includes("e2e") ? "E2E smoke on critical paths (CI gated)" : "Selective E2E to control flake",
          "Mutation or snapshot discipline only where ROI clear"
        ],
        coverageIntent: coverage,
        criticalTestMatrix: [
          { scenario: "Happy path primary user journey", layer: "e2e_or_integration" },
          { scenario: "Permission boundary denial", layer: "integration" },
          { scenario: "Regression on last hotfix files", layer: "unit_or_component" }
        ],
        validationSequence: [
          "Local fast suite → CI standard → pre-prod smoke",
          "Feature flags off-path behaviors",
          "Rollback drill for risky migrations"
        ]
      },
      {
        tier: "hybrid",
        confidence: 0.75,
        rationale: "test_planning",
        handoffs: [{ to: "qa", reason: "scenario_expansion" }]
      }
    );
  }
}

@Injectable()
export class MalvQaAgentService implements MalvAgentContract<MalvStage2AgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("qa", "malv.agent.qa", "QA");

  async execute(ctx: MalvAgentRequestContext, input: MalvStage2AgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const risk = input.executionRisk;
    const readinessBand = risk === "high" ? "red" : input.complexityScore > 0.58 ? "yellow" : "green";
    return ok(
      "qa",
      this.identity.id,
      this.identity.internalLabel,
      {
        qaScenarioSet: [
          "Cold start / empty state",
          "High load list pagination",
          "Offline or degraded dependency",
          "Permission escalation attempts",
          input.vaultScoped ? "Vault session timeout and re-auth" : "Standard session refresh"
        ],
        failureSurfaceMap: [
          { area: "API_errors", symptomClass: "4xx/5xx_user_visible" },
          { area: "Studio_preview", symptomClass: "stale_or_mismatch" },
          { area: "Forms", symptomClass: "validation_and_spam" }
        ],
        regressionHotspots: [
          "Recent CCI-touched modules",
          "Auth and billing adjacent code",
          "Preview pipeline and asset uploads"
        ],
        releaseReadinessSummary: {
          band: readinessBand,
          reasons:
            risk === "high"
              ? ["High execution risk flagged by router", "Mandatory policy review before ship"]
              : ["Heuristic readiness from complexity and risk scores"]
        }
      },
      {
        tier: "cpu",
        confidence: 0.77,
        rationale: "qa_readiness_pack",
        handoffs: [{ to: "quality_verification", reason: "final_verify" }]
      }
    );
  }
}

export const MALV_STAGE2_BUILD_AGENT_PROVIDERS = [
  MalvCodingAgentService,
  MalvDebugAgentService,
  MalvSystemDesignAgentService,
  MalvDesignerAgentService,
  MalvFrontendExperienceAgentService,
  MalvAnimationAgentService,
  MalvStudioAgentService,
  MalvWebsiteBuilderAgentService,
  MalvWebsiteSecurityAgentService,
  MalvTestingAgentService,
  MalvQaAgentService
] as const;

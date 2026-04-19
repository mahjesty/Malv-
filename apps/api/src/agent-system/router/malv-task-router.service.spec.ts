import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MalvInferenceTierCapabilityService } from "../../inference/malv-inference-tier-capability.service";
import { MalvTaskRouterService } from "./malv-task-router.service";
import { MalvAgentRegistryService } from "../registry/malv-agent-registry.service";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";
import { MalvAgentRouteReason } from "../foundation/malv-agent-route-reason.codes";

function testConfig(map: Record<string, string | undefined>) {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe("MalvTaskRouterService", () => {
  let router: MalvTaskRouterService;

  beforeEach(async () => {
    const cfg = testConfig({
      MALV_LIGHTWEIGHT_MAX_PROMPT_CHARS: "6000",
      MALV_LIGHTWEIGHT_MAX_CONTEXT_CHARS: "24000"
    });
    const m = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: cfg },
        MalvInferenceTierCapabilityService,
        ...MALV_ALL_REGISTERED_AGENT_PROVIDERS,
        MalvAgentRegistryService,
        MalvTaskRouterService
      ]
    }).compile();
    await m.init();
    router = m.get(MalvTaskRouterService);
  });

  it("routes inbox to inbox_oriented", () => {
    const d = router.route({ surface: "inbox", userText: "FYI", vaultScoped: false });
    expect(d.workShape).toBe("inbox_oriented");
    expect(d.reasonCodes).toContain(MalvAgentRouteReason.SURFACE_INBOX);
  });

  it("marks vault flows as vault_sensitive", () => {
    const d = router.route({ surface: "chat", userText: "hello", vaultScoped: true });
    expect(d.privacyMode).toBe("vault_sensitive");
    expect(d.reasonCodes).toContain(MalvAgentRouteReason.VAULT_SENSITIVE);
  });

  it("uses low_latency for voice surface", () => {
    const d = router.route({
      surface: "voice",
      userText: "quick",
      vaultScoped: false,
      inputMode: "voice"
    });
    expect(d.latencyMode).toBe("low_latency");
    expect(d.resourceTier).toBe("cpu");
  });

  it("prefers GPU for image-oriented detection", () => {
    const d = router.route({
      surface: "chat",
      userText: "make an image of a cat",
      vaultScoped: false,
      hasImageKeywords: true
    });
    expect(d.workShape).toBe("image_oriented");
    expect(d.resourceTier).toBe("gpu");
  });

  it("enables multi-agent for phased strategy", () => {
    const d = router.route({
      surface: "chat",
      userText: "xxxxxxxxxx",
      vaultScoped: false,
      executionStrategy: {
        mode: "phased",
        internalPhases: ["audit"],
        preferBeastWorker: true,
        riskTier: "medium"
      }
    });
    expect(d.multiAgent).toBe(true);
    expect(d.reasonCodes).toContain(MalvAgentRouteReason.MULTI_AGENT);
  });

  it("uses stage1 lite plan for very low complexity chat", () => {
    const d = router.route({ surface: "chat", userText: "ok", vaultScoped: false });
    expect(d.plan.planId).toContain("lite");
    expect(d.plan.steps.map((s) => s.agentKind)).toEqual(
      expect.arrayContaining(["router", "smart_decision", "privacy", "response_composer"])
    );
  });

  it("does not use lite plan for vault-scoped chat even when complexity is low", () => {
    const d = router.route({ surface: "chat", userText: "ok", vaultScoped: true });
    expect(d.plan.planId).not.toContain("lite");
    expect(d.plan.steps.map((s) => s.agentKind)).toContain("context_assembly");
  });

  it("studio surface uses studio → coding/debug → studio_builder chain (stage2)", () => {
    const d = router.route({
      surface: "studio",
      userText: "fix the typescript crash in the preview pipeline",
      vaultScoped: false,
      hasCodeKeywords: true,
      studioContext: true
    });
    expect(d.workShape).toBe("studio_oriented");
    const kinds = d.plan.steps.map((s) => s.agentKind);
    expect(kinds).toContain("studio");
    expect(kinds).toContain("debug");
    expect(kinds).toContain("studio_builder");
    expect(kinds).not.toContain("debug_code_intelligence");
  });

  it("studio surface implementation path prefers coding agent when not debug-like", () => {
    const d = router.route({
      surface: "studio",
      userText: "implement the new dashboard card using the design tokens",
      vaultScoped: false,
      hasCodeKeywords: true,
      studioContext: true
    });
    const kinds = d.plan.steps.map((s) => s.agentKind);
    expect(kinds).toContain("coding");
    expect(kinds).not.toContain("debug");
  });

  it("architecture keywords route to system_design", () => {
    const d = router.route({
      surface: "chat",
      userText: "Help us define microservices boundaries and integration contracts for billing",
      vaultScoped: false
    });
    expect(d.workShape).toBe("architecture_oriented");
    expect(d.plan.steps.map((s) => s.agentKind)).toContain("system_design");
  });

  it("website keywords route bounded website + security chain", () => {
    const d = router.route({
      surface: "chat",
      userText: "Plan a marketing landing page with conversion funnel and basic seo structure",
      vaultScoped: false,
      executionStrategy: { mode: "phased", internalPhases: ["audit", "plan"], preferBeastWorker: true, riskTier: "medium" }
    });
    expect(d.workShape).toBe("website_oriented");
    const kinds = d.plan.steps.map((s) => s.agentKind);
    expect(kinds).toContain("website_builder");
    expect(kinds).toContain("website_security");
  });

  it("frontend ux keywords include designer and frontend_experience", () => {
    const d = router.route({
      surface: "chat",
      userText: "Improve the responsive layout and interaction design for our settings screen",
      vaultScoped: false
    });
    expect(d.workShape).toBe("frontend_oriented");
    const kinds = d.plan.steps.map((s) => s.agentKind);
    expect(kinds).toContain("designer");
    expect(kinds).toContain("frontend_experience");
  });

  it("full chat plan wires conversation, context, and privacy instead of legacy continuity", () => {
    const d = router.route({
      surface: "chat",
      userText: "x".repeat(900),
      vaultScoped: false,
      executionStrategy: {
        mode: "phased",
        internalPhases: ["audit", "plan"],
        preferBeastWorker: true,
        riskTier: "medium"
      }
    });
    const kinds = d.plan.steps.map((s) => s.agentKind);
    expect(kinds).toContain("smart_decision");
    expect(kinds).toContain("conversation");
    expect(kinds).toContain("context_assembly");
    expect(kinds).toContain("privacy");
    expect(kinds).not.toContain("continuity");
  });
});

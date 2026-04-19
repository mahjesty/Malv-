import { Test } from "@nestjs/testing";
import { MalvAgentLifecycleService, mergeEnvelopes, segmentSteps } from "./malv-agent-lifecycle.service";
import { MalvAgentRegistryService } from "../registry/malv-agent-registry.service";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";
import type { MalvAgentPlanStep } from "../contracts/malv-agent.contracts";
import type { MalvAgentResultEnvelope } from "../contracts/malv-agent.contracts";

describe("segmentSteps", () => {
  it("groups equal parallelGroup and isolates undefined groups", () => {
    const steps: MalvAgentPlanStep[] = [
      { order: 0, agentKind: "router", mode: "passive_analysis", parallelGroup: 0 },
      { order: 1, agentKind: "memory_shaping", mode: "passive_analysis", parallelGroup: 1 },
      { order: 2, agentKind: "continuity", mode: "advisory", parallelGroup: 1 },
      { order: 3, agentKind: "response_composer", mode: "advisory" }
    ];
    const s = segmentSteps(steps);
    expect(s.length).toBe(3);
    expect(s[1]!.length).toBe(2);
  });
});

describe("mergeEnvelopes", () => {
  it("takes minimum confidence and blocked truth state wins", () => {
    const a: MalvAgentResultEnvelope = {
      agentKind: "router",
      identity: { kind: "router", id: "a", internalLabel: "a" },
      truthState: "advisory",
      grounding: "full",
      confidence: { score: 0.9, rationale: "x" },
      policy: "allow_advisory",
      executionMode: "advisory",
      tierPreference: "cpu",
      partialStatus: "complete",
      payload: {}
    };
    const b: MalvAgentResultEnvelope = {
      agentKind: "sandbox_action",
      identity: { kind: "sandbox_action", id: "b", internalLabel: "b" },
      truthState: "blocked",
      grounding: "partial",
      confidence: { score: 0.5, rationale: "y" },
      policy: "sandbox_only",
      executionMode: "approval_required",
      tierPreference: "cpu",
      partialStatus: "complete",
      payload: {}
    };
    const m = mergeEnvelopes([a, b], "trace-1");
    expect(m.truthState).toBe("blocked");
    expect(m.confidence.score).toBe(0.5);
    expect(m.grounding).toBe("partial");
  });
});

describe("MalvAgentLifecycleService", () => {
  it("runs bounded plan sequentially for undefined parallel groups", async () => {
    const m = await Test.createTestingModule({
      providers: [...MALV_ALL_REGISTERED_AGENT_PROVIDERS, MalvAgentRegistryService, MalvAgentLifecycleService]
    }).compile();
    await m.init();
    const lifecycle = m.get(MalvAgentLifecycleService);
    const ctx = {
      traceId: "t1",
      vaultScoped: false,
      surface: "chat" as const,
      latencySensitive: false,
      privacySensitive: false
    };
    const out = await lifecycle.executePlan({
      ctx,
      plan: {
        planId: "p1",
        maxParallelGroups: 1,
        maxSteps: 5,
        steps: [
          { order: 0, agentKind: "router", mode: "passive_analysis" },
          { order: 1, agentKind: "response_composer", mode: "advisory" }
        ]
      },
      resolveInput: (kind) => {
        if (kind === "router") return { userText: "hi", classified: null, executionStrategy: null };
        return { fragments: [{ source: "t", text: "ok" }] };
      }
    });
    expect(out.envelopes.length).toBe(2);
    expect(out.merged.payload && typeof out.merged.payload === "object" && "agents" in out.merged.payload).toBe(true);
  });

  it("stops at step cap", async () => {
    const m = await Test.createTestingModule({
      providers: [...MALV_ALL_REGISTERED_AGENT_PROVIDERS, MalvAgentRegistryService, MalvAgentLifecycleService]
    }).compile();
    await m.init();
    const lifecycle = m.get(MalvAgentLifecycleService);
    const ctx = {
      traceId: "t2",
      vaultScoped: false,
      surface: "chat" as const,
      latencySensitive: false,
      privacySensitive: false
    };
    const out = await lifecycle.executePlan({
      ctx,
      plan: {
        planId: "p2",
        maxParallelGroups: 1,
        maxSteps: 1,
        steps: [
          { order: 0, agentKind: "router", mode: "passive_analysis" },
          { order: 1, agentKind: "response_composer", mode: "advisory" }
        ]
      },
      resolveInput: () => ({})
    });
    expect(out.stoppedReason).toBe("step_cap");
    expect(out.envelopes.length).toBe(1);
  });

  it("runs stage2 coding → quality_verification chain with structured payloads", async () => {
    const m = await Test.createTestingModule({
      providers: [...MALV_ALL_REGISTERED_AGENT_PROVIDERS, MalvAgentRegistryService, MalvAgentLifecycleService]
    }).compile();
    await m.init();
    const lifecycle = m.get(MalvAgentLifecycleService);
    const ctx = {
      traceId: "t-stage2",
      vaultScoped: false,
      surface: "chat" as const,
      latencySensitive: false,
      privacySensitive: false
    };
    const stage2Input = {
      userText: "add a typed endpoint for workspace tasks",
      workShape: "coding_oriented" as const,
      surface: "chat" as const,
      complexityScore: 0.55,
      executionRisk: "low" as const,
      vaultScoped: false,
      studioContext: false,
      classified: null
    };
    const out = await lifecycle.executePlan({
      ctx,
      plan: {
        planId: "p_stage2",
        maxParallelGroups: 1,
        maxSteps: 8,
        steps: [
          { order: 0, agentKind: "coding", mode: "passive_analysis" },
          { order: 1, agentKind: "quality_verification", mode: "passive_analysis" }
        ]
      },
      resolveInput: (kind) => {
        if (kind === "coding") return stage2Input;
        if (kind === "quality_verification") {
          return { requirements: ["endpoint", "types"], candidateSummary: "typed workspace tasks endpoint draft" };
        }
        return {};
      }
    });
    expect(out.envelopes.length).toBe(2);
    const codingPayload = out.envelopes[0]!.payload as Record<string, unknown>;
    expect(typeof codingPayload["codeImplementationPlan"]).toBe("object");
    expect(Array.isArray(codingPayload["fileTouchSet"])).toBe(true);
  });
});

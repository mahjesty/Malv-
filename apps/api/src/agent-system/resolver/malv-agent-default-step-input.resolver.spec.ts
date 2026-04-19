import { createMalvDefaultStepInputResolver, resolveMalvAgentStepInput } from "./malv-agent-default-step-input.resolver";
import type { MalvTaskRouterDecision } from "../contracts/malv-agent.contracts";

describe("createMalvDefaultStepInputResolver", () => {
  const ctx = {
    traceId: "t",
    vaultScoped: true,
    surface: "chat" as const,
    latencySensitive: false,
    privacySensitive: true
  };

  const decision = {
    workShape: "chat_response",
    complexityScore: 0.5,
    resourceTier: "gpu" as const,
    executionRisk: "medium" as const,
    multiAgent: true,
    latencyMode: "normal" as const,
    decompositionHints: ["intent:x"],
    plan: { steps: [] }
  } as unknown as MalvTaskRouterDecision;

  it("resolves smart_decision and privacy inputs from router decision", () => {
    const r = createMalvDefaultStepInputResolver({
      ctx,
      routerInput: {
        surface: "chat",
        userText: "hello",
        vaultScoped: true,
        memorySnippetCount: 2,
        hasCodeKeywords: true
      },
      decision
    });
    const sd = r("smart_decision", { order: 0, agentKind: "smart_decision", mode: "advisory" }) as Record<string, unknown>;
    expect(sd["workShape"]).toBe("chat_response");
    expect(sd["complexityScore"]).toBe(0.5);

    const pr = r("privacy", { order: 1, agentKind: "privacy", mode: "advisory" }) as Record<string, unknown>;
    expect(pr["vaultScoped"]).toBe(true);
    expect(pr["privacySensitive"]).toBe(true);
  });

  it("resolves stage2 coding input with workShape and studio flags", () => {
    const r = resolveMalvAgentStepInput("coding", {
      ctx,
      routerInput: {
        surface: "studio",
        userText: "patch the api",
        vaultScoped: false,
        studioContext: true
      },
      decision: { ...decision, workShape: "studio_oriented" } as unknown as MalvTaskRouterDecision
    }) as Record<string, unknown>;
    expect(r["workShape"]).toBe("studio_oriented");
    expect(r["studioContext"]).toBe(true);
  });

  it("resolveMalvAgentStepInput exposes policy risk tier", () => {
    const pol = resolveMalvAgentStepInput("policy_safety_review", {
      ctx,
      routerInput: { surface: "chat", userText: "act", vaultScoped: false },
      decision
    }) as { riskTier: string };
    expect(pol.riskTier).toBe("medium");
  });
});

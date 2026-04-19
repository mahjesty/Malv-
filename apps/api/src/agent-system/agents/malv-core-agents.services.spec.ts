import { Test } from "@nestjs/testing";
import type { MalvAgentKind } from "../contracts/malv-agent.contracts";
import {
  MalvDeviceBridgeActionAgentService,
  MalvPolicySafetyReviewAgentService,
  MalvSandboxActionAgentService
} from "./malv-core-agents.services";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";

const ctxBase = {
  traceId: "t",
  vaultScoped: false,
  surface: "chat" as const,
  latencySensitive: false,
  privacySensitive: false
};

function minimalInput(kind: MalvAgentKind): unknown {
  switch (kind) {
    case "router":
      return { userText: "hi" };
    case "smart_decision":
      return {
        userText: "hi",
        workShape: "chat_response",
        complexityScore: 0.3,
        resourceTier: "cpu",
        executionRisk: "low",
        multiAgent: false,
        latencyMode: "normal",
        classified: null,
        executionStrategy: null
      };
    case "conversation":
      return { userText: "hello there" };
    case "knowledge":
      return { userText: "topic", topicHint: "topic", sourceCount: 0, workShape: "chat_response" };
    case "context_assembly":
      return {
        userText: "ctx",
        surface: "chat",
        memorySnippetCount: 0,
        vaultScoped: false,
        codeLike: false
      };
    case "privacy":
      return { userText: "safe text", vaultScoped: false, privacySensitive: false };
    case "continuity":
      return {};
    case "memory_shaping":
      return { memorySnippetCount: 0, vaultScoped: false };
    case "response_composer":
      return { fragments: [{ source: "x", text: "y" }] };
    case "planning":
      return { goalSummary: "g", riskTier: "low" as const };
    case "execution_prep":
      return { planSummary: "p", hasSandboxTarget: true };
    case "sandbox_action":
      return { approved: false };
    case "debug_code_intelligence":
      return { symptom: "s" };
    case "studio_builder":
      return { intent: "i" };
    case "inbox_triage":
      return { rawText: "note" };
    case "task_framing":
      return { body: "b" };
    case "image_intelligence":
      return { userPrompt: "p", hasSourceImage: false };
    case "multimodal_analysis":
      return { modalities: ["text"] };
    case "call_presence":
      return { callActive: false, inputMode: "text" };
    case "device_bridge_action":
      return { executionTarget: "none", approvalRequired: true };
    case "research_synthesis":
      return { sourceCount: 0, topic: "t" };
    case "policy_safety_review":
      return { proposedActionSummary: "x", riskTier: "low" as const };
    case "quality_verification":
      return { requirements: ["a"], candidateSummary: "abc" };
    case "growth_advisor":
      return {};
    case "fallback_recovery":
      return { failureCodes: ["e"] };
    case "coding":
    case "debug":
    case "system_design":
    case "designer":
    case "frontend_experience":
    case "animation":
    case "studio":
    case "website_builder":
    case "website_security":
    case "testing":
    case "qa":
      return {
        userText: "implement a small api endpoint for tasks",
        workShape: "coding_oriented",
        surface: "chat",
        complexityScore: 0.45,
        executionRisk: "low" as const,
        vaultScoped: false,
        studioContext: false,
        classified: null
      };
  }
}

const ALL_AGENT_PROVIDERS = MALV_ALL_REGISTERED_AGENT_PROVIDERS;

describe("MALV core agents", () => {
  it("executes all registered agents with typed minimal inputs", async () => {
    const m = await Test.createTestingModule({
      providers: [...ALL_AGENT_PROVIDERS]
    }).compile();
    for (const cls of ALL_AGENT_PROVIDERS) {
      const agent = m.get(cls);
      const env = await agent.execute(ctxBase, minimalInput(agent.identity.kind) as any);
      expect(env.partialStatus).toBe("complete");
      expect(env.identity.kind).toBe(agent.identity.kind);
    }
  });

  it("blocks device bridge and gates sandbox without approval", async () => {
    const m = await Test.createTestingModule({
      providers: [...ALL_AGENT_PROVIDERS]
    }).compile();
    const device = m.get(MalvDeviceBridgeActionAgentService);
    expect((await device.execute(ctxBase, { executionTarget: "desktop", approvalRequired: true })).truthState).toBe("blocked");
    const policy = m.get(MalvPolicySafetyReviewAgentService);
    expect((await policy.execute(ctxBase, { proposedActionSummary: "rm -rf /", riskTier: "low" })).payload.verdict).toBe("block");
    const sandbox = m.get(MalvSandboxActionAgentService);
    expect((await sandbox.execute(ctxBase, { approved: false })).truthState).toBe("needs_approval");
  });
});

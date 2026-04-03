import { ConflictPolicyService } from "./conflict-policy.service";
import { MetaIntelligenceRouterService } from "./meta-intelligence-router.service";
import { ResponsePolicyService } from "./response-policy.service";
import { AnalyticalIntelligenceService } from "./layers/analytical-intelligence.service";
import { BridgeRoutingService } from "./layers/bridge-routing.service";
import { CallIntelligenceService } from "./layers/call-intelligence.service";
import { CodingIntelligenceService } from "./layers/coding-intelligence.service";
import { CommunicationIntelligenceService } from "./layers/communication-intelligence.service";
import { ContextualIntelligenceService } from "./layers/contextual-intelligence.service";
import { ContinuityIntelligenceService } from "./layers/continuity-intelligence.service";
import { ConversationalIntelligenceService } from "./layers/conversational-intelligence.service";
import { DebuggingIntelligenceService } from "./layers/debugging-intelligence.service";
import { DeviceIntelligenceService } from "./layers/device-intelligence.service";
import { EmotionalIntelligenceService } from "./layers/emotional-intelligence.service";
import { ExecutionIntelligenceService } from "./layers/execution-intelligence.service";
import { ExternalExecutionService } from "./layers/external-execution.service";
import { FileMultimodalIntelligenceService } from "./layers/file-multimodal-intelligence.service";
import { MemoryIntelligenceService } from "./layers/memory-intelligence.service";
import { ResearchWebIntelligenceService } from "./layers/research-web-intelligence.service";
import { ReviewCritiqueIntelligenceService } from "./layers/review-critique-intelligence.service";
import { SocialIntelligenceService } from "./layers/social-intelligence.service";
import { SynthesisIntelligenceService } from "./layers/synthesis-intelligence.service";
import { TrustSafetyIntelligenceService } from "./layers/trust-safety-intelligence.service";
import { UncertaintyIntelligenceService } from "./layers/uncertainty-intelligence.service";
import { VoicePresenceService } from "./layers/voice-presence.service";
import { ContinuityBridgeService } from "./continuity-bridge.service";

function makeRouter() {
  const continuity = new ContinuityIntelligenceService();
  return new MetaIntelligenceRouterService(
    new ConflictPolicyService(),
    new ResponsePolicyService(),
    new EmotionalIntelligenceService(),
    new SocialIntelligenceService(),
    new ConversationalIntelligenceService(),
    new CommunicationIntelligenceService(),
    new AnalyticalIntelligenceService(),
    new SynthesisIntelligenceService(),
    new UncertaintyIntelligenceService(),
    new ContextualIntelligenceService(),
    new CodingIntelligenceService(),
    new DebuggingIntelligenceService(),
    new ReviewCritiqueIntelligenceService(),
    new ExecutionIntelligenceService(),
    new FileMultimodalIntelligenceService(),
    new MemoryIntelligenceService(),
    new TrustSafetyIntelligenceService(),
    new ResearchWebIntelligenceService(),
    new CallIntelligenceService(),
    new VoicePresenceService(),
    new DeviceIntelligenceService(new BridgeRoutingService(), new ExternalExecutionService()),
    continuity,
    new ContinuityBridgeService()
  );
}

describe("Intelligence e2e flow stabilization", () => {
  it("scenario 1: chat to call to spoken task keeps advisory-safe posture with confidence", () => {
    const router = makeRouter();
    const out = router.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "medium",
      evidenceLevel: "partial",
      inputMode: "voice",
      callId: "call-1",
      requestedExternalExecution: true,
      activeSurface: "mixed",
      requestText: "open browser and run diagnostics now",
      bridgeAvailability: ["browser_agent", "desktop_agent"]
    });
    expect(out.activeLayers).toContain("call_context");
    expect(out.activeLayers).toContain("device_control");
    expect(out.executionPolicy.allowAutonomousActions).toBe(false);
    expect(out.executionPolicy.requireSandboxValidation).toBe(true);
    expect(out.overallDecisionConfidence).toBeGreaterThan(0.4);
  });

  it("scenario 2: ambiguous device request falls back with low route confidence", () => {
    const router = makeRouter();
    const out = router.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "confused",
      scopeSize: "small",
      evidenceLevel: "partial",
      requestedExternalExecution: true,
      requestText: "do it on that device",
      bridgeAvailability: ["browser_agent"]
    });
    const device = out.layerOutputs.device_control as any;
    expect(device.routeConfidence).toBeLessThan(0.6);
    expect(device.confirmationStrategy).toBe("deny_and_explain");
    expect(device.approvalRequired).toBe(true);
  });

  it("scenario 3: high uncertainty blocks execution and adds validation/risk", () => {
    const router = makeRouter();
    const out = router.decide({
      urgency: "high",
      riskTier: "high",
      modeType: "execute",
      tone: "urgent",
      scopeSize: "medium",
      evidenceLevel: "weak",
      requestText: "execute now without checks"
    });
    expect(out.activeLayers).not.toContain("execution");
    expect(out.finalResponsePolicy.validationNeeded).toBe(true);
    expect(out.finalResponsePolicy.includeRiskCallouts).toBe(true);
  });

  it("scenario 4: continuity bridge preserves transitions without reset", () => {
    const router = makeRouter();
    const first = router.decide({
      urgency: "low",
      riskTier: "medium",
      modeType: "analyze",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "partial",
      inputMode: "voice",
      requestText: "can you check this?"
    });
    const second = router.decide({
      urgency: "low",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "small",
      evidenceLevel: "partial",
      requestedExternalExecution: true,
      activeSurface: "execution",
      requestText: "now execute on desktop"
    });
    expect((first.layerOutputs.chat_to_call_continuity as any).continuityState).toBe("transitioning");
    expect((second.layerOutputs.chat_to_call_continuity as any).contextTransferMap).toContain("call_to_task_continuity");
  });

  it("scenario 5: vault-sensitive call reduces permissiveness safely", () => {
    const router = makeRouter();
    const out = router.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "sensitive",
      scopeSize: "small",
      evidenceLevel: "partial",
      inputMode: "voice",
      vaultScoped: true,
      requestedExternalExecution: true,
      requestText: "my password is secret, execute this"
    });
    const call = out.layerOutputs.call_context as any;
    expect(call.callPrivacyFlags.length).toBeGreaterThan(0);
    expect((out.layerOutputs.chat_to_call_continuity as any).vaultBoundaryState).toBe("strict_isolation");
    expect(out.executionPolicy.allowAutonomousActions).toBe(false);
  });

  it("scenario 6: degraded continuity forces validation-first policy", () => {
    const router = makeRouter();
    const out = router.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "weak",
      activeSurface: "mixed",
      requestText: "do it now"
    });
    expect(out.continuityTrace?.health).toBeDefined();
    expect(out.finalResponsePolicy.validationNeeded).toBe(true);
  });
});

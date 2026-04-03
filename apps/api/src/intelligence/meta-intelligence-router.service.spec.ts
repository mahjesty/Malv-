import { MetaIntelligenceRouterService } from "./meta-intelligence-router.service";
import { ConflictPolicyService } from "./conflict-policy.service";
import { ResponsePolicyService } from "./response-policy.service";
import { AnalyticalIntelligenceService } from "./layers/analytical-intelligence.service";
import { CodingIntelligenceService } from "./layers/coding-intelligence.service";
import { CommunicationIntelligenceService } from "./layers/communication-intelligence.service";
import { ContextualIntelligenceService } from "./layers/contextual-intelligence.service";
import { ConversationalIntelligenceService } from "./layers/conversational-intelligence.service";
import { DebuggingIntelligenceService } from "./layers/debugging-intelligence.service";
import { EmotionalIntelligenceService } from "./layers/emotional-intelligence.service";
import { ExecutionIntelligenceService } from "./layers/execution-intelligence.service";
import { FileMultimodalIntelligenceService } from "./layers/file-multimodal-intelligence.service";
import { MemoryIntelligenceService } from "./layers/memory-intelligence.service";
import { ResearchWebIntelligenceService } from "./layers/research-web-intelligence.service";
import { ReviewCritiqueIntelligenceService } from "./layers/review-critique-intelligence.service";
import { SocialIntelligenceService } from "./layers/social-intelligence.service";
import { SynthesisIntelligenceService } from "./layers/synthesis-intelligence.service";
import { TrustSafetyIntelligenceService } from "./layers/trust-safety-intelligence.service";
import { UncertaintyIntelligenceService } from "./layers/uncertainty-intelligence.service";
import { CallIntelligenceService } from "./layers/call-intelligence.service";
import { VoicePresenceService } from "./layers/voice-presence.service";
import { DeviceIntelligenceService } from "./layers/device-intelligence.service";
import { BridgeRoutingService } from "./layers/bridge-routing.service";
import { ExternalExecutionService } from "./layers/external-execution.service";
import { ContinuityIntelligenceService } from "./layers/continuity-intelligence.service";
import { ContinuityBridgeService } from "./continuity-bridge.service";

describe("MetaIntelligenceRouterService", () => {
  const makeSvc = () =>
    new MetaIntelligenceRouterService(
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
      new ContinuityIntelligenceService(),
      new ContinuityBridgeService()
    );
  const svc = makeSvc();

  it("computes deterministic weights for same input", () => {
    const input = {
      urgency: "medium",
      riskTier: "medium",
      modeType: "fix",
      tone: "technical",
      scopeSize: "medium",
      evidenceLevel: "partial"
    } as const;
    const a = svc.decide(input);
    const b = svc.decide(input);
    expect(a.priorityOrder).toEqual(b.priorityOrder);
    expect(a.finalResponsePolicy).toEqual(b.finalResponsePolicy);
  });

  it("uses stable tie-breaking by layer order", () => {
    const out = svc.decide({
      urgency: "low",
      riskTier: "low",
      modeType: "improve",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "strong"
    });
    const eq = out.priorityOrder.filter((x) => x.weight === 0.5).map((x) => x.layer);
    expect(eq[0]).toBe("contextual");
  });

  it("applies required conflict decisions", () => {
    const out = svc.decide({
      urgency: "high",
      riskTier: "high",
      modeType: "execute",
      tone: "confused",
      scopeSize: "large",
      evidenceLevel: "weak"
    });
    const kinds = out.conflictDecisions.map((d) => d.conflictType);
    expect(kinds).toEqual([
      "urgency_vs_completeness",
      "empathy_vs_directness",
      "speed_vs_safety",
      "confidence_vs_uncertainty",
      "action_vs_explanation"
    ]);
  });

  it("never lets safety be overridden", () => {
    const out = svc.decide({
      urgency: "high",
      riskTier: "low",
      modeType: "execute",
      tone: "direct",
      scopeSize: "small",
      evidenceLevel: "strong"
    });
    const speedSafety = out.conflictDecisions.find((d) => d.conflictType === "speed_vs_safety");
    expect(speedSafety?.winner).toBe("safety");
    expect(out.priorityOrder[0].layer).toBe("trust_safety");
  });

  it("activates foundational layers selectively", () => {
    const out = svc.decide({
      urgency: "low",
      riskTier: "low",
      modeType: "explain",
      tone: "neutral",
      scopeSize: "small",
      evidenceLevel: "strong"
    });
    expect(out.activeLayers).toContain("communication");
    expect(out.activeLayers).not.toContain("debugging");
  });

  it("boosts debug pathways when failure context is detected", () => {
    const out = svc.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "analyze",
      tone: "neutral",
      scopeSize: "medium",
      evidenceLevel: "partial",
      requestText: "there is an error stack trace and failing test"
    });
    expect(out.activeLayers).toContain("debugging");
    expect(out.activeLayers).toContain("review_critique");
  });

  it("suppresses execution when uncertainty is high", () => {
    const out = svc.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "neutral",
      scopeSize: "medium",
      evidenceLevel: "weak",
      requestText: "execute this without enough evidence"
    });
    expect(out.activeLayers).not.toContain("execution");
    expect(out.finalResponsePolicy.includeRiskCallouts).toBe(true);
  });

  it("survives layer analyzer failure without throwing", () => {
    const local = makeSvc();
    const emotional = (local as any).emotionalLayer as EmotionalIntelligenceService;
    jest.spyOn(emotional, "analyze").mockImplementation(() => {
      throw new Error("boom");
    });
    const out = local.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "analyze",
      tone: "confused",
      scopeSize: "medium",
      evidenceLevel: "partial"
    });
    expect(out.finalResponsePolicy).toBeTruthy();
  });

  it("cannot upgrade certainty without strong evidence", () => {
    const out = svc.decide({
      urgency: "low",
      riskTier: "medium",
      modeType: "analyze",
      tone: "technical",
      scopeSize: "medium",
      evidenceLevel: "weak"
    });
    expect(out.finalResponsePolicy.certaintyClass).not.toBe("verified");
  });

  it("routes spoken contexts into call intelligence layers", () => {
    const out = svc.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "medium",
      evidenceLevel: "partial",
      inputMode: "voice",
      callId: "call-123",
      requestText: "Please open browser and run this now"
    });
    expect(out.activeLayers).toContain("call_context");
    expect(out.activeLayers).toContain("voice_presence");
    expect(out.layerOutputs.call_context).toBeTruthy();
  });

  it("enforces external execution approvals under risk", () => {
    const out = svc.decide({
      urgency: "high",
      riskTier: "high",
      modeType: "execute",
      tone: "urgent",
      scopeSize: "medium",
      evidenceLevel: "weak",
      requestedExternalExecution: true,
      requestText: "turn on home thermostat"
    });
    const device = out.layerOutputs.device_control as any;
    expect(out.activeLayers).toContain("device_control");
    expect(device.approvalRequired).toBe(true);
  });

  it("tracks continuity and vault boundaries across surfaces", () => {
    const out = svc.decide({
      urgency: "low",
      riskTier: "medium",
      modeType: "analyze",
      tone: "sensitive",
      scopeSize: "medium",
      evidenceLevel: "partial",
      inputMode: "video",
      activeSurface: "mixed",
      requestedExternalExecution: true,
      vaultScoped: true
    });
    const continuity = out.layerOutputs.chat_to_call_continuity as any;
    expect(out.activeLayers).toContain("vault_context_boundary");
    expect(continuity.vaultBoundaryState).toBe("strict_isolation");
  });

  it("activates call/device/continuity layers for ambiguous spoken intent", () => {
    const out = svc.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "confused",
      scopeSize: "medium",
      evidenceLevel: "partial",
      inputMode: "voice",
      callId: "c1",
      requestedExternalExecution: true,
      activeSurface: "mixed",
      requestText: "can you maybe do it on that device now?"
    });
    expect(out.activeLayers).toContain("call_context");
    expect(out.activeLayers).toContain("device_control");
    expect(out.activeLayers).toContain("chat_to_call_continuity");
  });

  it("falls back safely if new layer fails", () => {
    const local = makeSvc();
    const deviceLayer = (local as any).deviceLayer as DeviceIntelligenceService;
    jest.spyOn(deviceLayer, "analyze").mockImplementation(() => {
      throw new Error("device_layer_boom");
    });
    const out = local.decide({
      urgency: "medium",
      riskTier: "medium",
      modeType: "execute",
      tone: "direct",
      scopeSize: "small",
      evidenceLevel: "partial",
      requestedExternalExecution: true,
      requestText: "open browser"
    });
    expect(out.finalResponsePolicy).toBeTruthy();
    expect(out.layerOutputs.device_control).toBeUndefined();
  });

  it("adds structured traces and continuity health metadata", () => {
    const out = svc.decide({
      urgency: "high",
      riskTier: "high",
      modeType: "execute",
      tone: "neutral",
      scopeSize: "medium",
      evidenceLevel: "weak",
      requestText: "execute now",
      requestedExternalExecution: true
    });
    expect(out.routerDecisionTrace).toBeTruthy();
    expect(out.confidenceTrace).toBeTruthy();
    expect(out.continuityTrace?.health).toBeDefined();
    expect(out.finalResponsePolicy.validationNeeded).toBe(true);
  });
});

import { Injectable } from "@nestjs/common";
import { ConflictPolicyService } from "./conflict-policy.service";
import { ResponsePolicyService } from "./response-policy.service";
import { TIER1_FOUNDATIONAL_LAYER_IDS } from "./intelligence-registry";
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
import { ContinuityIntelligenceService } from "./layers/continuity-intelligence.service";
import { ContinuityBridgeService } from "./continuity-bridge.service";
import type {
  CallIntelligenceLayerOutput,
  CommunicationLayerOutput,
  ContextualLayerOutput,
  ContinuityIntelligenceLayerOutput,
  DebuggingLayerOutput,
  DeviceIntelligenceLayerOutput,
  EmotionalLayerOutput,
  IntelligenceLayerId,
  MetaIntelligenceRouterDecision,
  MetaPriorityItem,
  MetaRouterInput,
  ResearchWebLayerOutput,
  UncertaintyLayerOutput
} from "./meta-intelligence.types";

const LAYER_ORDER: IntelligenceLayerId[] = [
  "trust_safety",
  "uncertainty",
  "execution",
  "analytical",
  "coding",
  "debugging",
  "review_critique",
  "social",
  "conversational",
  "emotional",
  "communication",
  "research",
  "web",
  "contextual",
  "memory",
  "file_intelligence",
  "multimodal",
  "synthesis",
  "call_context",
  "voice_presence",
  "spoken_execution",
  "call_privacy",
  "device_control",
  "bridge_routing",
  "external_agent_execution",
  "action_confirmation",
  "rollback_recovery",
  "chat_to_call_continuity",
  "call_to_task_continuity",
  "task_to_device_continuity",
  "multi_device_session",
  "vault_context_boundary"
];

const BASE_WEIGHTS: Partial<Record<IntelligenceLayerId, number>> = {
  trust_safety: 1.0,
  uncertainty: 0.95,
  execution: 0.75,
  analytical: 0.72,
  coding: 0.7,
  debugging: 0.7,
  review_critique: 0.7,
  conversational: 0.55,
  emotional: 0.55,
  communication: 0.55,
  social: 0.52,
  research: 0.45,
  web: 0.45,
  contextual: 0.5,
  memory: 0.5,
  file_intelligence: 0.5,
  multimodal: 0.5,
  synthesis: 0.5,
  call_context: 0.62,
  voice_presence: 0.58,
  spoken_execution: 0.68,
  call_privacy: 0.86,
  device_control: 0.72,
  bridge_routing: 0.72,
  external_agent_execution: 0.72,
  action_confirmation: 0.8,
  rollback_recovery: 0.82,
  chat_to_call_continuity: 0.66,
  call_to_task_continuity: 0.66,
  task_to_device_continuity: 0.66,
  multi_device_session: 0.64,
  vault_context_boundary: 0.9
};

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Math.round(v * 1000) / 1000;
}

function addWeight(weights: Partial<Record<IntelligenceLayerId, number>>, layer: IntelligenceLayerId, delta: number): void {
  weights[layer] = (weights[layer] ?? 0) + delta;
}

@Injectable()
export class MetaIntelligenceRouterService {
  constructor(
    private readonly conflictPolicy: ConflictPolicyService,
    private readonly responsePolicy: ResponsePolicyService,
    private readonly emotionalLayer: EmotionalIntelligenceService,
    private readonly socialLayer: SocialIntelligenceService,
    private readonly conversationalLayer: ConversationalIntelligenceService,
    private readonly communicationLayer: CommunicationIntelligenceService,
    private readonly analyticalLayer: AnalyticalIntelligenceService,
    private readonly synthesisLayer: SynthesisIntelligenceService,
    private readonly uncertaintyLayer: UncertaintyIntelligenceService,
    private readonly contextualLayer: ContextualIntelligenceService,
    private readonly codingLayer: CodingIntelligenceService,
    private readonly debuggingLayer: DebuggingIntelligenceService,
    private readonly reviewLayer: ReviewCritiqueIntelligenceService,
    private readonly executionLayer: ExecutionIntelligenceService,
    private readonly fileLayer: FileMultimodalIntelligenceService,
    private readonly memoryLayer: MemoryIntelligenceService,
    private readonly trustSafetyLayer: TrustSafetyIntelligenceService,
    private readonly researchLayer: ResearchWebIntelligenceService,
    private readonly callLayer: CallIntelligenceService,
    private readonly voicePresenceLayer: VoicePresenceService,
    private readonly deviceLayer: DeviceIntelligenceService,
    private readonly continuityLayer: ContinuityIntelligenceService,
    private readonly continuityBridge: ContinuityBridgeService
  ) {}

  decide(input: MetaRouterInput): MetaIntelligenceRouterDecision {
    const normalizedInput = this.normalizeInput(input);
    const bridgeState = normalizedInput.sessionId
      ? this.continuityBridge.getContext(normalizedInput.sessionId, normalizedInput.continuityOwnerUserId)
      : null;
    const continuityBridge = this.continuityLayer.getBridgeState();
    const enrichedInput: MetaRouterInput = {
      ...normalizedInput,
      lastSurface: normalizedInput.lastSurface ?? continuityBridge.lastSurface,
      lastIntentType: normalizedInput.lastIntentType ?? continuityBridge.lastIntentType,
      lastExecutionTarget: normalizedInput.lastExecutionTarget ?? continuityBridge.lastExecutionTarget,
      lastTaskSummary: normalizedInput.lastTaskSummary ?? continuityBridge.lastTaskSummary,
      lastContinuityState: normalizedInput.lastContinuityState ?? continuityBridge.lastContinuityState,
      activeSurface: normalizedInput.activeSurface ?? ((bridgeState?.lastSurface as "chat" | "call" | "execution" | undefined) ?? undefined)
    };
    const weights: Partial<Record<IntelligenceLayerId, number>> = { ...BASE_WEIGHTS };
    const signals = this.computeSignals(enrichedInput);
    const failureClassifications: Array<{ layer: IntelligenceLayerId; class: "transient" | "persistent" | "unsafe"; reason: string }> = [];
    const conflictingSignalsDetected = this.hasConflictingSignals(enrichedInput, signals);
    const highUrgency = signals.urgencyScore >= 0.75;
    const highRisk = enrichedInput.riskTier === "high";
    const fixFamily = enrichedInput.modeType === "fix" || enrichedInput.modeType === "execute";
    const explainFamily = enrichedInput.modeType === "explain" || enrichedInput.modeType === "analyze";
    const confusedFamily = signals.emotionalSignal >= 0.65;

    if (highUrgency) {
      addWeight(weights, "execution", 0.15);
      addWeight(weights, "communication", 0.1);
      addWeight(weights, "analytical", -0.05);
      addWeight(weights, "research", -0.1);
      addWeight(weights, "web", -0.1);
    }
    if (highRisk) {
      addWeight(weights, "trust_safety", 0.05);
      addWeight(weights, "uncertainty", 0.05);
      addWeight(weights, "execution", -0.1);
      addWeight(weights, "review_critique", 0.08);
    }
    if (fixFamily) {
      addWeight(weights, "coding", 0.15);
      addWeight(weights, "debugging", 0.15);
      addWeight(weights, "review_critique", 0.08);
    }
    if (explainFamily) {
      addWeight(weights, "analytical", 0.15);
      addWeight(weights, "synthesis", 0.08);
      addWeight(weights, "execution", -0.1);
    }
    if (confusedFamily) {
      addWeight(weights, "communication", 0.15);
      addWeight(weights, "conversational", 0.08);
      addWeight(weights, "emotional", 0.1);
    }
    if (enrichedInput.tone === "technical") {
      addWeight(weights, "coding", 0.06);
      addWeight(weights, "analytical", 0.06);
      addWeight(weights, "communication", -0.04);
    }
    if (enrichedInput.evidenceLevel === "weak") {
      addWeight(weights, "uncertainty", 0.05);
      addWeight(weights, "trust_safety", 0.04);
    }
    if (enrichedInput.scopeSize === "large") {
      addWeight(weights, "synthesis", 0.08);
      addWeight(weights, "contextual", 0.07);
      addWeight(weights, "memory", 0.08);
    }
    if (enrichedInput.inputMode === "voice" || enrichedInput.inputMode === "video" || Boolean(enrichedInput.callId)) {
      addWeight(weights, "call_context", 0.2);
      addWeight(weights, "voice_presence", 0.18);
      addWeight(weights, "call_privacy", 0.22);
      addWeight(weights, "spoken_execution", 0.2);
    }
    if (enrichedInput.requestedExternalExecution) {
      addWeight(weights, "device_control", 0.22);
      addWeight(weights, "bridge_routing", 0.25);
      addWeight(weights, "external_agent_execution", 0.25);
      addWeight(weights, "action_confirmation", 0.18);
      addWeight(weights, "rollback_recovery", 0.2);
    }
    if (enrichedInput.activeSurface === "mixed" || enrichedInput.activeDevice !== undefined) {
      addWeight(weights, "chat_to_call_continuity", 0.12);
      addWeight(weights, "call_to_task_continuity", 0.12);
      addWeight(weights, "task_to_device_continuity", 0.12);
      addWeight(weights, "multi_device_session", 0.12);
    }
    if (enrichedInput.vaultScoped) {
      addWeight(weights, "vault_context_boundary", 0.2);
    }
    if (enrichedInput.hasFiles) {
      addWeight(weights, "file_intelligence", 0.2);
      addWeight(weights, "multimodal", 0.2);
      addWeight(weights, "analytical", 0.08);
    }
    if (signals.debugSignal) {
      addWeight(weights, "debugging", 0.22);
      addWeight(weights, "review_critique", 0.12);
    }
    if (signals.evidenceWeakSignal) {
      addWeight(weights, "execution", -0.2);
      addWeight(weights, "uncertainty", 0.15);
    }

    let activeLayers = this.computeActiveLayers(enrichedInput, signals);
    const layerOutputs = this.collectLayerOutputs(activeLayers, enrichedInput, signals, failureClassifications);
    this.continuityLayer.updateBridgeState({
      lastIntentType: (layerOutputs.call_context as any)?.liveIntentType ?? enrichedInput.lastIntentType ?? null,
      lastExecutionTarget: (layerOutputs.device_control as any)?.executionTarget ?? enrichedInput.lastExecutionTarget ?? null
    });
    if (normalizedInput.sessionId) {
      try {
        this.continuityBridge.setContext(
          normalizedInput.sessionId,
          {
            activeIntent: String((layerOutputs.call_context as any)?.liveIntentType ?? enrichedInput.modeType),
            entities: [(layerOutputs.device_control as any)?.executionTarget].filter(Boolean) as string[],
            lastAction: (enrichedInput.requestText ?? "").slice(0, 120),
            lastSurface: ((layerOutputs.chat_to_call_continuity as any)?.activeSurface ?? "chat") as any
          },
          normalizedInput.continuityOwnerUserId
        );
      } catch {
        // Non-blocking bridge continuity.
      }
    }
    this.applyCrossLayerRules(layerOutputs, weights, signals);
    this.applyConfidenceWeights(layerOutputs, weights);
    const confidenceSuppressed = this.applyConfidenceSuppression(activeLayers, layerOutputs, weights);
    activeLayers = confidenceSuppressed.activeLayers;
    const suppressedLayers = TIER1_FOUNDATIONAL_LAYER_IDS.filter((layer) => !activeLayers.includes(layer));
    const beforeAlignmentConfidence = this.computeOverallDecisionConfidence(enrichedInput, layerOutputs);
    const alignedConfidence = this.alignConfidence(beforeAlignmentConfidence, enrichedInput, layerOutputs);
    const conflictDecisions = this.conflictPolicy.resolve(enrichedInput);
    const continuity = layerOutputs.chat_to_call_continuity as ContinuityIntelligenceLayerOutput | undefined;
    const continuityHealth = continuity?.continuityHealth ?? "partial";
    const continuityPenalty = continuityHealth === "weak" ? 0.06 : continuityHealth === "partial" ? 0.02 : 0;
    const overallDecisionConfidence = clamp01(alignedConfidence - continuityPenalty);
    const finalResponsePolicy = this.responsePolicy.derive(enrichedInput, conflictDecisions, layerOutputs);
    if (conflictingSignalsDetected || continuityHealth === "weak") {
      finalResponsePolicy.validationNeeded = true;
      finalResponsePolicy.includeRiskCallouts = true;
      if (finalResponsePolicy.confidenceClass === "high") finalResponsePolicy.confidenceClass = "medium";
    }
    const executionPolicy = this.responsePolicy.deriveExecutionPolicy(enrichedInput, layerOutputs);

    const priorityOrder: MetaPriorityItem[] = LAYER_ORDER.map((layer) => ({
      layer,
      weight: clamp01(weights[layer] ?? 0),
      rationale: this.rationaleFor(layer, input)
    }))
      .filter((x) => activeLayers.includes(x.layer))
      .sort((a, b) => b.weight - a.weight || LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));

    return {
      activeLayers,
      suppressedLayers,
      priorityOrder,
      conflictDecisions,
      finalResponsePolicy,
      executionPolicy,
      layerOutputs,
      overallDecisionConfidence,
      routerDecisionTrace: {
        safeInputFallback: input == null,
        failureClassifications,
        conflictingSignalsDetected
      },
      confidenceTrace: {
        beforeAlignment: beforeAlignmentConfidence,
        afterAlignment: overallDecisionConfidence,
        evidenceLevel: enrichedInput.evidenceLevel,
        confidenceExplanation: `aligned confidence for ${enrichedInput.modeType} with evidence=${enrichedInput.evidenceLevel}`
      },
      continuityTrace: {
        health: continuityHealth,
        signals: continuity?.contextTransferMap ?? ["no_continuity_signal"]
      }
    };
  }

  private applyConfidenceSuppression(
    activeLayers: IntelligenceLayerId[],
    layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"],
    weights: Partial<Record<IntelligenceLayerId, number>>
  ): { activeLayers: IntelligenceLayerId[] } {
    const set = new Set(activeLayers);
    const execution = layerOutputs.execution as { executionConfidence?: number; executionReadiness?: string } | undefined;
    const device = layerOutputs.device_control as { routeConfidence?: number } | undefined;
    const lowExecutionConfidence = (execution?.executionConfidence ?? 1) < 0.6;
    const lowRouteConfidence = (device?.routeConfidence ?? 1) < 0.6;
    if (lowExecutionConfidence || lowRouteConfidence || execution?.executionReadiness === "blocked") {
      set.delete("execution");
      addWeight(weights, "execution", -0.35);
      addWeight(weights, "uncertainty", 0.12);
      addWeight(weights, "trust_safety", 0.08);
      const e = layerOutputs.execution as any;
      if (e) {
        e.executionReadiness = e.executionReadiness === "blocked" ? "blocked" : "needs_validation";
        e.executionReadinessReason = "confidence_below_threshold_suggests_validation";
        e.fallbackSuggested = true;
      }
    }
    return { activeLayers: [...set] };
  }

  private applyConfidenceWeights(
    layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"],
    weights: Partial<Record<IntelligenceLayerId, number>>
  ): void {
    const deviceConfidence = (layerOutputs.device_control as any)?.confidence ?? (layerOutputs.device_control as any)?.routeConfidence;
    const executionConfidence = (layerOutputs.execution as any)?.confidence ?? (layerOutputs.execution as any)?.executionConfidence;
    const researchConfidence = (layerOutputs.research as any)?.confidence ?? (layerOutputs.research as any)?.evidenceConfidence;
    const synthesisConfidence = (layerOutputs.synthesis as any)?.confidence ?? (layerOutputs.synthesis as any)?.synthesisConfidence;
    if (typeof deviceConfidence === "number") addWeight(weights, "device_control", deviceConfidence - 0.5);
    if (typeof executionConfidence === "number") addWeight(weights, "execution", executionConfidence - 0.5);
    if (typeof researchConfidence === "number") addWeight(weights, "research", researchConfidence - 0.5);
    if (typeof synthesisConfidence === "number") addWeight(weights, "synthesis", synthesisConfidence - 0.5);
  }

  private computeOverallDecisionConfidence(
    input: MetaRouterInput,
    layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"]
  ): number {
    const evidence = input.evidenceLevel === "strong" ? 0.88 : input.evidenceLevel === "partial" ? 0.62 : 0.35;
    const routeConfidence = (layerOutputs.device_control as any)?.routeConfidence ?? 0.65;
    const executionConfidence = (layerOutputs.execution as any)?.executionConfidence ?? 0.65;
    const synthesisConfidence = (layerOutputs.synthesis as any)?.synthesisConfidence ?? 0.65;
    const evidenceConfidence = (layerOutputs.research as any)?.evidenceConfidence ?? evidence;
    const uncertaintyPenalty =
      (layerOutputs.uncertainty as UncertaintyLayerOutput | undefined)?.certaintyClass === "unknown"
        ? 0.25
        : (layerOutputs.uncertainty as UncertaintyLayerOutput | undefined)?.certaintyClass === "tentative"
          ? 0.12
          : 0;
    const confidence = evidence * 0.24 + routeConfidence * 0.2 + executionConfidence * 0.22 + synthesisConfidence * 0.2 + evidenceConfidence * 0.14 - uncertaintyPenalty;
    return clamp01(confidence);
  }

  private computeActiveLayers(input: MetaRouterInput, signals: RouterSignalBundle): IntelligenceLayerId[] {
    const active = new Set<IntelligenceLayerId>([
      "trust_safety",
      "uncertainty",
      "communication",
      "conversational",
      "contextual"
    ]);
    if (input.modeType === "fix" || input.modeType === "execute") {
      active.add("execution");
      active.add("coding");
      active.add("debugging");
      active.add("review_critique");
      active.add("analytical");
    }
    if (input.modeType === "analyze" || input.modeType === "explain" || input.scopeSize === "large") {
      active.add("analytical");
      active.add("synthesis");
    }
    if (input.tone === "confused" || input.tone === "emotional" || input.tone === "sensitive") {
      active.add("emotional");
      active.add("social");
    }
    if (input.hasFiles) {
      active.add("file_intelligence");
      active.add("multimodal");
    }
    if ((input.requestText ?? "").toLowerCase().match(/web|research|source|evidence/)) {
      active.add("research");
      active.add("web");
    }
    if (input.inputMode === "voice" || input.inputMode === "video" || Boolean(input.callId)) {
      active.add("call_context");
      active.add("voice_presence");
      active.add("live_conversation_state");
      active.add("call_privacy");
      active.add("spoken_execution");
      active.add("avatar_behavior");
    }
    if (input.requestedExternalExecution) {
      active.add("device_control");
      active.add("home_control");
      active.add("external_agent_execution");
      active.add("environment_intelligence");
      active.add("bridge_routing");
      active.add("permission_awareness");
      active.add("action_confirmation");
      active.add("rollback_recovery");
    }
    if (input.activeSurface === "mixed" || input.requestedExternalExecution || (input.inputMode === "voice" || input.inputMode === "video")) {
      active.add("chat_to_call_continuity");
      active.add("call_to_task_continuity");
      active.add("task_to_device_continuity");
      active.add("multi_device_session");
      active.add("vault_context_boundary");
    }
    if (input.scopeSize !== "small" || input.memoryHint) active.add("memory");
    if (signals.debugSignal) {
      active.add("debugging");
      active.add("review_critique");
      active.add("execution");
    }
    if (signals.evidenceWeakSignal) active.delete("execution");
    return [...active];
  }

  private collectLayerOutputs(
    activeLayers: IntelligenceLayerId[],
    input: MetaRouterInput,
    signals: RouterSignalBundle,
    failures: Array<{ layer: IntelligenceLayerId; class: "transient" | "persistent" | "unsafe"; reason: string }>
  ) {
    const layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"] = {};
    const run = <T>(layer: IntelligenceLayerId, fn: () => T) => {
      if (!activeLayers.includes(layer)) return;
      try {
        layerOutputs[layer] = fn() as unknown;
      } catch {
        failures.push({
          layer,
          class: layer === "trust_safety" || layer === "uncertainty" ? "unsafe" : "transient",
          reason: "layer_runtime_error"
        });
        // Non-blocking: preserve existing behavior if a layer fails.
        if (layer === "trust_safety" || layer === "uncertainty") {
          layerOutputs[layer] =
            layer === "trust_safety"
              ? { riskSummary: "layer_error_fallback", approvalNeeded: true, trustLevel: "restricted", safetyFlags: ["layer_failure_fallback"], privacyFlags: [] }
              : { certaintyClass: "unknown", evidenceLevel: input.evidenceLevel, validationNeeded: true, overclaimRisk: "high" };
        }
      }
    };
    run("emotional", () => this.emotionalLayer.analyze(input));
    run("social", () => this.socialLayer.analyze(input));
    run("conversational", () => this.conversationalLayer.analyze(input));
    run("communication", () => this.communicationLayer.analyze(input));
    run("uncertainty", () => this.uncertaintyLayer.analyze(input));
    run("contextual", () => this.contextualLayer.analyze(input));
    run("analytical", () =>
      this.analyticalLayer.analyze(input, {
        contextualComplexity:
          (layerOutputs.contextual as ContextualLayerOutput | undefined)?.stateModel?.repetitionSignals === "clear" || signals.scopeSignal > 0.8
            ? "high"
            : signals.scopeSignal > 0.4
              ? "medium"
              : "low"
      })
    );
    run("coding", () => this.codingLayer.analyze(input));
    run("debugging", () => this.debuggingLayer.analyze(input));
    run("review_critique", () => this.reviewLayer.analyze(input));
    run("file_intelligence", () => this.fileLayer.analyze(input));
    run("multimodal", () => this.fileLayer.analyze(input));
    run("memory", () => this.memoryLayer.analyze(input));
    run("trust_safety", () => this.trustSafetyLayer.analyze(input));
    run("research", () => this.researchLayer.analyze(input));
    run("web", () => this.researchLayer.analyze(input));
    run("execution", () =>
      this.executionLayer.analyze(input, {
        uncertaintyValidationNeeded: (layerOutputs.uncertainty as UncertaintyLayerOutput | undefined)?.validationNeeded ?? signals.evidenceWeakSignal,
        debugDetected: signals.debugSignal
      })
    );
    run("call_context", () => this.callLayer.analyze(input));
    run("voice_presence", () => this.voicePresenceLayer.analyze(input, layerOutputs.call_context as CallIntelligenceLayerOutput | undefined));
    run("live_conversation_state", () => this.voicePresenceLayer.analyze(input, layerOutputs.call_context as CallIntelligenceLayerOutput | undefined));
    run("call_privacy", () => this.callLayer.analyze({ ...input, tone: input.vaultScoped ? "sensitive" : input.tone }));
    run("spoken_execution", () => this.callLayer.analyze(input));
    run("avatar_behavior", () => this.voicePresenceLayer.analyze(input, layerOutputs.voice_presence as CallIntelligenceLayerOutput | undefined));
    run("device_control", () => this.deviceLayer.analyze(input));
    run("home_control", () => this.deviceLayer.analyze({ ...input, activeDevice: "home_hub" }));
    run("external_agent_execution", () => this.deviceLayer.analyze(input));
    run("environment_intelligence", () => this.deviceLayer.analyze(input));
    run("bridge_routing", () => this.deviceLayer.analyze(input));
    run("permission_awareness", () => this.deviceLayer.analyze(input));
    run("action_confirmation", () => this.deviceLayer.analyze(input));
    run("rollback_recovery", () => this.deviceLayer.analyze(input));
    run("chat_to_call_continuity", () => this.continuityLayer.analyze(input));
    run("call_to_task_continuity", () => this.continuityLayer.analyze(input));
    run("task_to_device_continuity", () => this.continuityLayer.analyze(input));
    run("multi_device_session", () => this.continuityLayer.analyze(input));
    run("vault_context_boundary", () => this.continuityLayer.analyze(input));
    run("synthesis", () =>
      this.synthesisLayer.analyze(input, {
        emotionalState: (layerOutputs.emotional as EmotionalLayerOutput | undefined)?.emotionalStateEstimate,
        situationalPriority: (layerOutputs.contextual as ContextualLayerOutput | undefined)?.situationalPriority,
        analyticalNextStep: (layerOutputs.analytical as any)?.recommendedNextStep,
        uncertaintyClass: (layerOutputs.uncertainty as UncertaintyLayerOutput | undefined)?.certaintyClass,
        researchReliability: (layerOutputs.research as ResearchWebLayerOutput | undefined)?.answerReliabilityEstimate
      })
    );
    return layerOutputs;
  }

  private applyCrossLayerRules(
    layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"],
    weights: Partial<Record<IntelligenceLayerId, number>>,
    signals: RouterSignalBundle
  ): void {
    const emotional = layerOutputs.emotional as EmotionalLayerOutput | undefined;
    const communication = layerOutputs.communication as CommunicationLayerOutput | undefined;
    const uncertainty = layerOutputs.uncertainty as UncertaintyLayerOutput | undefined;
    const execution = layerOutputs.execution as any;
    const contextual = layerOutputs.contextual as ContextualLayerOutput | undefined;
    const research = layerOutputs.research as ResearchWebLayerOutput | undefined;
    const debugging = layerOutputs.debugging as DebuggingLayerOutput | undefined;
    const callContext = layerOutputs.call_context as CallIntelligenceLayerOutput | undefined;
    const device = layerOutputs.device_control as DeviceIntelligenceLayerOutput | undefined;
    const continuity = layerOutputs.chat_to_call_continuity as ContinuityIntelligenceLayerOutput | undefined;

    if (emotional?.emotionalStateEstimate === "frustrated" && communication) {
      communication.responseDepth = "brief";
      communication.pacingMode = "fast";
      addWeight(weights, "communication", 0.12);
    }
    if ((uncertainty?.certaintyClass === "tentative" || uncertainty?.certaintyClass === "unknown") && execution) {
      execution.executionReadiness = "blocked";
      execution.executionReadinessReason = "uncertainty_requires_validation_before_action";
      addWeight(weights, "execution", -0.2);
    }
    if (contextual?.stateModel?.sessionPhase === "executing") {
      addWeight(weights, "analytical", 0.08);
    }
    if (research?.answerReliabilityEstimate === "unknown" && uncertainty) {
      uncertainty.validationNeeded = true;
      uncertainty.overclaimRisk = "high";
    }
    if (signals.debugSignal && debugging && execution) {
      execution.requiresApproval = execution.requiresApproval || debugging.diagnosticConfidence < 0.7;
      execution.checkpointPlan = ["capture_failure_state", ...execution.checkpointPlan];
    }
    if (callContext?.callPrivacyFlags.length) {
      addWeight(weights, "call_privacy", 0.12);
      addWeight(weights, "communication", -0.04);
    }
    if (device?.approvalRequired && execution) {
      execution.requiresApproval = true;
      addWeight(weights, "action_confirmation", 0.1);
      addWeight(weights, "rollback_recovery", 0.1);
    }
    if (continuity?.vaultBoundaryState === "strict_isolation") {
      addWeight(weights, "vault_context_boundary", 0.1);
      addWeight(weights, "memory", -0.08);
    }
  }

  private computeSignals(input: MetaRouterInput): RouterSignalBundle {
    const text = input.requestText ?? "";
    const lower = text.toLowerCase();
    const punctuationBoost = Math.min(0.2, ((text.match(/!/g) ?? []).length * 0.05) + ((text.match(/\?/g) ?? []).length * 0.02));
    const urgencyKeywordBoost = /\burgent\b|\basap\b|\bnow\b|\bimmediately\b/.test(lower) ? 0.3 : 0;
    const urgencyScoreBase = input.urgency === "high" ? 0.75 : input.urgency === "medium" ? 0.5 : 0.25;
    const emotionalSignal = input.tone === "frustrated" || input.tone === "emotional" || input.tone === "sensitive" ? 0.8 : input.tone === "confused" ? 0.65 : 0.3;
    const debugSignal = /\berror\b|\bbug\b|\bfail\b|\bstack\b|\btrace\b|\bdebug\b/.test(lower);
    return {
      urgencyScore: Math.min(1, urgencyScoreBase + punctuationBoost + urgencyKeywordBoost),
      emotionalSignal,
      scopeSignal: input.scopeSize === "large" ? 1 : input.scopeSize === "medium" ? 0.6 : 0.2,
      evidenceWeakSignal: input.evidenceLevel === "weak",
      hasFileSignal: Boolean(input.hasFiles),
      memorySignal: Boolean(input.memoryHint),
      executionIntentSignal: input.modeType === "fix" || input.modeType === "execute",
      debugSignal
    };
  }

  private normalizeInput(input: MetaRouterInput): MetaRouterInput {
    if (!input) {
      return {
        urgency: "medium",
        riskTier: "medium",
        modeType: "analyze",
        tone: "neutral",
        scopeSize: "small",
        evidenceLevel: "weak",
        requestText: ""
      };
    }
    return {
      ...input,
      requestText: input.requestText ?? "",
      inputMode: input.inputMode ?? "text"
    };
  }

  private hasConflictingSignals(input: MetaRouterInput, signals: RouterSignalBundle): boolean {
    const riskExecuteConflict = input.modeType === "execute" && input.riskTier === "high" && input.evidenceLevel === "weak";
    const toneUrgencyConflict = input.tone === "neutral" && signals.urgencyScore > 0.8;
    return riskExecuteConflict || toneUrgencyConflict;
  }

  private alignConfidence(base: number, input: MetaRouterInput, layerOutputs: MetaIntelligenceRouterDecision["layerOutputs"]): number {
    let score = base;
    if (input.modeType === "execute") score -= 0.04;
    if (input.modeType === "analyze" || input.modeType === "explain") score += 0.02;
    if (input.requestedExternalExecution) score -= 0.05;
    const evidenceWeak =
      ((layerOutputs.research as any)?.evidenceSummary?.length ?? 0) === 0 &&
      ((layerOutputs.analytical as any)?.problemBreakdown?.length ?? 0) === 0;
    if (score > 0.8 && evidenceWeak) score -= 0.06;
    return clamp01(score);
  }

  private rationaleFor(layer: IntelligenceLayerId, input: MetaRouterInput): string {
    if (layer === "trust_safety") return "Hard guardrail layer. Never downgraded.";
    if (layer === "uncertainty") return `Evidence=${input.evidenceLevel}; certainty must remain calibrated.`;
    if (layer === "execution") return `Mode=${input.modeType}; urgency=${input.urgency}.`;
    if (layer === "communication") return `Tone=${input.tone}; response coherence shaping.`;
    if (layer === "coding" || layer === "debugging" || layer === "review_critique") return "Task-quality triad for implementation correctness.";
    if (layer === "research" || layer === "web") return "Evidence and source-strength support when external verification is needed.";
    if (layer === "call_context" || layer === "voice_presence" || layer === "call_privacy") return "Realtime call-presence behavior and safety.";
    if (layer === "device_control" || layer === "bridge_routing" || layer === "external_agent_execution") return "External action planning through approved bridges.";
    if (layer === "chat_to_call_continuity" || layer === "task_to_device_continuity" || layer === "vault_context_boundary") {
      return "Cross-surface continuity and boundary enforcement.";
    }
    return "Additive contextual intelligence.";
  }
}

type RouterSignalBundle = {
  urgencyScore: number;
  emotionalSignal: number;
  scopeSignal: number;
  evidenceWeakSignal: boolean;
  hasFileSignal: boolean;
  memorySignal: boolean;
  executionIntentSignal: boolean;
  debugSignal: boolean;
};

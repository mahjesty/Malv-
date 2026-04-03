export type IntelligenceLayerId =
  | "emotional"
  | "social"
  | "conversational"
  | "communication"
  | "teaching"
  | "personalization"
  | "presence"
  | "ethical_sensitivity"
  | "attention_management"
  | "focus_guidance"
  | "energy_fatigue"
  | "analytical"
  | "synthesis"
  | "decision"
  | "judgment"
  | "prioritization"
  | "planning"
  | "meta_intelligence"
  | "reflective"
  | "uncertainty"
  | "temporal"
  | "contextual"
  | "state"
  | "execution"
  | "operator"
  | "workflow"
  | "tool_usage"
  | "recovery"
  | "monitoring"
  | "adaptation"
  | "coordination"
  | "completion_awareness"
  | "research"
  | "web"
  | "knowledge"
  | "evidence"
  | "source_trust"
  | "comparison"
  | "reading"
  | "file_intelligence"
  | "multimodal"
  | "document_intelligence"
  | "image_understanding"
  | "audio_understanding"
  | "video_understanding"
  | "log_diagnostics"
  | "structured_data"
  | "coding"
  | "debugging"
  | "editing_transformation"
  | "review_critique"
  | "writing"
  | "design"
  | "creative"
  | "product"
  | "business"
  | "trust_safety"
  | "security"
  | "privacy"
  | "compliance_governance"
  | "memory_governance"
  | "risk"
  | "approval"
  | "learning"
  | "memory"
  | "continuity"
  | "self_improvement"
  | "evaluation"
  | "calibration"
  | "evolution"
  | "proactive"
  | "collaboration"
  | "group_dynamics"
  | "negotiation"
  | "persuasion"
  | "embodiment"
  | "call_context"
  | "voice_presence"
  | "live_conversation_state"
  | "call_privacy"
  | "spoken_execution"
  | "avatar_behavior"
  | "device_control"
  | "home_control"
  | "external_agent_execution"
  | "environment_intelligence"
  | "bridge_routing"
  | "permission_awareness"
  | "action_confirmation"
  | "rollback_recovery"
  | "chat_to_call_continuity"
  | "call_to_task_continuity"
  | "task_to_device_continuity"
  | "multi_device_session"
  | "vault_context_boundary";

export type IntelligenceTier = "tier1_foundational" | "tier2_expansion" | "tier3_advanced";

export type IntelligenceGroup =
  | "human_interaction"
  | "thinking_reasoning"
  | "action_execution"
  | "knowledge_research_web"
  | "file_multimodal_document"
  | "creation_transformation"
  | "trust_safety_governance"
  | "growth_continuity"
  | "collaboration_embodiment"
  | "call_presence_intelligence"
  | "external_action_device_intelligence"
  | "cross_surface_continuity_intelligence";

export type IntelligenceLayerDefinition = {
  id: IntelligenceLayerId;
  group: IntelligenceGroup;
  tier: IntelligenceTier;
  activeByDefault: boolean;
  advisoryOnly: boolean;
  purpose: string;
  integrationPoints: string[];
};

export type CertaintyClass = "verified" | "strongly_inferred" | "tentative" | "unknown";

export type MetaIntelligenceConflictType =
  | "urgency_vs_completeness"
  | "empathy_vs_directness"
  | "speed_vs_safety"
  | "confidence_vs_uncertainty"
  | "action_vs_explanation";

export type MetaPriorityItem = {
  layer: IntelligenceLayerId;
  weight: number;
  rationale: string;
};

export type MetaConflictDecision = {
  conflictType: MetaIntelligenceConflictType;
  winner: string;
  loser: string;
  policyApplied: string;
  rationale: string;
};

export type MetaFinalResponsePolicy = {
  responseMode: "action_first" | "explanation_first" | "balanced";
  toneStyle:
    | "calm_direct"
    | "technical_precise"
    | "supportive_clear"
    | "careful_sensitive"
    | "concise_fix"
    | "strategic_operator"
    | "high_agency_builder"
    | "identity_direct";
  depth: "brief" | "standard" | "deep";
  certaintyClass: CertaintyClass;
  confidenceClass: "high" | "medium" | "low";
  validationNeeded: boolean;
  includeNextStepChecklist: boolean;
  includeRiskCallouts: boolean;
  includeEmpathyLine: boolean;
  confidenceExplanation?: string;
};

export type MetaExecutionPolicy = {
  posture: "observe_only" | "guided_execution" | "actionable_plan";
  approvalPosture: "normal" | "elevated";
  allowAutonomousActions: boolean;
  requireSandboxValidation: boolean;
};

export type ActiveIntelligenceProfile = {
  activeLayers: IntelligenceLayerId[];
  suppressedLayers: IntelligenceLayerId[];
  rationaleByLayer: Partial<Record<IntelligenceLayerId, string>>;
};

export type EmotionalLayerOutput = {
  emotionalStateEstimate: "neutral" | "frustrated" | "confused" | "sensitive" | "positive";
  confidence: number;
  responseStyleRecommendation: "calm_direct" | "supportive_clear" | "careful_sensitive";
  sensitivityHints: string[];
};

export type SocialLayerOutput = {
  interactionStrategy: "direct" | "collaborative" | "reassuring";
  empathyNeed: "low" | "medium" | "high";
  assertivenessNeed: "low" | "medium" | "high";
  reassuranceNeed: boolean;
};

export type ConversationalLayerOutput = {
  conversationMode: "qa" | "collaborative_problem_solving" | "instruction";
  impliedNeeds: string[];
  followupPressure: "low" | "medium" | "high";
  collaborationStyle: "lead" | "paired" | "handoff";
};

export type CommunicationLayerOutput = {
  responseDepth: "brief" | "standard" | "deep";
  pacingMode: "fast" | "measured";
  clarityMode: "plain" | "technical";
  formattingRecommendation: "bulleted" | "stepwise" | "mixed";
};

export type AnalyticalLayerOutput = {
  problemBreakdown: string[];
  rootCauseHypotheses: string[];
  dependencyMap: string[];
  riskFactors?: string[];
  missingInformation?: string[];
  recommendedNextStep: string;
};

export type SynthesisLayerOutput = {
  synthesizedUnderstanding: string;
  unresolvedTensions: string[];
  conflictBetweenSignals?: string[];
  unifiedRecommendation: string;
  synthesisConfidence: number;
  conflictSeverityScore: number;
  confidence?: number;
  fallbackSuggested?: boolean;
};

export type UncertaintyLayerOutput = {
  certaintyClass: CertaintyClass;
  evidenceLevel: MetaRouterEvidenceLevel;
  validationNeeded: boolean;
  overclaimRisk: "low" | "medium" | "high";
};

export type ContextualLayerOutput = {
  activeContextSummary: string;
  hiddenConstraints: string[];
  situationalPriority: "speed" | "safety" | "quality";
  contextAdjustedResponsePolicy: "brief_action" | "balanced" | "deep_careful";
  stateModel?: {
    sessionPhase: "exploring" | "solving" | "executing" | "refining";
    userStressLevel: "low" | "medium" | "high";
    repetitionSignals: "none" | "possible" | "clear";
    taskProgressEstimate: number;
  };
};

export type CodingLayerOutput = {
  languageProfile: string[];
  frameworkProfile: string[];
  ecosystemRiskMap: string[];
  confidenceByArea: Record<string, number>;
  recommendedValidationByStack: string[];
};

export type DebuggingLayerOutput = {
  failureClassification: "runtime" | "type" | "test" | "integration" | "unknown";
  probableRootCause: string;
  diagnosticConfidence: number;
  affectedLayers: string[];
  fastestSafeFixPath: string[];
};

export type ReviewCritiqueLayerOutput = {
  qualityAssessment: "strong" | "mixed" | "weak";
  weaknessMap: string[];
  critiquePriorityOrder: string[];
  actionableImprovements: string[];
  releaseReadinessEstimate: "ready" | "needs_checks" | "not_ready";
};

export type ExecutionLayerOutput = {
  executionReadiness: "ready" | "needs_validation" | "blocked";
  executionReadinessReason?: string;
  actionPlan: string[];
  checkpointPlan: string[];
  rollbackRisk: "low" | "medium" | "high";
  completionCriteria: string[];
  requiresApproval?: boolean;
  executionConfidence: number;
  readinessConfidence: number;
  confidence?: number;
  fallbackSuggested?: boolean;
};

export type FileMultimodalLayerOutput = {
  modalityProfile: string[];
  extractedSignals: string[];
  fileUnderstandingSummary: string;
  multimodalEvidenceMap: string[];
  recommendedActionByModality: string[];
};

export type MemoryLayerOutput = {
  memoryDecision: "retrieve" | "store" | "none";
  memoryWorthiness: "low" | "medium" | "high";
  continuityHints: string[];
  memoryRiskNotes: string[];
};

export type TrustSafetyLayerOutput = {
  riskSummary: string;
  approvalNeeded: boolean;
  trustLevel: "high" | "guarded" | "restricted";
  safetyFlags: string[];
  privacyFlags: string[];
};

export type ResearchWebLayerOutput = {
  researchIntent: "none" | "verify" | "investigate";
  evidenceSummary: string[];
  sourceConfidenceProfile: "low" | "medium" | "high";
  contradictionNotes: string[];
  answerReliabilityEstimate: CertaintyClass;
  followupResearchNeeds: string[];
  insufficientData?: boolean;
  evidenceConfidence: number;
  confidence?: number;
  fallbackSuggested?: boolean;
};

export type CallIntelligenceLayerOutput = {
  callState: "idle" | "listening" | "speaking" | "interrupted" | "paused";
  speakingMode: "listening" | "responding" | "handoff";
  interruptionSignals: string[];
  liveIntentType: "command" | "question" | "emotional_signal" | "mixed";
  voiceToneStrategy: "calm" | "urgent" | "supportive" | "direct";
  presenceMode: "active" | "thinking" | "executing" | "discreet";
  callPrivacyFlags: string[];
  confidence?: number;
  fallbackSuggested?: boolean;
};

export type DeviceIntelligenceLayerOutput = {
  executionTarget: "none" | "phone" | "desktop" | "browser" | "home_device" | "multi_target";
  bridgeRoute: "none" | "mobile_agent" | "desktop_agent" | "browser_agent" | "home_assistant_bridge" | "multi_bridge";
  executionPlan: string[];
  approvalRequired: boolean;
  permissionStatus: "allowed" | "restricted" | "denied" | "unknown";
  rollbackPlan: string[];
  executionRisk: "low" | "medium" | "high";
  confirmationStrategy: "auto_safe" | "ask_before_execute" | "deny_and_explain";
  routeConfidence: number;
  confidenceReason: string;
  confidence?: number;
  fallbackSuggested?: boolean;
};

export type ContinuityIntelligenceLayerOutput = {
  continuityState: "stable" | "transitioning" | "recovery_needed";
  activeSurface: "chat" | "call" | "execution" | "mixed";
  contextTransferMap: string[];
  vaultBoundaryState: "inactive" | "active_guarded" | "strict_isolation";
  sessionScope: "single_surface" | "cross_surface" | "multi_device";
  continuityHealth?: "strong" | "partial" | "weak";
};

export type Tier1LayerOutputMap = {
  emotional: EmotionalLayerOutput;
  social: SocialLayerOutput;
  conversational: ConversationalLayerOutput;
  communication: CommunicationLayerOutput;
  analytical: AnalyticalLayerOutput;
  synthesis: SynthesisLayerOutput;
  uncertainty: UncertaintyLayerOutput;
  contextual: ContextualLayerOutput;
  coding: CodingLayerOutput;
  debugging: DebuggingLayerOutput;
  review_critique: ReviewCritiqueLayerOutput;
  execution: ExecutionLayerOutput;
  file_intelligence: FileMultimodalLayerOutput;
  multimodal: FileMultimodalLayerOutput;
  memory: MemoryLayerOutput;
  trust_safety: TrustSafetyLayerOutput;
  research: ResearchWebLayerOutput;
  web: ResearchWebLayerOutput;
  call_context: CallIntelligenceLayerOutput;
  voice_presence: CallIntelligenceLayerOutput;
  live_conversation_state: CallIntelligenceLayerOutput;
  call_privacy: CallIntelligenceLayerOutput;
  spoken_execution: CallIntelligenceLayerOutput;
  avatar_behavior: CallIntelligenceLayerOutput;
  device_control: DeviceIntelligenceLayerOutput;
  home_control: DeviceIntelligenceLayerOutput;
  external_agent_execution: DeviceIntelligenceLayerOutput;
  environment_intelligence: DeviceIntelligenceLayerOutput;
  bridge_routing: DeviceIntelligenceLayerOutput;
  permission_awareness: DeviceIntelligenceLayerOutput;
  action_confirmation: DeviceIntelligenceLayerOutput;
  rollback_recovery: DeviceIntelligenceLayerOutput;
  chat_to_call_continuity: ContinuityIntelligenceLayerOutput;
  call_to_task_continuity: ContinuityIntelligenceLayerOutput;
  task_to_device_continuity: ContinuityIntelligenceLayerOutput;
  multi_device_session: ContinuityIntelligenceLayerOutput;
  vault_context_boundary: ContinuityIntelligenceLayerOutput;
};

export type MetaIntelligenceRouterDecision = {
  activeLayers: IntelligenceLayerId[];
  suppressedLayers: IntelligenceLayerId[];
  priorityOrder: MetaPriorityItem[];
  conflictDecisions: MetaConflictDecision[];
  finalResponsePolicy: MetaFinalResponsePolicy;
  executionPolicy: MetaExecutionPolicy;
  layerOutputs: Partial<Record<IntelligenceLayerId, unknown>>;
  overallDecisionConfidence: number;
  routerDecisionTrace?: {
    safeInputFallback: boolean;
    failureClassifications: Array<{ layer: IntelligenceLayerId; class: "transient" | "persistent" | "unsafe"; reason: string }>;
    conflictingSignalsDetected: boolean;
  };
  confidenceTrace?: {
    beforeAlignment: number;
    afterAlignment: number;
    evidenceLevel: MetaRouterEvidenceLevel;
    confidenceExplanation?: string;
  };
  continuityTrace?: {
    health: "strong" | "partial" | "weak";
    signals: string[];
  };
};

export type MetaIntelligenceDecision = MetaIntelligenceRouterDecision;

export type MetaRouterUrgency = "low" | "medium" | "high";
export type MetaRouterRiskTier = "low" | "medium" | "high";
export type MetaRouterMode = "explain" | "analyze" | "fix" | "execute" | "improve" | "operator_workflow";
export type MetaRouterEvidenceLevel = "strong" | "partial" | "weak";
export type MetaRouterTone =
  | "neutral"
  | "frustrated"
  | "urgent"
  | "confused"
  | "exploratory"
  | "technical"
  | "emotional"
  | "casual"
  | "direct"
  | "builder"
  | "identity_query"
  | "dissatisfied"
  | "sensitive";

export type MetaRouterInput = {
  urgency: MetaRouterUrgency;
  riskTier: MetaRouterRiskTier;
  modeType: MetaRouterMode;
  tone: MetaRouterTone;
  scopeSize: "small" | "medium" | "large";
  evidenceLevel: MetaRouterEvidenceLevel;
  requestText?: string;
  hasFiles?: boolean;
  memoryHint?: boolean;
  inputMode?: "text" | "voice" | "video";
  sessionType?: string | null;
  callId?: string | null;
  operatorPhase?: string | null;
  activeSurface?: "chat" | "call" | "execution" | "mixed";
  activeDevice?: "phone" | "desktop" | "browser" | "home_hub" | "unknown";
  bridgeAvailability?: Array<"mobile_agent" | "desktop_agent" | "browser_agent" | "home_assistant_bridge">;
  requestedExternalExecution?: boolean;
  vaultScoped?: boolean;
  lastSurface?: "chat" | "call" | "execution" | "device" | null;
  lastIntentType?: "command" | "question" | "emotional_signal" | "mixed" | null;
  lastExecutionTarget?: DeviceIntelligenceLayerOutput["executionTarget"] | null;
  lastTaskSummary?: string | null;
  lastContinuityState?: ContinuityIntelligenceLayerOutput["continuityState"] | null;
  sessionId?: string | null;
};

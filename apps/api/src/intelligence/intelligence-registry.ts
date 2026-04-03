import type {
  IntelligenceGroup,
  IntelligenceLayerDefinition,
  IntelligenceLayerId,
  IntelligenceTier
} from "./meta-intelligence.types";

type GroupBundle = { group: IntelligenceGroup; layers: IntelligenceLayerId[]; tier: IntelligenceTier };

const GROUPS: GroupBundle[] = [
  {
    group: "human_interaction",
    tier: "tier2_expansion",
    layers: [
      "emotional",
      "social",
      "conversational",
      "communication",
      "teaching",
      "personalization",
      "presence",
      "ethical_sensitivity",
      "attention_management",
      "focus_guidance",
      "energy_fatigue"
    ]
  },
  {
    group: "thinking_reasoning",
    tier: "tier2_expansion",
    layers: [
      "analytical",
      "synthesis",
      "decision",
      "judgment",
      "prioritization",
      "planning",
      "meta_intelligence",
      "reflective",
      "uncertainty",
      "temporal",
      "contextual",
      "state"
    ]
  },
  {
    group: "action_execution",
    tier: "tier2_expansion",
    layers: ["execution", "operator", "workflow", "tool_usage", "recovery", "monitoring", "adaptation", "coordination", "completion_awareness"]
  },
  {
    group: "knowledge_research_web",
    tier: "tier2_expansion",
    layers: ["research", "web", "knowledge", "evidence", "source_trust", "comparison", "reading"]
  },
  {
    group: "file_multimodal_document",
    tier: "tier2_expansion",
    layers: [
      "file_intelligence",
      "multimodal",
      "document_intelligence",
      "image_understanding",
      "audio_understanding",
      "video_understanding",
      "log_diagnostics",
      "structured_data"
    ]
  },
  {
    group: "creation_transformation",
    tier: "tier2_expansion",
    layers: ["coding", "debugging", "editing_transformation", "review_critique", "writing", "design", "creative", "product", "business"]
  },
  {
    group: "trust_safety_governance",
    tier: "tier1_foundational",
    layers: ["trust_safety", "security", "privacy", "compliance_governance", "memory_governance", "risk", "approval"]
  },
  {
    group: "growth_continuity",
    tier: "tier3_advanced",
    layers: ["learning", "memory", "continuity", "self_improvement", "evaluation", "calibration", "evolution", "proactive"]
  },
  {
    group: "collaboration_embodiment",
    tier: "tier3_advanced",
    layers: ["collaboration", "group_dynamics", "negotiation", "persuasion", "embodiment"]
  },
  {
    group: "call_presence_intelligence",
    tier: "tier3_advanced",
    layers: ["call_context", "voice_presence", "live_conversation_state", "call_privacy", "spoken_execution", "avatar_behavior"]
  },
  {
    group: "external_action_device_intelligence",
    tier: "tier3_advanced",
    layers: [
      "device_control",
      "home_control",
      "external_agent_execution",
      "environment_intelligence",
      "bridge_routing",
      "permission_awareness",
      "action_confirmation",
      "rollback_recovery"
    ]
  },
  {
    group: "cross_surface_continuity_intelligence",
    tier: "tier3_advanced",
    layers: ["chat_to_call_continuity", "call_to_task_continuity", "task_to_device_continuity", "multi_device_session", "vault_context_boundary"]
  }
];

const TIER1_ACTIVE = new Set<IntelligenceLayerId>([
  "emotional",
  "social",
  "conversational",
  "communication",
  "analytical",
  "synthesis",
  "uncertainty",
  "contextual",
  "coding",
  "debugging",
  "review_critique",
  "execution",
  "file_intelligence",
  "multimodal",
  "memory",
  "trust_safety",
  "research",
  "web"
]);

const TIER_BY_LAYER: Partial<Record<IntelligenceLayerId, IntelligenceTier>> = {
  emotional: "tier1_foundational",
  social: "tier1_foundational",
  conversational: "tier1_foundational",
  communication: "tier1_foundational",
  analytical: "tier1_foundational",
  synthesis: "tier1_foundational",
  uncertainty: "tier1_foundational",
  contextual: "tier1_foundational",
  coding: "tier1_foundational",
  debugging: "tier1_foundational",
  review_critique: "tier1_foundational",
  execution: "tier1_foundational",
  file_intelligence: "tier1_foundational",
  multimodal: "tier1_foundational",
  memory: "tier1_foundational",
  trust_safety: "tier1_foundational",
  research: "tier1_foundational",
  web: "tier1_foundational"
};

export const INTELLIGENCE_REGISTRY: IntelligenceLayerDefinition[] = GROUPS.flatMap((bundle) =>
  bundle.layers.map((layer) => ({
    id: layer,
    group: bundle.group,
    tier: TIER_BY_LAYER[layer] ?? bundle.tier,
    activeByDefault: TIER1_ACTIVE.has(layer),
    advisoryOnly: !TIER1_ACTIVE.has(layer),
    purpose: `${layer} intelligence support`,
    integrationPoints: ["beast_orchestration", "response_policy", "planning_validation_awareness"]
  }))
);

export const FULL_SPECTRUM_LAYER_IDS = INTELLIGENCE_REGISTRY.map((x) => x.id);
export const TIER1_FOUNDATIONAL_LAYER_IDS = INTELLIGENCE_REGISTRY.filter((x) => x.tier === "tier1_foundational").map((x) => x.id);

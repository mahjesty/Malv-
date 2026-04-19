import type { MalvAgentCapability, MalvAgentKind } from "../contracts/malv-agent.contracts";

/** Static capability metadata for deterministic router matching (not runtime prompts). */
export const MALV_AGENT_CAPABILITY_CATALOG: Record<MalvAgentKind, MalvAgentCapability[]> = {
  router: [{ id: "intent_triage", description: "Domain/modality triage", tags: ["routing", "classification", "triage"] }],
  smart_decision: [
    { id: "route_depth", description: "Depth / phased / fallback shaping", tags: ["routing", "decision", "tier"] }
  ],
  conversation: [
    { id: "conv_frame", description: "Continuity and response framing", tags: ["continuity", "session", "response"] }
  ],
  knowledge: [
    { id: "knowledge_shape", description: "Retrieval and synthesis shaping", tags: ["research", "knowledge", "grounding"] }
  ],
  context_assembly: [
    { id: "context_pack", description: "Relevance slots and suppressions", tags: ["memory", "context", "privacy"] }
  ],
  privacy: [{ id: "privacy_gate", description: "Suppression and vault directives", tags: ["privacy", "vault", "policy"] }],
  continuity: [{ id: "cross_surface", description: "Chat/call/task bridge", tags: ["continuity", "session", "call"] }],
  memory_shaping: [{ id: "memory_injection", description: "Context shaping", tags: ["memory", "vault", "privacy"] }],
  response_composer: [{ id: "user_facing_unify", description: "MALV-native response shaping", tags: ["response", "ux"] }],
  planning: [{ id: "decomposition", description: "Phased planning", tags: ["planning", "complex", "risk"] }],
  execution_prep: [{ id: "prep_steps", description: "Sandbox/task prep", tags: ["execution", "sandbox", "tasks"] }],
  sandbox_action: [{ id: "sandbox_bridge", description: "Policy-bound sandbox bridge", tags: ["sandbox", "policy"] }],
  debug_code_intelligence: [{ id: "code_debug", description: "Debug / patch strategy", tags: ["code", "debug", "cci"] }],
  studio_builder: [{ id: "studio", description: "Build units / previews", tags: ["studio", "build", "preview"] }],
  inbox_triage: [{ id: "inbox", description: "Inbox classification", tags: ["inbox", "triage"] }],
  task_framing: [{ id: "tasks", description: "Task definitions", tags: ["tasks", "acceptance"] }],
  image_intelligence: [{ id: "image", description: "Image brief / expansion", tags: ["image", "multimodal"] }],
  multimodal_analysis: [{ id: "multimodal", description: "Files / media analysis", tags: ["multimodal", "files"] }],
  call_presence: [{ id: "call", description: "Live call / presence", tags: ["call", "voice", "latency"] }],
  device_bridge_action: [{ id: "device", description: "Device / bridge planning", tags: ["device", "bridge", "external"] }],
  research_synthesis: [{ id: "research", description: "Local synthesis", tags: ["research", "synthesis"] }],
  policy_safety_review: [{ id: "policy", description: "Pre-execution review", tags: ["policy", "safety"] }],
  quality_verification: [{ id: "quality", description: "Output verification", tags: ["quality", "verify"] }],
  growth_advisor: [{ id: "growth", description: "Advisory improvement hints", tags: ["growth", "advisory"] }],
  fallback_recovery: [{ id: "fallback", description: "Degraded recovery", tags: ["fallback", "recovery"] }],
  coding: [{ id: "coding_impl", description: "Implementation planning and patch intent", tags: ["coding", "implementation", "cci", "patch"] }],
  debug: [{ id: "debug_diag", description: "Structured diagnostics and repro shape", tags: ["debug", "diagnostics", "cci", "repro"] }],
  system_design: [{ id: "systems", description: "Architecture and boundaries", tags: ["architecture", "systems", "planning"] }],
  designer: [{ id: "visual", description: "Design direction and constraints", tags: ["design", "ux", "visual"] }],
  frontend_experience: [{ id: "fe_ux", description: "UX flows and friction mapping", tags: ["frontend", "ux", "responsive"] }],
  animation: [{ id: "motion", description: "Motion and performance guardrails", tags: ["animation", "motion", "performance"] }],
  studio: [{ id: "studio_intel", description: "Studio targeting and preview impact", tags: ["studio", "preview", "inspect", "build_unit"] }],
  website_builder: [{ id: "web_build", description: "Multi-page web composition", tags: ["website", "marketing", "funnel"] }],
  website_security: [{ id: "web_sec", description: "Web threat model and hardening", tags: ["security", "web", "auth"] }],
  testing: [{ id: "tests", description: "Test strategy and matrix", tags: ["testing", "jest", "e2e"] }],
  qa: [{ id: "qa_release", description: "QA scenarios and readiness", tags: ["qa", "quality", "release"] }]
};

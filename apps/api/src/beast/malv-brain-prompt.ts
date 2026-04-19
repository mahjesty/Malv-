/**
 * MALV internal brain — modular sections mapped to a single worker prompt string.
 */
import type { ModeType } from "./mode-router";
import {
  buildMalvCoreSystemPromptText,
  buildMalvPromptContextOverlays,
  buildMalvSystemRolePrompt,
  MALV_CORE_PERSONA_BODY,
  MALV_IDENTITY_LOCK,
  MALV_STYLE_GUARDRAILS_BLOCK,
  MALV_SYSTEM_ROLE_CORE_CONTRACT,
  MALV_SYSTEM_ROLE_HEADER
} from "./malv-personality";
import {
  buildMalvIntentFirstAnswerShapePromptSection,
  classifyMalvQuestionAnswerShape,
  type MalvQuestionAnswerShape
} from "./malv-intent-first-answer-shape.util";
import {
  analyzeMalvMultiIntent,
  buildMalvMultiIntentCompactAnswerPromptSection
} from "./malv-multi-intent-shape.util";

export { classifyMalvMode, type ModeType } from "./mode-router";
export type { MalvQuestionAnswerShape } from "./malv-intent-first-answer-shape.util";

/** @deprecated Use classifyMalvMode */
export { classifyMalvMode as classifyMalvBehaviorMode } from "./mode-router";

/** @deprecated Use ModeType; kept for any external imports. */
export type MalvBehaviorMode = ModeType;

export { MALV_IDENTITY_LOCK };

/** Dedicated system role for OpenAI-style `system` + `user` turns (worker context.systemPrompt). */
export const MALV_SYSTEM_ROLE_PROMPT = buildMalvSystemRolePrompt();

/** Expanded base identity + persona for the worker prompt body. */
export const MALV_CORE_SYSTEM_PROMPT = buildMalvCoreSystemPromptText();

/**
 * Slimmer system base for Tier-1 economy prompts — preserves identity lock + core contract + guardrails,
 * omits the long persona essay to cut pre-token bytes on ordinary chat.
 */
const MALV_ECONOMY_SYSTEM_PROMPT_BODY = `${MALV_SYSTEM_ROLE_HEADER}\n${MALV_IDENTITY_LOCK}\n\n${MALV_SYSTEM_ROLE_CORE_CONTRACT}\n\n${MALV_STYLE_GUARDRAILS_BLOCK}`;

const MODE_INSTRUCTIONS: Record<ModeType, string> = {
  explain:
    "MODE explain: Teach clearly. Define terms, give a tight example, note limits of what you can infer from context.",
  analyze:
    "MODE analyze: Separate evidence vs inference. List hypotheses and what would falsify them. Stay concise.",
  fix:
    "MODE fix: Diagnose, propose minimal corrective steps, and list risks. Use numbered steps for fixes.",
  execute:
    "MODE execute: Give concrete commands/checklists and acceptance criteria. Assume immediate action.",
  improve:
    "MODE improve: Target the smallest high-impact change; note tradeoffs; avoid broad refactors without scope.",
  operator_workflow:
    "MODE operator_workflow: Multi-phase work — sequence dependencies and handoffs; keep each step small, checkable, and scoped."
};

function beastLevelDirective(level: string): string {
  switch (level) {
    case "Passive":
      return "Stance: minimal branching; tight answers unless depth is requested.";
    case "Smart":
      return "Stance: balanced structure, light anticipation, no invented access.";
    case "Advanced":
      return "Stance: deeper synthesis allowed; still auditable, no fabricated telemetry.";
    case "Beast":
      return "Stance: maximum depth for this deployment; explicit assumptions; no vault fabrication.";
    default:
      return "Stance: balanced.";
  }
}

const SAFETY_GROUNDING_LINE =
  "When facts are missing, state uncertainty plainly — do not fill gaps with confident guesses.";

/**
 * Expanded MALV base body without repeating the short system-role header/identity overlap —
 * used when composing a single local `system` message (OpenAI-compatible).
 */
const MALV_LOCAL_SYSTEM_BASE_SUPPLEMENT = `${MALV_CORE_PERSONA_BODY}\n\n${MALV_STYLE_GUARDRAILS_BLOCK}`;

/** Phase 3 — applied on relevant turns so software/security help defaults to safe patterns. */
const SECURITY_SOFTWARE_ASSISTANCE_BLOCK = `Security & implementation hygiene (when helping with code, APIs, auth, infra, or integrations):
- Prefer least privilege, explicit validation at boundaries, and safe handling of secrets (never echo real tokens; use env references).
- Call out authn/authz gaps, injection risks, and unsafe defaults; suggest verification steps (tests, checks) appropriate to scope.
- Do not instruct bypassing organizational policy; frame workarounds as temporary with escalation where needed.`;

/** Blueprint §3 — when the user message lists attachments (from the composer), reinforce file/PDF/image reasoning. */
const MULTIMODAL_ATTACHMENT_GUIDANCE = `Multimodal attachments: The user listed files in their message. Infer purpose and risks from names/types only; do not invent unseen contents. For code/config/logs, point out likely defects and verification steps. For images/PDFs/video references, structure answers and note what you would need to see next.`;
const VIDEO_ANALYSIS_GUIDANCE = `Video analysis mode: prioritize temporal reasoning over generic chat. Explain what is happening segment-by-segment, separate evidence from inference, and call out likely UI/flow defects (missing states, broken transitions, unclear user actions). End with actionable checks/fixes.`;

export function buildStandardReasoningTrace(mode: ModeType): string {
  return `Internal trace (follow; user may see a short summary if helpful)
Intent: ${mode}
Plan:
1. Use session context and constraints.
2. Answer in the smallest accurate structure for this mode.
3. If evidence is missing, say what to collect next.`;
}

/**
 * Single prompt with explicit section labels — maps to logical [system] base / mode / context / [user] message.
 */
export function buildMalvChatPrompt(args: {
  userMessage: string;
  contextBlock: string;
  beastLevel: string;
  /** Worker routing: light | beast */
  classifiedMode: string;
  modeType: ModeType;
  reasoningTrace?: string;
  superFix?: boolean;
  directiveExtra?: string;
  /** Compact tone policy lines (from malv-response-policy). */
  toneInstructionBlock?: string;
  /** No prior completed assistant turns in this thread — first real reply. */
  isFirstThreadTurn?: boolean;
  /** From analyzeUserTone — drives light overlay (casual / technical). */
  userTone?: string;
  /** Intent / strategy orchestration (optional; separate from reasoning trace to avoid duplication). */
  autonomousOrchestrationBlock?: string;
  /**
   * When set, replaces {@link autonomousOrchestrationBlock} so the worker is not asked to narrate
   * all phases in one turn — used by server-side phased orchestration.
   */
  serverPhasedOrchestrationNotice?: string;
  /**
   * Security / implementation hygiene block — keep on for coding, infra, and change-oriented turns.
   * Casual companion chat omits this to save tokens; identity and safety grounding stay on.
   */
  attachSecuritySoftwareHygiene?: boolean;
  /**
   * `economy` uses a shorter system base (identity + contract) for Tier-1 chat; `standard` keeps full persona depth.
   * Deliberate / execution tiers should use `standard` or heavier overlays from other sections.
   */
  promptEffort?: "standard" | "economy";
  /** Phase 4 — one-line behavioral hint from adaptive learning (no user content). */
  adaptiveStyleHint?: string | null;
  /** Universal capability routing — tells the worker which answer shape and grounding posture to use. */
  capabilityRoutingBlock?: string;
  /**
   * Optional override for intent-first answer sizing (yes_no / factual / exploratory / deep_analysis).
   * When omitted, derived from {@link args.userMessage}.
   */
  questionAnswerShape?: MalvQuestionAnswerShape;
  /** Internal deterministic plan computed after decision and before generation. */
  responsePlanBlock?: string;
}): string {
  const modeLine = MODE_INSTRUCTIONS[args.modeType] ?? MODE_INSTRUCTIONS.analyze;
  const questionAnswerShape = args.questionAnswerShape ?? classifyMalvQuestionAnswerShape(args.userMessage);
  const multiIntentSection = buildMalvMultiIntentCompactAnswerPromptSection(analyzeMalvMultiIntent(args.userMessage));
  const intentFirstAnswerSection = [buildMalvIntentFirstAnswerShapePromptSection(questionAnswerShape), multiIntentSection]
    .filter((x): x is string => Boolean(x && x.trim().length > 0))
    .join("\n\n");
  const capabilityRoutingSection =
    args.capabilityRoutingBlock && args.capabilityRoutingBlock.trim().length > 0
      ? `### Universal capability routing\n${args.capabilityRoutingBlock.trim()}\n\n`
      : "";
  const responsePlanSection =
    args.responsePlanBlock && args.responsePlanBlock.trim().length > 0
      ? `${args.responsePlanBlock.trim()}\n\n`
      : "";

  const autonomousOrchestrationSection = args.serverPhasedOrchestrationNotice?.trim()
    ? `### Server phased orchestration\n${args.serverPhasedOrchestrationNotice.trim()}\n\n`
    : args.autonomousOrchestrationBlock && args.autonomousOrchestrationBlock.trim().length > 0
      ? `### Autonomous orchestration directives\n${args.autonomousOrchestrationBlock.trim()}\n\n`
      : "";

  const reasoningSection =
    args.reasoningTrace && args.reasoningTrace.trim().length > 0
      ? `### Internal reasoning trace\n${args.reasoningTrace.trim()}\n`
      : "";

  const superFixHeader = args.superFix
    ? `### Super Fix protocol\nStudy the problem, confirm assumptions, present a structured plan before destructive action. Never claim sandbox or repo results not in context.\n`
    : "";

  const extra = args.directiveExtra?.trim()
    ? `### Session directive (admin-approved)\n${args.directiveExtra.trim()}\n`
    : "";

  const toneBlock =
    args.toneInstructionBlock && args.toneInstructionBlock.trim().length > 0
      ? `${args.toneInstructionBlock.trim()}\n`
      : "";

  const adaptiveBlock =
    args.adaptiveStyleHint && args.adaptiveStyleHint.trim().length > 0
      ? `${args.adaptiveStyleHint.trim()}\n`
      : "";

  const contextOverlays = buildMalvPromptContextOverlays({
    isFirstThreadTurn: Boolean(args.isFirstThreadTurn),
    modeType: args.modeType,
    userTone: args.userTone
  });
  const overlaySection = contextOverlays.trim().length > 0 ? `\n\n${contextOverlays}\n` : "";

  const hasAttachmentManifest =
    args.userMessage.includes("The user attached the following") &&
    args.userMessage.includes("reference names and types");
  const multimodalBlock = hasAttachmentManifest ? `\n${MULTIMODAL_ATTACHMENT_GUIDANCE}\n` : "";
  const videoAnalysisMode =
    args.userMessage.includes("[VIDEO_ANALYSIS_CONTEXT]") || /\bvideo analysis mode request\b/i.test(args.userMessage);
  const videoModeBlock = videoAnalysisMode ? `\n${VIDEO_ANALYSIS_GUIDANCE}\n` : "";

  const attachSecurity = args.attachSecuritySoftwareHygiene !== false;
  const securityBlock = attachSecurity ? SECURITY_SOFTWARE_ASSISTANCE_BLOCK : "";

  const promptEffort = args.promptEffort ?? "standard";
  const systemPersonaBody = promptEffort === "economy" ? MALV_ECONOMY_SYSTEM_PROMPT_BODY : MALV_CORE_SYSTEM_PROMPT;

  const systemBase = `### [system] MALV base\n${systemPersonaBody}\n${SAFETY_GROUNDING_LINE}\n${securityBlock}${multimodalBlock}${videoModeBlock}${overlaySection}`;
  const systemMode = `### [system] Mode\n${modeLine}\nCompute routing: ${args.classifiedMode}. Beast level: ${args.beastLevel}.\n${beastLevelDirective(args.beastLevel)}\nIf MODE depth conflicts with the **intent-first** section below, keep MODE’s reasoning discipline but still **lead with the user’s answer** in sentence one when that is possible.\n${toneBlock}${adaptiveBlock}`;
  const systemExtra = `${superFixHeader}${extra}`;

  const contextSection = args.contextBlock.trim()
    ? `### [system] Context summary\n${args.contextBlock.trim()}`
    : `### [system] Context summary\n(no additional structured context)`;

  const userSection = `### [user] Message\n${args.userMessage}`;

  const headerParts = [systemBase, systemMode, systemExtra].filter((p) => p.trim().length > 0);

  const body = `${intentFirstAnswerSection}\n\n${responsePlanSection}${capabilityRoutingSection}${autonomousOrchestrationSection}${reasoningSection}${contextSection}\n\n${userSection}`;

  return `${headerParts.join("\n\n")}\n\n${body}\n\n### Your reply (MALV)\nOne discipline: the first sentence answers what they asked when possible. Headings only when they clearly help (e.g. deep_analysis or fix-mode steps). No filler intros or unrelated sections.`;
}

function _charsBetween(prompt: string, startMarker: string, endMarker: string): number {
  const i = prompt.indexOf(startMarker);
  if (i < 0) return 0;
  const from = i + startMarker.length;
  const j = prompt.indexOf(endMarker, from);
  if (j < 0) return 0;
  return prompt.slice(from, j).trim().length;
}

/**
 * Split the single-string MALV chat prompt into OpenAI-style system + final user turn.
 * Used by the API-side local OpenAI-compatible provider while preserving the same instructions
 * the beast-worker prompt path receives.
 */
export type SplitMalvChatPromptOptions = {
  /**
   * Replace the expanded `### [system] MALV base` section with persona+guardrails only, then prefix
   * `systemRolePrompt` — avoids repeating the same identity header twice in one system blob.
   */
  dedupeOverlappingSystemRole?: boolean;
};

export function splitMalvChatPromptForOpenAiCompatibleChat(
  prompt: string,
  systemRolePrompt: string,
  options?: SplitMalvChatPromptOptions
): { systemInstructions: string; finalUserContent: string } {
  const userMarker = "### [user] Message\n";
  const replyMarker = "\n\n### Your reply (MALV)\n";
  const ui = prompt.indexOf(userMarker);
  if (ui < 0) {
    return {
      systemInstructions: systemRolePrompt.trim(),
      finalUserContent: prompt.trim()
    };
  }
  let beforeUser = prompt.slice(0, ui).trim();
  const afterUserStart = ui + userMarker.length;
  const ri = prompt.indexOf(replyMarker, afterUserStart);
  const userBody = (ri < 0 ? prompt.slice(afterUserStart) : prompt.slice(afterUserStart, ri)).trim();

  if (options?.dedupeOverlappingSystemRole && beforeUser.includes("### [system] MALV base")) {
    beforeUser = beforeUser.replace(
      /### \[system\] MALV base\n[\s\S]*?(?=\n### \[system\] Mode\n)/,
      `### [system] MALV base\n${MALV_LOCAL_SYSTEM_BASE_SUPPLEMENT}\n`
    );
  }

  return {
    systemInstructions: `${systemRolePrompt.trim()}\n\n${beforeUser}`.trim(),
    finalUserContent: userBody
  };
}

/** Log-friendly summary of the expanded prompt (sections the live chat path sends to the worker). */
export function summarizeMalvPromptStructure(prompt: string): {
  hasMalvBaseSection: boolean;
  hasModeSection: boolean;
  hasContextSection: boolean;
  hasUserMessageSection: boolean;
  malvBaseChars: number;
  userMessageChars: number;
  promptTotalChars: number;
} {
  const userM = prompt.match(/### \[user\] Message\n([\s\S]*?)(?=\n\n### Your reply|$)/);
  return {
    hasMalvBaseSection: /### \[system\] MALV base/.test(prompt),
    hasModeSection: /### \[system\] Mode/.test(prompt),
    hasContextSection: /### \[system\] Context summary/.test(prompt),
    hasUserMessageSection: /### \[user\] Message/.test(prompt),
    malvBaseChars: _charsBetween(prompt, "### [system] MALV base\n", "\n### [system] Mode"),
    userMessageChars: userM ? userM[1].trim().length : 0,
    promptTotalChars: prompt.length
  };
}


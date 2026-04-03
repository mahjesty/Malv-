/**
 * MALV internal brain — modular sections mapped to a single worker prompt string.
 */
import type { ModeType } from "./mode-router";
import {
  buildMalvCoreSystemPromptText,
  buildMalvPromptContextOverlays,
  buildMalvSystemRolePrompt,
  MALV_IDENTITY_LOCK
} from "./malv-personality";

export { classifyMalvMode, type ModeType } from "./mode-router";

/** @deprecated Use classifyMalvMode */
export { classifyMalvMode as classifyMalvBehaviorMode } from "./mode-router";

/** @deprecated Use ModeType; kept for any external imports. */
export type MalvBehaviorMode = ModeType;

export { MALV_IDENTITY_LOCK };

/** Dedicated system role for OpenAI-style `system` + `user` turns (worker context.systemPrompt). */
export const MALV_SYSTEM_ROLE_PROMPT = buildMalvSystemRolePrompt();

/** Expanded base identity + operator voice for the worker prompt body. */
export const MALV_CORE_SYSTEM_PROMPT = buildMalvCoreSystemPromptText();

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
    "MODE operator_workflow: Sequence phases, dependencies, and handoff points; keep steps auditable and scoped."
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

/** Phase 3 — applied on every operator turn so software/security help defaults to safe patterns. */
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
}): string {
  const modeLine = MODE_INSTRUCTIONS[args.modeType] ?? MODE_INSTRUCTIONS.analyze;
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
    ? `### Controlled operator directive (admin-approved)\n${args.directiveExtra.trim()}\n`
    : "";

  const toneBlock =
    args.toneInstructionBlock && args.toneInstructionBlock.trim().length > 0
      ? `${args.toneInstructionBlock.trim()}\n`
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

  const systemBase = `### [system] MALV base\n${MALV_CORE_SYSTEM_PROMPT}\n${SAFETY_GROUNDING_LINE}\n${SECURITY_SOFTWARE_ASSISTANCE_BLOCK}${multimodalBlock}${videoModeBlock}${overlaySection}`;
  const systemMode = `### [system] Mode\n${modeLine}\nCompute routing: ${args.classifiedMode}. Beast level: ${args.beastLevel}.\n${beastLevelDirective(args.beastLevel)}\n${toneBlock}`;
  const systemExtra = `${superFixHeader}${extra}`;

  const contextSection = args.contextBlock.trim()
    ? `### [system] Context summary\n${args.contextBlock.trim()}`
    : `### [system] Context summary\n(no additional structured context)`;

  const userSection = `### [user] Message\n${args.userMessage}`;

  const headerParts = [systemBase, systemMode, systemExtra].filter((p) => p.trim().length > 0);

  const body = `${autonomousOrchestrationSection}${reasoningSection}${contextSection}\n\n${userSection}`;

  return `${headerParts.join("\n\n")}\n\n${body}\n\n### Your reply (MALV operator)\nUse sections only when they help. For fixes, prefer numbered steps.`;
}

function _charsBetween(prompt: string, startMarker: string, endMarker: string): number {
  const i = prompt.indexOf(startMarker);
  if (i < 0) return 0;
  const from = i + startMarker.length;
  const j = prompt.indexOf(endMarker, from);
  if (j < 0) return 0;
  return prompt.slice(from, j).trim().length;
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


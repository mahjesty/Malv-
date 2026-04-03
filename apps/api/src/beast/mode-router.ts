import type { MalvInputMetadata } from "./chat-context-assembly.service";

/**
 * How MALV should treat this turn before generation (routing + prompt stance).
 * Distinct from worker compute mode (light | beast).
 */
export type ModeType = "explain" | "analyze" | "fix" | "execute" | "improve" | "operator_workflow";

const MODE_ORDER: ModeType[] = [
  "operator_workflow",
  "improve",
  "fix",
  "execute",
  "explain",
  "analyze"
];

/**
 * Deterministic intent routing. Lightweight: keyword / pattern scoring, no fake LLM calls.
 */
export function classifyMalvMode(userMessage: string, inputMeta?: MalvInputMetadata | null): ModeType {
  const m = userMessage.toLowerCase().trim();
  const scores: Record<ModeType, number> = {
    explain: 0,
    analyze: 0,
    fix: 0,
    execute: 0,
    improve: 0,
    operator_workflow: 0
  };

  if (inputMeta?.operatorPhase && String(inputMeta.operatorPhase).trim()) {
    scores.operator_workflow += 4;
  }
  if (inputMeta?.inputMode && inputMeta.inputMode !== "text") {
    scores.operator_workflow += 1;
  }
  if (inputMeta?.inputMode === "video") {
    scores.analyze += 2;
    if (/\b(wrong|issue|problem|broken|fix|bug|abnormal)\b/.test(m)) scores.fix += 3;
  }

  if (/\b(workflow|pipeline|runbook|orchestrat|multi[- ]?step|playbook)\b/.test(m)) scores.operator_workflow += 3;
  if (/\boperator\b/.test(m) && m.length < 400) scores.operator_workflow += 1;

  if (/\b(improve|refactor|optimi[sz]e|cleaner|clean up|performance|readability)\b/.test(m)) scores.improve += 3;
  if (/\b(bug|error|broken|fix|patch|fails?|stack trace|exception)\b/.test(m)) scores.fix += 3;
  if (/\b(run|execute|deploy|apply|kubectl |npm |pnpm |yarn |curl |docker )\b/.test(m)) scores.execute += 2;
  if (/\b(why|explain|what does|how does|describe|define)\b/.test(m)) scores.explain += 2;
  if (/\b(analyze|compare|tradeoff|review|audit|assess|evaluate)\b/.test(m)) scores.analyze += 2;
  if (/\b(explain this video|summari[sz]e steps|identify problems|find what is wrong|video analysis mode)\b/.test(m)) {
    scores.analyze += 3;
    scores.fix += 1;
  }

  if (m.length > 400 && /\b(plan|steps|first then|sequence)\b/.test(m)) scores.operator_workflow += 2;

  let best: ModeType = "analyze";
  let bestScore = -1;
  for (const mode of MODE_ORDER) {
    const s = scores[mode];
    if (s > bestScore) {
      bestScore = s;
      best = mode;
    }
  }
  if (bestScore <= 0) {
    if (/\?/.test(userMessage) && m.length < 200) return "explain";
    return "analyze";
  }
  return best;
}

import type { BuildUnitEntity } from "../db/entities/build-unit.entity";

export type BuildUnitExecutionStep = { order: number; label: string; detail?: string };

export type BuildUnitExecutionProfile = {
  requiresInput: boolean;
  steps: BuildUnitExecutionStep[];
  estimatedComplexity: "low" | "medium" | "high";
};

const INPUT_HINTS = /\b(user|input|configure|custom|provide|upload|api key|secret|token|env)\b/i;
const PLACEHOLDER_HINTS = /\b(TODO|FIXME|YOUR_|PLACEHOLDER|\{\{|\$\{)/;

function scoreContentSize(unit: BuildUnitEntity): number {
  const p = unit.prompt?.length ?? 0;
  const c = unit.codeSnippet?.length ?? 0;
  const d = unit.description?.length ?? 0;
  return p + c + d;
}

function inferStepsFromPrompt(prompt: string | null, type: string): BuildUnitExecutionStep[] {
  if (!prompt?.trim()) {
    return [
      { order: 1, label: "Review unit", detail: "Read description and metadata." },
      { order: 2, label: "Execute in MALV", detail: "Send to task or open in Studio." }
    ];
  }
  const lines = prompt
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter((l) => l.length > 8 && l.length < 400);
  const picks = lines.slice(0, 8);
  if (picks.length >= 2) {
    return picks.map((label, i) => ({ order: i + 1, label: label.slice(0, 160) }));
  }
  const sentences = prompt.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 12);
  if (sentences.length >= 2) {
    return sentences.slice(0, 6).map((s, i) => ({ order: i + 1, label: s.trim().slice(0, 160) }));
  }
  return [
    { order: 1, label: "Understand goal", detail: prompt.slice(0, 200) },
    { order: 2, label: "Implement", detail: `Primary work for type: ${type}` },
    { order: 3, label: "Verify", detail: "Test and refine outputs." }
  ];
}

/**
 * Derives a stable execution profile from unit fields (no LLM).
 */
export function computeExecutionProfile(unit: BuildUnitEntity): BuildUnitExecutionProfile {
  const requiresInput =
    INPUT_HINTS.test(unit.prompt ?? "") ||
    INPUT_HINTS.test(unit.description ?? "") ||
    PLACEHOLDER_HINTS.test(unit.codeSnippet ?? "");

  const steps = inferStepsFromPrompt(unit.prompt, unit.type);

  const size = scoreContentSize(unit);
  let estimatedComplexity: "low" | "medium" | "high" = "low";
  if (size > 4_000 || (unit.codeSnippet?.length ?? 0) > 2_000) estimatedComplexity = "high";
  else if (size > 1_200 || steps.length > 4) estimatedComplexity = "medium";

  return { requiresInput, steps, estimatedComplexity };
}

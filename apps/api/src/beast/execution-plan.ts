import type { ModeType } from "./mode-router";

export type ExecutionPlan = {
  goal: string;
  steps: string[];
  risks: string[];
  expectedOutcome: string;
};

/**
 * Whether this turn should carry an internal execution plan (actionable / change-oriented).
 */
export function shouldAttachExecutionPlan(mode: ModeType, userMessage: string): boolean {
  const m = userMessage.toLowerCase();
  if (mode === "execute" || mode === "fix" || mode === "operator_workflow" || mode === "improve") return true;
  if (/\b(run|deploy|patch|change|edit|implement|migrate|refactor)\b/.test(m)) return true;
  return false;
}

export function buildExecutionPlan(args: { userMessage: string; mode: ModeType }): ExecutionPlan {
  const preview = args.userMessage.replace(/\s+/g, " ").trim().slice(0, 280);
  const steps: string[] = [
    "Confirm constraints and environment (what is in context vs unknown).",
    "List the smallest verifiable next action.",
    "Execute or describe checks; avoid claiming results not in context."
  ];
  if (args.mode === "fix") {
    steps.unshift("Reproduce or capture the failure signal (error text, exit code, log line).");
  }
  if (args.mode === "operator_workflow") {
    steps.unshift("Name the workflow goal and entry/exit criteria.");
  }
  return {
    goal: preview || "Address the user's request with auditable steps.",
    steps,
    risks: [
      "Acting without confirming workspace/sandbox scope may affect the wrong target.",
      "Inferring file or command output that is not in context leads to false confidence."
    ],
    expectedOutcome: "A clear next step the user can verify on their stack, or explicit gaps if context is insufficient."
  };
}

export function formatExecutionPlanForTrace(plan: ExecutionPlan): string {
  return [
    `Goal: ${plan.goal}`,
    "Steps:",
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
    "Risks:",
    ...plan.risks.map((r) => `- ${r}`),
    `Expected outcome: ${plan.expectedOutcome}`
  ].join("\n");
}

/**
 * Deterministic Super Fix scaffolding — pairs with LLM reply and optional sandbox execution.
 * No autonomous code changes; plans are auditable strings.
 */

export type SuperFixPlan = {
  classification: string;
  analysisPoints: string[];
  planSteps: string[];
  executionNotes: string;
  readOnlyTypedActions: Array<{
    actionType: "list_directory" | "search_repo" | "get_git_status" | "get_git_diff" | "inspect_logs";
    parameters: Record<string, unknown>;
    scopeType?: "workspace" | "repo";
  }>;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_\-./\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function buildSuperFixPlan(userMessage: string): SuperFixPlan {
  const msg = userMessage.trim();
  const tokens = tokenize(msg);

  const classification = tokens.has("bug") || tokens.has("error") || tokens.has("broken") ? "defect_or_runtime_error" : "change_or_clarification_request";

  const analysisPoints: string[] = [
    "Confirm the reported symptom and scope (which subsystem, which environment).",
    "Separate facts from hypotheses; list unknowns explicitly."
  ];
  if (classification === "defect_or_runtime_error") {
    analysisPoints.unshift("Capture repro steps, expected vs actual, and recent changes.");
  }

  const planSteps: string[] = [
    "Inspect repository state and recent diffs (read-only).",
    "Locate relevant files or modules via targeted search.",
    "Form a minimal fix hypothesis and validate with tests or logs.",
    "If a code change is needed, stage it in sandbox and produce a patch proposal — never silent writes."
  ];

  const q = msg.length > 200 ? msg.slice(0, 120).replace(/\s+/g, " ") : msg.replace(/\s+/g, " ");
  const searchQuery = [...tokens].slice(0, 12).join("|") || "TODO|FIXME|error";

  const readOnlyTypedActions: SuperFixPlan["readOnlyTypedActions"] = [
    { actionType: "get_git_status", parameters: {}, scopeType: "repo" },
    { actionType: "search_repo", parameters: { query: searchQuery, limit: 120 }, scopeType: "repo" }
  ];

  if (classification === "defect_or_runtime_error") {
    readOnlyTypedActions.push({
      actionType: "inspect_logs",
      parameters: { pattern: "error|exception|traceback|panic", limit: 40 },
      scopeType: "repo"
    });
  }

  return {
    classification,
    analysisPoints,
    planSteps,
    executionNotes: `Search focus: ${searchQuery.slice(0, 200)}; query=${q.slice(0, 80)}`,
    readOnlyTypedActions
  };
}

export function buildSuperFixReasoningTrace(plan: SuperFixPlan): string {
  return `Intent: super_fix remediation path.
Classification: ${plan.classification}
Analysis checklist:
${plan.analysisPoints.map((x) => `- ${x}`).join("\n")}
Plan:
${plan.planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Execution notes: ${plan.executionNotes}`;
}

export function detectSuperFixIntent(message: string, inputMeta?: { superFix?: boolean } | null): boolean {
  if (inputMeta?.superFix) return true;
  const m = message.toLowerCase();
  return (
    /\bsuper\s*fix\b/.test(m) ||
    /\bdeep\s*fix\b/.test(m) ||
    /\bmalv\s*superfix\b/.test(m) ||
    (m.includes("fix") && m.includes("properly") && m.length < 400)
  );
}

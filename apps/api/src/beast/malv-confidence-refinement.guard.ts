import type { MalvRichResponse } from "./malv-rich-response.types";
import type { MalvUniversalCapabilityRoute } from "./malv-universal-capability-router.util";
import type { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";
import { assessMalvResponseReliability } from "./malv-response-reliability.util";

function countImagesRich(r: MalvRichResponse | null | undefined): number {
  if (!r?.images?.length) return 0;
  return r.images.filter((im) => typeof im.url === "string" && im.url.trim().length > 0).length;
}

function hasFinanceSnapshotPayload(rich: MalvRichResponse | null): boolean {
  if (!rich?.data || typeof rich.data !== "object") return false;
  const d = rich.data as { kind?: string; finance?: { kind?: string } };
  return d.kind === "malv_finance_snapshot" || d.finance?.kind === "malv_finance_snapshot";
}

/**
 * Refinement appends new model-generated sentences — unsafe when grounding is weak or verifier demand is high.
 * No extra “judge” model: conservative pre-assessment using the same deterministic reliability signals.
 */
export function malvConfidenceRefinementShouldBlock(args: {
  userText: string;
  declaredRoute: MalvUniversalCapabilityRoute;
  execution: MalvUniversalCapabilityExecutionResult;
}): { blocked: boolean; detail: string } {
  const rich = args.execution.rich && typeof args.execution.rich === "object" ? args.execution.rich : null;
  const structuredSourceCount = rich?.sources?.length ?? 0;
  const structuredImageCount = countImagesRich(rich);
  const a = assessMalvResponseReliability({
    userText: args.userText,
    declaredRoute: args.declaredRoute,
    execution: args.execution,
    structuredSourceCount,
    structuredImageCount,
    rich,
    priorUserText: null,
    priorAssistantSnippet: null
  });
  if (hasFinanceSnapshotPayload(rich) && args.execution.ok && !args.execution.skipped) {
    return { blocked: false, detail: "finance_snapshot" };
  }
  if (a.tier === "ungrounded" || a.tier === "weakly_grounded") {
    return { blocked: true, detail: `tier=${a.tier}` };
  }
  if (a.tier === "partially_grounded" && a.verifierDemandScore >= 0.5) {
    return { blocked: true, detail: `partial_verifier=${a.verifierDemandScore.toFixed(2)}` };
  }
  return { blocked: false, detail: "ok" };
}

import { ConflictPolicyService } from "./conflict-policy.service";
import { ResponsePolicyService } from "./response-policy.service";
import type { MetaRouterInput } from "./meta-intelligence.types";

// Backward-compatible helper for older call sites.
export function applyConflictPolicy(input: MetaRouterInput) {
  const conflictDecisions = new ConflictPolicyService().resolve(input);
  const finalResponsePolicy = new ResponsePolicyService().derive(input, conflictDecisions);
  return { conflictDecisions, finalResponsePolicy };
}

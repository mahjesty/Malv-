/**
 * Clarification loop helpers — broad/delegating detection lives in
 * {@link ./malv-broad-request-resolution.util}.
 */

export {
  isBroadButAnswerableUserRequest,
  isUserDelegatingTopicChoice,
  shouldTreatClarificationReliefAsUnsafe
} from "./malv-broad-request-resolution.util";

export type { MalvPriorChatTurn } from "./malv-broad-request-resolution.util";

import {
  isBroadButAnswerableUserRequest,
  isUserDelegatingTopicChoice,
  shouldTreatClarificationReliefAsUnsafe
} from "./malv-broad-request-resolution.util";
import type { MalvPriorChatTurn } from "./malv-broad-request-resolution.util";
import { resolveBroadPromptExecutionPolicy } from "./malv-broad-request-resolution.util";

/**
 * Heuristic: last assistant turn was our deterministic clarification / dual-intent ask.
 */
export function lastAssistantTurnLooksLikeMalvClarificationRequest(priorMessages: MalvPriorChatTurn[]): boolean {
  const last = [...priorMessages].reverse().find((x) => x.role === "assistant");
  const raw = last?.content ?? "";
  const c = raw.toLowerCase();
  if (!c.trim()) return false;
  if (
    /\b(one\s+concrete\s+(detail|anchor)|full\s+pipeline|which\s+(matches|direction)|what\s+exactly\s+should\s+change|what\s+outcome\s+do\s+you\s+want|main\s+goal\s*\(build,\s*fix|equally\s+likely)\b/i.test(
      c
    )
  ) {
    return true;
  }
  if (/\?\s*$/m.test(raw.trim()) && /\b(which|what\s+exactly|clarify|do\s+you\s+mean)\b/.test(c)) {
    return true;
  }
  return false;
}

/**
 * After a clarification ask, permissive or still-broad replies should not re-enter clarification.
 */
export function shouldSuppressClarificationAfterPriorClarify(
  userMessage: string,
  priorMessages: MalvPriorChatTurn[]
): boolean {
  const t = userMessage.trim();
  if (!t || shouldTreatClarificationReliefAsUnsafe(t)) return false;
  if (!lastAssistantTurnLooksLikeMalvClarificationRequest(priorMessages)) return false;

  if (isUserDelegatingTopicChoice(t) || isBroadButAnswerableUserRequest(t)) return true;

  const policy = resolveBroadPromptExecutionPolicy({
    userMessage: t,
    context: { priorMessages },
    userReplyFollowsAssistantClarification: true
  });
  return policy.action === "proceed";
}

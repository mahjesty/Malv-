import {
  assertMalvAssistantIdentityGate,
  finalizeAssistantOutput,
  finalizeAssistantOutputForStreamedReply
} from "./malv-finalize-assistant-output.util";

/**
 * ## Canonical visible-answer contract (normal chat)
 *
 * **STREAM = FINAL TRAJECTORY**
 *
 * The text the user reads while streaming is already on the canonical path.
 * The completed reply is the finished version of what the user watched stream — never a
 * separately-assembled body that replaces what was shown.
 *
 * ### When `sawLiveStreamTokens` is true
 *
 * Canonical text = `finalizeAssistantOutputForStreamedReply(streamAccumulatedRaw)`.
 *
 * This function applies every **safe** cleanup pass (identity sentence strips, tutorial phrase
 * strips, trailing-closer strips, whitespace normalization) without ever performing a
 * full-body policy-line replacement or removing opening text the user already saw.
 * The result is `source: "stream_canonical"`.
 *
 * The orchestrator delivery pipeline (`finalizeWorkerReplyForDelivery` → rich-compose →
 * reliability → shaping layer) continues to run with `hadLiveStreamTokens = true` guards
 * so its appends (suggestion block, local disclaimer) can optionally extend the canonical
 * text, but its reply **does not override** the stream accumulation as the authoritative body.
 *
 * ### When no live tokens were shown
 *
 * Canonical text = `assertMalvAssistantIdentityGate(orchestratorVisibleReply)`.
 * Source: `"orchestrator_delivery"`.
 *
 * ### Partial / error paths
 *
 * When no orchestrator reply exists and no tokens were shown: source `"stream_partial_identity"`,
 * text = `finalizeAssistantOutput(streamAccumulatedRaw)`.
 *
 * **Persistence and refresh** both use the resolved canonical text, so the message the user
 * re-reads on refresh is identical to what they watched finish streaming.
 */
export type MalvCanonicalVisibleAnswerSource =
  | "orchestrator_delivery"
  | "stream_canonical"
  | "stream_partial_identity"
  | "empty";

export function resolveMalvCanonicalVisibleAssistantText(args: {
  orchestratorVisibleReply: string;
  streamAccumulatedRaw: string;
  /** When true, tokens were progressively revealed during streaming — stream accumulation is canonical. */
  sawLiveStreamTokens: boolean;
}): { text: string; source: MalvCanonicalVisibleAnswerSource } {
  // CONTRACT: when live tokens were already shown, the canonical text is the safe-finalized
  // stream accumulation — the same body the user watched form, with only strip-safe passes applied.
  // The orchestrator reply must not override this with a materially different body.
  if (args.sawLiveStreamTokens) {
    const acc = String(args.streamAccumulatedRaw ?? "").trim();
    if (acc.length > 0) {
      return { text: finalizeAssistantOutputForStreamedReply(acc), source: "stream_canonical" };
    }
    // sawLiveStreamTokens=true but empty accumulation (e.g. cancelled before any text arrived):
    // fall through to orchestrator reply so assistant_done always has a finalContent.
  }

  const orch = assertMalvAssistantIdentityGate(String(args.orchestratorVisibleReply ?? "").trim());
  if (orch.length > 0) {
    return { text: orch, source: "orchestrator_delivery" };
  }
  const acc = String(args.streamAccumulatedRaw ?? "").trim();
  if (acc.length > 0) {
    return {
      text: finalizeAssistantOutput(args.streamAccumulatedRaw, {}),
      source: "stream_partial_identity"
    };
  }
  return { text: "", source: "empty" };
}

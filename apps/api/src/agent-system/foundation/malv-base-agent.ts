import type {
  MalvAgentConfidence,
  MalvAgentExecutionMode,
  MalvAgentGroundingLevel,
  MalvAgentIdentity,
  MalvAgentKind,
  MalvAgentPolicyDisposition,
  MalvAgentRequestContext,
  MalvAgentResultEnvelope,
  MalvAgentRuntimeTierPreference,
  MalvAgentTruthState,
  MalvAgentPartialStatus
} from "../contracts/malv-agent.contracts";

export type MalvAgentContract<TIn = unknown, TOut = unknown> = {
  readonly identity: MalvAgentIdentity;
  execute(ctx: MalvAgentRequestContext, input: TIn, signal?: AbortSignal): Promise<MalvAgentResultEnvelope<TOut>>;
};

export function malvAgentDefaultConfidence(score: number, rationale: string): MalvAgentConfidence {
  const s = Math.max(0, Math.min(1, score));
  return { score: s, rationale };
}

export function envelopeBase(args: {
  identity: MalvAgentIdentity;
  truthState: MalvAgentTruthState;
  grounding: MalvAgentGroundingLevel;
  confidence: MalvAgentConfidence;
  policy: MalvAgentPolicyDisposition;
  executionMode: MalvAgentExecutionMode;
  tierPreference: MalvAgentRuntimeTierPreference;
  tierUsed?: MalvAgentRuntimeTierPreference;
  partialStatus: MalvAgentPartialStatus;
  errorCode?: string;
  errorMessage?: string;
}): Pick<
  MalvAgentResultEnvelope,
  | "agentKind"
  | "identity"
  | "truthState"
  | "grounding"
  | "confidence"
  | "policy"
  | "executionMode"
  | "tierPreference"
  | "tierUsed"
  | "partialStatus"
  | "errorCode"
  | "errorMessage"
> {
  return {
    agentKind: args.identity.kind,
    identity: args.identity,
    truthState: args.truthState,
    grounding: args.grounding,
    confidence: args.confidence,
    policy: args.policy,
    executionMode: args.executionMode,
    tierPreference: args.tierPreference,
    tierUsed: args.tierUsed,
    partialStatus: args.partialStatus,
    errorCode: args.errorCode,
    errorMessage: args.errorMessage
  };
}

export function assertNotAborted(ctx: MalvAgentRequestContext) {
  if (ctx.signal?.aborted) {
    const e = new Error("aborted");
    (e as any).name = "AbortError";
    throw e;
  }
}

export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as Error & { code?: string };
  return err.name === "AbortError" || err.code === "ABORT_ERR";
}

export function agentIdentity(kind: MalvAgentKind, id: string, internalLabel: string): MalvAgentIdentity {
  return { kind, id, internalLabel };
}

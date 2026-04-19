import { Injectable, Logger } from "@nestjs/common";
import type {
  MalvAgentPlanStep,
  MalvAgentRequestContext,
  MalvAgentResultEnvelope,
  MalvAgentTelemetry,
  MalvAgentTraceSpan,
  MalvAgentKind,
  MultiAgentExecutionPlan
} from "../contracts/malv-agent.contracts";
import { MalvAgentRouteReason } from "../foundation/malv-agent-route-reason.codes";
import { isAbortError } from "../foundation/malv-base-agent";
import { MalvAgentRegistryService } from "../registry/malv-agent-registry.service";

export type MalvAgentStepInputResolver = (kind: MalvAgentKind, step: MalvAgentPlanStep) => unknown;

export type MalvAgentLifecycleResult = {
  envelopes: MalvAgentResultEnvelope[];
  merged: MalvAgentResultEnvelope<Record<string, unknown>>;
  telemetry: MalvAgentTelemetry;
  stoppedReason?: "complete" | "step_cap" | "timeout" | "cancelled" | "error";
};

@Injectable()
export class MalvAgentLifecycleService {
  private readonly logger = new Logger(MalvAgentLifecycleService.name);

  constructor(private readonly registry: MalvAgentRegistryService) {}

  /**
   * Bounded execution: segments of equal {@link MalvAgentPlanStep.parallelGroup} run in parallel;
   * `undefined` group is always sequential (one step per segment).
   */
  async executePlan(args: {
    ctx: MalvAgentRequestContext;
    plan: MultiAgentExecutionPlan;
    resolveInput: MalvAgentStepInputResolver;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<MalvAgentLifecycleResult> {
    const traceId = args.ctx.traceId;
    const spans: MalvAgentTraceSpan[] = [];
    const envelopes: MalvAgentResultEnvelope[] = [];
    const sorted = [...args.plan.steps].sort((a, b) => a.order - b.order);
    const segments = segmentSteps(sorted);
    const deadline = args.timeoutMs ? (args.ctx.nowMs ?? Date.now()) + args.timeoutMs : null;
    let stopped: MalvAgentLifecycleResult["stoppedReason"] = "complete";
    let degradation: MalvAgentTelemetry["degradation"] = "none";

    let stepCount = 0;
    try {
      outer: for (const segment of segments) {
        if (stepCount >= args.plan.maxSteps) {
          stopped = "step_cap";
          degradation = "partial_plan";
          break;
        }
        if (args.signal?.aborted) {
          stopped = "cancelled";
          degradation = "cancelled";
          break;
        }
        if (deadline && Date.now() > deadline) {
          stopped = "timeout";
          degradation = "timeout";
          break;
        }

        const parallel = segment.length > 1;
        const runOne = async (step: MalvAgentPlanStep) => {
          const agent = this.registry.get(step.agentKind);
          const started = args.ctx.nowMs ?? Date.now();
          if (!agent) {
            spans.push({
              agentKind: step.agentKind,
              startedAtMs: started,
              finishedAtMs: started,
              tierUsed: step.tierOverride ?? "any",
              status: "failed",
              reasonCode: "agent_not_registered"
            });
            return null;
          }
          const input = args.resolveInput(step.agentKind, step);
          try {
            const env = await agent.execute(args.ctx, input, args.signal);
            const finished = args.ctx.nowMs ?? Date.now();
            spans.push({
              agentKind: step.agentKind,
              startedAtMs: started,
              finishedAtMs: finished,
              tierUsed: env.tierUsed ?? step.tierOverride ?? env.tierPreference,
              status: env.partialStatus === "error" ? "failed" : env.partialStatus === "partial" ? "partial" : "ok",
              reasonCode: env.errorCode
            });
            return env;
          } catch (e) {
            const finished = args.ctx.nowMs ?? Date.now();
            const aborted = isAbortError(e);
            spans.push({
              agentKind: step.agentKind,
              startedAtMs: started,
              finishedAtMs: finished,
              tierUsed: step.tierOverride ?? "any",
              status: aborted ? "cancelled" : "failed",
              reasonCode: aborted ? "cancelled" : "execute_threw"
            });
            if (aborted) throw e;
            this.logger.warn(`agent_step_failed kind=${step.agentKind} ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        };

        const batchResults = parallel ? await Promise.all(segment.map(runOne)) : [await runOne(segment[0]!)];
        for (const r of batchResults) {
          if (r) envelopes.push(r);
          stepCount += 1;
          if (stepCount >= args.plan.maxSteps) {
            stopped = "step_cap";
            degradation = "partial_plan";
            break outer;
          }
        }
      }
    } catch (e) {
      if (isAbortError(e)) {
        stopped = "cancelled";
        degradation = "cancelled";
      } else {
        stopped = "error";
        degradation = "partial_plan";
      }
    }

    const routeReasonCodes = [
      ...(stepCount >= args.plan.maxSteps ? [MalvAgentRouteReason.STEP_CAP] : []),
      ...(stopped === "timeout" ? [MalvAgentRouteReason.TIMEOUT] : []),
      ...(stopped === "cancelled" ? [MalvAgentRouteReason.CANCELLED] : [])
    ];

    const telemetry: MalvAgentTelemetry = {
      traceId,
      spans,
      routeReasonCodes,
      degradation
    };

    return {
      envelopes,
      merged: mergeEnvelopes(envelopes, traceId),
      telemetry,
      stoppedReason: stopped
    };
  }
}

export function segmentSteps(steps: MalvAgentPlanStep[]): MalvAgentPlanStep[][] {
  const segments: MalvAgentPlanStep[][] = [];
  for (const step of steps) {
    const last = segments[segments.length - 1];
    const g = step.parallelGroup;
    if (g === undefined) {
      segments.push([step]);
      continue;
    }
    if (!last || last[0]!.parallelGroup !== g) {
      segments.push([step]);
    } else {
      last.push(step);
    }
  }
  return segments;
}

const GROUND_ORD: Record<string, number> = { none: 0, partial: 1, full: 2 };

export function mergeEnvelopes(envelopes: MalvAgentResultEnvelope[], traceId: string): MalvAgentResultEnvelope<Record<string, unknown>> {
  if (envelopes.length === 0) {
    return {
      agentKind: "fallback_recovery",
      identity: { kind: "fallback_recovery", id: "malv.agent.lifecycle_merge", internalLabel: "Lifecycle merge" },
      truthState: "advisory",
      grounding: "none",
      confidence: { score: 0.4, rationale: "no_envelopes" },
      policy: "allow_advisory",
      executionMode: "advisory",
      tierPreference: "cpu",
      partialStatus: "empty",
      payload: { merged: true, traceId, count: 0 }
    };
  }

  let minConf = 1;
  let minGround: "none" | "partial" | "full" = "full";
  let truthState = "advisory" as MalvAgentResultEnvelope["truthState"];

  for (const e of envelopes) {
    minConf = Math.min(minConf, e.confidence.score);
    if (GROUND_ORD[e.grounding]! < GROUND_ORD[minGround]!) minGround = e.grounding;
    if (e.truthState === "blocked") truthState = "blocked";
    else if (e.truthState === "needs_approval" && truthState !== "blocked") truthState = "needs_approval";
  }

  return {
    agentKind: "fallback_recovery",
    identity: { kind: "fallback_recovery", id: "malv.agent.lifecycle_merge", internalLabel: "Lifecycle merge" },
    truthState,
    grounding: minGround,
    confidence: { score: minConf, rationale: "min_confidence_merge" },
    policy: "allow_advisory",
    executionMode: "passive_analysis",
    tierPreference: "cpu",
    partialStatus: "complete",
    payload: {
      merged: true,
      traceId,
      agents: envelopes.map((e) => e.agentKind),
      summaries: envelopes.map((e) => ({
        kind: e.agentKind,
        truthState: e.truthState,
        score: e.confidence.score
      }))
    },
    advisoryForUi: {
      agentCount: envelopes.length,
      mergedTruthState: truthState,
      minConfidence: minConf
    }
  };
}

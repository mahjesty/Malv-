import { Injectable } from "@nestjs/common";
import type { MalvAgentRequestContext } from "../contracts/malv-agent.contracts";
import type { MalvTaskRouterInput } from "../router/malv-task-router.service";
import { MalvTaskRouterService } from "../router/malv-task-router.service";
import { MalvAgentLifecycleService, type MalvAgentStepInputResolver } from "../lifecycle/malv-agent-lifecycle.service";
import { createMalvDefaultStepInputResolver } from "../resolver/malv-agent-default-step-input.resolver";

/**
 * High-level entry: deterministic route + optional bounded multi-agent advisory lifecycle.
 * Execution and sandbox/CCI paths remain in their existing services.
 */
@Injectable()
export class MalvAgentOrchestratorService {
  constructor(
    private readonly taskRouter: MalvTaskRouterService,
    private readonly lifecycle: MalvAgentLifecycleService
  ) {}

  route(input: MalvTaskRouterInput) {
    return this.taskRouter.route(input);
  }

  async runAdvisoryLifecycle(args: {
    ctx: MalvAgentRequestContext;
    routerInput: MalvTaskRouterInput;
    resolveInput: MalvAgentStepInputResolver;
    timeoutMs?: number;
  }) {
    const decision = this.taskRouter.route(args.routerInput);
    const result = await this.lifecycle.executePlan({
      ctx: args.ctx,
      plan: decision.plan,
      resolveInput: args.resolveInput,
      signal: args.ctx.signal,
      timeoutMs: args.timeoutMs
    });
    return { decision, result };
  }

  /** Bounded advisory run using {@link createMalvDefaultStepInputResolver} — safe default wiring for operators/tests. */
  async runAdvisoryLifecycleWithDefaultInputs(args: {
    ctx: MalvAgentRequestContext;
    routerInput: MalvTaskRouterInput;
    timeoutMs?: number;
  }) {
    const decision = this.taskRouter.route(args.routerInput);
    const resolveInput = createMalvDefaultStepInputResolver({
      ctx: args.ctx,
      routerInput: args.routerInput,
      decision
    });
    const result = await this.lifecycle.executePlan({
      ctx: args.ctx,
      plan: decision.plan,
      resolveInput,
      signal: args.ctx.signal,
      timeoutMs: args.timeoutMs
    });
    return { decision, result };
  }
}

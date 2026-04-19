import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InferenceModule } from "../inference/inference.module";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "./malv-agent-system.providers";
import { MalvAgentRegistryService } from "./registry/malv-agent-registry.service";
import { MalvTaskRouterService } from "./router/malv-task-router.service";
import { MalvAgentLifecycleService } from "./lifecycle/malv-agent-lifecycle.service";
import { MalvAgentRuntimeTierBridgeService } from "./tier/malv-agent-runtime-tier-bridge.service";
import { MalvAgentOrchestratorService } from "./orchestrator/malv-agent-orchestrator.service";

/**
 * MALV internal agent foundation + task router + lifecycle (CPU/GPU-aware, policy-aligned).
 * Imported by Beast, workspace, explore-image, voice — does not import those modules (avoids cycles).
 */
@Module({
  imports: [ConfigModule, forwardRef(() => InferenceModule)],
  providers: [
    ...MALV_ALL_REGISTERED_AGENT_PROVIDERS,
    MalvAgentRegistryService,
    MalvTaskRouterService,
    MalvAgentLifecycleService,
    MalvAgentRuntimeTierBridgeService,
    MalvAgentOrchestratorService
  ],
  exports: [
    MalvAgentRegistryService,
    MalvTaskRouterService,
    MalvAgentLifecycleService,
    MalvAgentRuntimeTierBridgeService,
    MalvAgentOrchestratorService
  ]
})
export class AgentSystemModule {}

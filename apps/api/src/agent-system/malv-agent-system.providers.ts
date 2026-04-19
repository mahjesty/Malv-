import { MALV_CORE_AGENT_PROVIDERS } from "./agents/malv-core-agents.services";
import { MALV_STAGE2_BUILD_AGENT_PROVIDERS } from "./agents/malv-stage2-build-agents.services";
import { MALV_STAGE1_RUNTIME_AGENT_PROVIDERS } from "./agents/malv-stage1-runtime-agents.services";

/** Single registration order: Stage 1 runtime → Stage 2 build/design → historical core agents. */
export const MALV_ALL_REGISTERED_AGENT_PROVIDERS = [
  ...MALV_STAGE1_RUNTIME_AGENT_PROVIDERS,
  ...MALV_STAGE2_BUILD_AGENT_PROVIDERS,
  ...MALV_CORE_AGENT_PROVIDERS
] as const;

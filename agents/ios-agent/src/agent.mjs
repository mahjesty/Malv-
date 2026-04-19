import { startMalvExecutionAgent } from "../../shared/malv-execution-agent-core.mjs";

const apiOrigin = process.env.MALV_API_ORIGIN ?? "";
const jwt = process.env.MALV_AGENT_JWT ?? "";

await startMalvExecutionAgent({
  agentType: "mobile",
  executorChannel: "mobile",
  platform: "ios",
  apiOrigin,
  jwt,
  openUrlInBrowser: async (url) => {
    // This module is a backend contract scaffold for native iOS integration.
    // It intentionally avoids claiming native execution privileges.
    // eslint-disable-next-line no-console
    console.log(`[malv-agent:ios][open_url] pending native handoff`, url);
    return { ok: true, simulated: true };
  }
});


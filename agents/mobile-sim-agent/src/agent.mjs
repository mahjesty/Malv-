import { startMalvExecutionAgent } from "../../shared/malv-execution-agent-core.mjs";

const apiOrigin = process.env.MALV_API_ORIGIN ?? "";
const jwt = process.env.MALV_AGENT_JWT ?? "";

await startMalvExecutionAgent({
  agentType: "mobile",
  executorChannel: "mobile",
  platform: "android",
  apiOrigin,
  jwt,
  openUrlInBrowser: async (url) => {
    // eslint-disable-next-line no-console
    console.log(`[malv-agent:mobile][open_url] SIMULATED open`, url);
    return { ok: true, simulated: true };
  }
});

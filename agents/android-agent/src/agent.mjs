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
    // This module is a backend contract scaffold for native Android integration.
    // It intentionally does not fake OS-level launching here.
    // eslint-disable-next-line no-console
    console.log(`[malv-agent:android][open_url] pending native handoff`, url);
    return { ok: true, simulated: true };
  }
});


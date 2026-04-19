import open from "open";
import { startMalvExecutionAgent } from "../../shared/malv-execution-agent-core.mjs";

const apiOrigin = process.env.MALV_API_ORIGIN ?? "";
const jwt = process.env.MALV_AGENT_JWT ?? "";

await startMalvExecutionAgent({
  agentType: "desktop",
  executorChannel: "desktop",
  platform: "desktop",
  apiOrigin,
  jwt,
  openUrlInBrowser: async (url) => {
    try {
      await open(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
});

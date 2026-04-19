import { MalvOperatorFallbackBrainService } from "./malv-operator-fallback-brain.service";
import { MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE } from "./malv-chat-agent-unavailable.constants";

describe("MalvOperatorFallbackBrainService", () => {
  const svc = new MalvOperatorFallbackBrainService();

  it("returns a single professional user notice without infra or provider text", () => {
    const out = svc.synthesize({
      userMessage: "hi",
      classifiedMode: "light",
      workerError: '{"error":{"type":"not_found_error"}} HTTP 404 http://127.0.0.1:8081/v1/infer',
      correlationId: "run-test-1"
    });
    expect(out.reply).toBe(MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE);
    expect(out.reply).not.toMatch(/404|not_found|8081|BEAST_WORKER|infer/);
    expect(out.meta?.malvReplySource).toBe("api_operator_fallback_brain");
    expect(out.meta?.malvAgentUnavailableNotice).toBe(true);
    expect(out.meta).not.toHaveProperty("workerError");
  });
});

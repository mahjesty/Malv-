import { malvChatTurnBackendSelection } from "./malv-chat-turn-backend.util";

describe("malvChatTurnBackendSelection", () => {
  it("selects direct_local_inference for local OpenAI-compatible completion meta", () => {
    expect(malvChatTurnBackendSelection(false, "local_openai_compatible")).toBe("direct_local_inference");
  });

  it("selects beast_worker for normal worker replies", () => {
    expect(malvChatTurnBackendSelection(false, "beast_worker_phased")).toBe("beast_worker");
    expect(malvChatTurnBackendSelection(false, undefined)).toBe("beast_worker");
  });

  it("selects fallback_api when operator fallback was used", () => {
    expect(malvChatTurnBackendSelection(true, "beast_worker_phased")).toBe("fallback_api");
    expect(malvChatTurnBackendSelection(true, "api_operator_fallback_brain")).toBe("fallback_api");
  });

  it("selects non_inferencing for template short-circuits", () => {
    expect(malvChatTurnBackendSelection(false, "malv_greeting_short_circuit")).toBe("non_inferencing");
    expect(malvChatTurnBackendSelection(false, "malv_identity_short_circuit")).toBe("non_inferencing");
    expect(malvChatTurnBackendSelection(false, "malv_casual_small_talk_short_circuit")).toBe("non_inferencing");
  });
});

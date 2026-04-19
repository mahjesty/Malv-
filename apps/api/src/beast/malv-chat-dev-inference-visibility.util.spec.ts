import {
  malvChatBypassTemplateShortCircuitsFromEnv,
  malvChatExposeInferenceFailureDetailFromEnv
} from "./malv-chat-dev-inference-visibility.util";

describe("malv-chat-dev-inference-visibility.util", () => {
  it("defaults bypass short-circuits to false", () => {
    expect(malvChatBypassTemplateShortCircuitsFromEnv(() => undefined)).toBe(false);
  });

  it("honors MALV_CHAT_BYPASS_TEMPLATE_SHORT_CIRCUITS", () => {
    expect(malvChatBypassTemplateShortCircuitsFromEnv((k) => (k === "MALV_CHAT_BYPASS_TEMPLATE_SHORT_CIRCUITS" ? "true" : undefined))).toBe(
      true
    );
  });

  it("defaults expose failure detail to false", () => {
    expect(malvChatExposeInferenceFailureDetailFromEnv(() => undefined)).toBe(false);
  });

  it("honors MALV_CHAT_EXPOSE_INFERENCE_FAILURE_DETAIL", () => {
    expect(
      malvChatExposeInferenceFailureDetailFromEnv((k) => (k === "MALV_CHAT_EXPOSE_INFERENCE_FAILURE_DETAIL" ? "1" : undefined))
    ).toBe(true);
  });
});

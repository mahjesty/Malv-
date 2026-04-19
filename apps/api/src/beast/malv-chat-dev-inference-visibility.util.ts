/** Read dev-only chat inference visibility flags from env (testable via getter). */
export function malvChatBypassTemplateShortCircuitsFromEnv(getEnv: (key: string) => string | undefined): boolean {
  const v = (getEnv("MALV_CHAT_BYPASS_TEMPLATE_SHORT_CIRCUITS") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function malvChatExposeInferenceFailureDetailFromEnv(getEnv: (key: string) => string | undefined): boolean {
  const v = (getEnv("MALV_CHAT_EXPOSE_INFERENCE_FAILURE_DETAIL") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

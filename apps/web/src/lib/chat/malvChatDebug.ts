/** Enable with VITE_MALV_CHAT_DEBUG=true or localStorage malv_chat_debug=1 */
export function isMalvChatDebugEnabled() {
  if (!import.meta.env.DEV) return false;
  const envOn = import.meta.env.VITE_MALV_CHAT_DEBUG === "true";
  const lsOn =
    typeof window !== "undefined" && window.localStorage?.getItem("malv_chat_debug") === "1";
  return envOn || lsOn;
}

export function malvChatDebug(tag: string, detail?: Record<string, unknown>) {
  if (!isMalvChatDebugEnabled()) return;
  if (detail !== undefined) {
    console.debug(`[MALV chat] ${tag}`, detail);
  } else {
    console.debug(`[MALV chat] ${tag}`);
  }
}

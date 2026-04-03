/** Temporary end-to-end pipeline tracing for MALV chat (remove or gate once stable). */
export function malvChatPipelineLog(checkpoint: string, detail?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  if (detail !== undefined) {
    console.log(`[MALV CHAT] ${checkpoint}`, detail);
  } else {
    console.log(`[MALV CHAT] ${checkpoint}`);
  }
}

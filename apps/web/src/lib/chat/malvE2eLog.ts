/** End-to-end MALV chat tracing — search console for `[MALV E2E]`. */
export function malvE2eLog(message: string, detail?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  if (detail !== undefined) {
    console.log(`[MALV E2E] ${message}`, detail);
  } else {
    console.log(`[MALV E2E] ${message}`);
  }
}

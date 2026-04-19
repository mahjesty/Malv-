/** Lets global turn-abort (e.g. stream latency audit) cancel in-flight assistant stream paints. */
let cancelAssistantStreamVisualRaf: (() => void) | null = null;

export function registerAssistantStreamVisualRafCancel(fn: (() => void) | null): void {
  cancelAssistantStreamVisualRaf = fn;
}

export function cancelAssistantStreamVisualRafFromRegistry(): void {
  cancelAssistantStreamVisualRaf?.();
}

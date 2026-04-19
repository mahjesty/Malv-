/**
 * @deprecated Import from `@/lib/chat/assistant-text` — structure layer of the unified assistant text pipeline.
 */
export {
  classifyAssistantProseLine,
  classifyStreamingAssistantLine,
  sanitizeProseForIncompleteMarkup,
  sanitizeStreamingAssistantProseForIncompleteMarkup,
  splitAssistantFenceSegments,
  splitStreamingAssistantFenceSegments,
  type StreamingAssistantLine,
  type StreamingFenceSegment
} from "./assistant-text/malv-assistant-text-structure";

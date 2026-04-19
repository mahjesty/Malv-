import { IMAGE_BRIEF_VERBATIM_MIN_CHARS } from "./image-prompt-expansion.constants";

/**
 * Long in-app transform recipes ship as full prose; short captions should be expanded on the server.
 */
export function shouldPreserveImageBriefVerbatim(trimmedUserBrief: string, hasSourceImage: boolean): boolean {
  if (!hasSourceImage) return false;
  return trimmedUserBrief.trim().length >= IMAGE_BRIEF_VERBATIM_MIN_CHARS;
}

import type { NavigateFunction } from "react-router-dom";
import { buildMinimalExploreActionContext } from "./exploreActionContext.types";
import { serializeStudioExploreSeedForUrl } from "./studioExploreSeed";

export function exploreNavigateToChatWithPrompt(navigate: NavigateFunction, text: string) {
  const q = text.trim();
  if (!q) {
    navigate("/app/chat?fresh=1");
    return;
  }
  navigate(`/app/chat?fresh=1&explorePrompt=${encodeURIComponent(q)}`);
}

export function exploreNavigateToChatWithThread(navigate: NavigateFunction, conversationId: string) {
  const id = conversationId.trim();
  if (!id) {
    navigate("/app/chat");
    return;
  }
  navigate(`/app/chat?conversationId=${encodeURIComponent(id)}`);
}

export function exploreNavigateToStudioBrief(navigate: NavigateFunction, brief: string) {
  const ctx = buildMinimalExploreActionContext({
    rawQuery: brief.trim() || "Explore capability brief",
    intent: "create_request"
  });
  const seed = serializeStudioExploreSeedForUrl(ctx);
  navigate(`/app/studio?exploreSeed=${encodeURIComponent(seed)}&fromSurface=explore_hub`);
}

export function exploreNavigateToTasks(navigate: NavigateFunction) {
  navigate("/app/tasks");
}

export function exploreNavigateToVoice(navigate: NavigateFunction) {
  navigate("/app/voice");
}

export function exploreNavigateToMemory(navigate: NavigateFunction) {
  navigate("/app/memory");
}

/**
 * Builds a single chat seed when the user wants Operator context after an Explore capability run.
 */
export function buildExploreContinueChatPrompt(args: {
  capabilityTitle: string;
  userBrief: string;
  assistantReply?: string;
}): string {
  const parts = [
    `Continue from Explore — ${args.capabilityTitle}.`,
    args.userBrief.trim() && `What I provided:\n${args.userBrief.trim()}`,
    args.assistantReply?.trim() && `Last inline MALV reply:\n${args.assistantReply.trim()}`
  ].filter(Boolean);
  return parts.join("\n\n");
}

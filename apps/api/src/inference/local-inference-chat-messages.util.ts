import { splitMalvChatPromptForOpenAiCompatibleChat } from "../beast/malv-brain-prompt";

export type OpenAiCompatibleChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Maps assembled thread history + the same expanded worker prompt into OpenAI chat messages
 * for llama.cpp / llama-server compatible servers.
 */
export function buildOpenAiChatMessagesForLocalInference(args: {
  priorMessages: Array<{ role: string; content: string }>;
  fullMalvChatPrompt: string;
  systemRolePrompt: string;
}): OpenAiCompatibleChatMessage[] {
  const { systemInstructions, finalUserContent } = splitMalvChatPromptForOpenAiCompatibleChat(
    args.fullMalvChatPrompt,
    args.systemRolePrompt,
    { dedupeOverlappingSystemRole: true }
  );
  const history = args.priorMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content ?? "")
    }));
  const last = history[history.length - 1];
  const duplicateFinalUser =
    last?.role === "user" &&
    (finalUserContent.length > 0
      ? last.content === finalUserContent
      : last.content === "");
  const finalUserTurn =
    finalUserContent.length > 0 ? finalUserContent : "(empty user message)";
  if (duplicateFinalUser) {
    return [{ role: "system", content: systemInstructions }, ...history];
  }
  return [{ role: "system", content: systemInstructions }, ...history, { role: "user", content: finalUserTurn }];
}

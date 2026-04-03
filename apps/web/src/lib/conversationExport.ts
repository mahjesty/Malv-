export type ConversationMessageRow = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type ConversationDetailShape = {
  conversation: { id: string; title: string | null; mode: string; createdAt: string; updatedAt: string };
  messages: ConversationMessageRow[];
};

export function buildConversationMarkdownExport(detail: ConversationDetailShape): string {
  const title = detail.conversation.title?.trim() || "Untitled session";
  const lines: string[] = [`# ${title}`, ``, `Session ID: \`${detail.conversation.id}\``, ``];
  for (const m of detail.messages) {
    const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
    lines.push(`## ${who}`, ``, m.content.trim(), ``);
  }
  return lines.join("\n");
}

/** Extractive digest for “Summarize” — no LLM; suitable for review and follow-up. */
export function buildConversationExtractiveDigest(detail: ConversationDetailShape): string {
  const title = detail.conversation.title?.trim() || "Untitled session";
  const userMsgs = detail.messages.filter((m) => m.role === "user");
  const asstMsgs = detail.messages.filter((m) => m.role === "assistant");
  const lines: string[] = [
    `# Conversation digest`,
    ``,
    `**${title}**`,
    ``,
    `- Messages: ${detail.messages.length} total (${userMsgs.length} user, ${asstMsgs.length} assistant)`,
    ``
  ];
  const lastAssistant = [...asstMsgs].slice(-3);
  if (lastAssistant.length) {
    lines.push(`## Recent assistant responses`, ``);
    for (const m of lastAssistant) {
      const excerpt = m.content.trim().replace(/\s+/g, " ");
      const short = excerpt.length > 320 ? `${excerpt.slice(0, 320)}…` : excerpt;
      lines.push(`- ${short}`, ``);
    }
  }
  const lastUser = [...userMsgs].slice(-3);
  if (lastUser.length) {
    lines.push(`## Recent user prompts`, ``);
    for (const m of lastUser) {
      const excerpt = m.content.trim().replace(/\s+/g, " ");
      const short = excerpt.length > 200 ? `${excerpt.slice(0, 200)}…` : excerpt;
      lines.push(`- ${short}`, ``);
    }
  }
  lines.push(`---`, `This digest is generated locally from your session transcript.`);
  return lines.join("\n");
}

export function buildStudioHandoffComposerText(detail: ConversationDetailShape): string {
  const title = detail.conversation.title?.trim() || "Untitled session";
  const lines: string[] = [
    `[Context from MALV session "${title}" (${detail.conversation.id})]`,
    ``,
    `Use this thread to continue the same product/UI work in Studio. Last messages:`,
    ``
  ];
  for (const m of detail.messages.slice(-16)) {
    const label = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
    const chunk = m.content.trim().replace(/\s+/g, " ");
    const short = chunk.length > 640 ? `${chunk.slice(0, 640)}…` : chunk;
    lines.push(`${label}: ${short}`, ``);
  }
  lines.push(`---`, `What should we change or build next in the preview?`);
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("rel", "noopener");
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

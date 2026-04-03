/** UUID v4-style id used in `?conversationId=` (matches ChatHomePage validation). */
export const CHAT_CONVERSATION_QUERY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseChatConversationIdFromSearchParams(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("conversationId");
  if (!raw || !CHAT_CONVERSATION_QUERY_PATTERN.test(raw)) return null;
  return raw;
}

import { describe, expect, it } from "vitest";
import { parseChatConversationIdFromSearchParams } from "./chatRouteConversation";

describe("parseChatConversationIdFromSearchParams", () => {
  it("returns null for missing or invalid ids", () => {
    expect(parseChatConversationIdFromSearchParams(new URLSearchParams())).toBeNull();
    expect(parseChatConversationIdFromSearchParams(new URLSearchParams("conversationId=bad"))).toBeNull();
  });

  it("returns the id when it matches the chat UUID pattern", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const sp = new URLSearchParams(`conversationId=${encodeURIComponent(id)}`);
    expect(parseChatConversationIdFromSearchParams(sp)).toBe(id);
  });
});

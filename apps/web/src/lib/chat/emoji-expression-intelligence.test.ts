import { describe, expect, it } from "vitest";
import { applyMalvEmojiExpressionLayer, decideEmojiPolicy } from "./emoji-expression-intelligence";

describe("decideEmojiPolicy", () => {
  it("blocks emoji for sensitive assistant copy", () => {
    const d = decideEmojiPolicy({
      responseText: "I cannot provide medical advice or a diagnosis.",
      responseKind: "assistant_chat_reply"
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("sensitive");
  });

  it("blocks emoji when the user sounds frustrated", () => {
    const d = decideEmojiPolicy({
      responseText: "Let's try a different approach to get you unstuck.",
      responseKind: "assistant_chat_reply",
      lastUserMessage: "This is broken and useless."
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("user_frustrated");
  });

  it("blocks emoji for technical responses with fenced code", () => {
    const d = decideEmojiPolicy({
      responseText: "Use this pattern:\n\n```ts\nconst x = 1;\n```\n",
      responseKind: "assistant_chat_reply"
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("technical");
  });

  it("allows subtle emoji for encouraging copy", () => {
    const d = decideEmojiPolicy({
      responseText: "You're on the right track—this structure will scale cleanly.",
      responseKind: "assistant_chat_reply"
    });
    expect(d.shouldUseEmoji).toBe(true);
    expect(d.allowedCount).toBe(1);
    expect(d.insertions.length).toBe(1);
    expect(d.insertions[0]!.emoji).toBe("✨");
  });

  it("allows celebratory emoji for wins", () => {
    const d = decideEmojiPolicy({
      responseText: "Congratulations on the launch—this is a real milestone.",
      responseKind: "assistant_chat_reply"
    });
    expect(d.shouldUseEmoji).toBe(true);
    expect(["✨", "🎉", "🚀"]).toContain(d.insertions[0]!.emoji);
  });

  it("does not add emoji when the model already included one", () => {
    const d = decideEmojiPolicy({
      responseText: "Nice work on the refactor ✨",
      responseKind: "assistant_chat_reply"
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("already_has_emoji");
  });

  it("surfaces non-chat kinds without emoji", () => {
    const d = decideEmojiPolicy({
      responseText: "Something went wrong.",
      responseKind: "error_message"
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("not_chat_surface");
  });

  it("is deterministic for equivalent inputs", () => {
    const ctx = {
      responseText: "Great work shipping v2—huge milestone for the team.",
      responseKind: "assistant_chat_reply" as const,
      lastUserMessage: "We finally shipped! 🎉"
    };
    const a = decideEmojiPolicy(ctx);
    const b = decideEmojiPolicy(ctx);
    expect(a).toEqual(b);
  });

  it("slightly increases permissiveness when the user used emoji (expressive vs single)", () => {
    const withEmoji = decideEmojiPolicy({
      responseText: "Congratulations on the launch!\n\nThis sets you up for the next phase.",
      responseKind: "assistant_chat_reply",
      lastUserMessage: "We shipped!! 🚀"
    });
    const without = decideEmojiPolicy({
      responseText: "Congratulations on the launch!\n\nThis sets you up for the next phase.",
      responseKind: "assistant_chat_reply",
      lastUserMessage: "We shipped."
    });
    expect(withEmoji.shouldUseEmoji).toBe(true);
    expect(without.shouldUseEmoji).toBe(true);
    expect(withEmoji.allowedCount).toBeGreaterThanOrEqual(without.allowedCount);
  });

  it("respects formal user tone by avoiding playful clashes", () => {
    const d = decideEmojiPolicy({
      responseText: "This is a silly fun idea for the campaign.",
      responseKind: "assistant_chat_reply",
      lastUserMessage: "Dear Sir, best regards."
    });
    expect(d.shouldUseEmoji).toBe(false);
    expect(d.reasoning).toBe("formal_user_playful_clash");
  });
});

describe("applyMalvEmojiExpressionLayer", () => {
  it("never inserts emoji inside fenced code blocks", () => {
    const text = "Summary line.\n\n```txt\nERROR: failed\n```\n\nNice progress on the rollout.";
    const { transformedText } = applyMalvEmojiExpressionLayer({
      responseText: text,
      responseKind: "assistant_chat_reply"
    });
    const fence = text.match(/```[\s\S]*?```/)?.[0] ?? "";
    const outFence = transformedText.match(/```[\s\S]*?```/)?.[0] ?? "";
    expect(outFence).toBe(fence);
    expect(outFence).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("caps density: at most two insertions in expressive path", () => {
    const { decision } = applyMalvEmojiExpressionLayer({
      responseText: "Congratulations!\n\nYou shipped the release.",
      responseKind: "assistant_chat_reply",
      lastUserMessage: "yay 🎉"
    });
    expect(decision.insertions.length).toBeLessThanOrEqual(2);
    const pict = (
      applyMalvEmojiExpressionLayer({
        responseText: "Congratulations!\n\nYou shipped the release.",
        responseKind: "assistant_chat_reply",
        lastUserMessage: "yay 🎉"
      }).transformedText.match(/\p{Extended_Pictographic}/gu) ?? []
    ).length;
    expect(pict).toBeLessThanOrEqual(2);
  });
});

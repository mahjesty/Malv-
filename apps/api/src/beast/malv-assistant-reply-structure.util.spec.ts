import {
  malvAssistantReplyHasOpenCodeFence,
  malvAssistantReplyLooksStructurallyIncomplete
} from "./malv-assistant-reply-structure.util";

describe("malv-assistant-reply-structure.util", () => {
  it("detects an open markdown fence", () => {
    const body = "Here is code:\n```ts\nconst x = 1;\n";
    expect(malvAssistantReplyHasOpenCodeFence(body)).toBe(true);
    expect(malvAssistantReplyLooksStructurallyIncomplete(body)).toBe(true);
  });

  it("does not flag balanced fences", () => {
    const body = "Ok:\n```\nhi\n```\n";
    expect(malvAssistantReplyHasOpenCodeFence(body)).toBe(false);
    expect(malvAssistantReplyLooksStructurallyIncomplete(body)).toBe(false);
  });

  it("flags ellipsis tail as likely truncated", () => {
    expect(malvAssistantReplyLooksStructurallyIncomplete("Still thinking ...")).toBe(true);
  });
});

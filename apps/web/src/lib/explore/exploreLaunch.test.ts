import { describe, expect, it, vi } from "vitest";
import { buildExploreContinueChatPrompt } from "./exploreLaunch";

describe("exploreLaunch", () => {
  it("builds continue prompt with optional reply", () => {
    const p = buildExploreContinueChatPrompt({
      capabilityTitle: "Fix anything",
      userBrief: "API 500s",
      assistantReply: "Check logs…"
    });
    expect(p).toContain("Fix anything");
    expect(p).toContain("API 500s");
    expect(p).toContain("Check logs");
  });

  it("navigate helpers encode prompts", async () => {
    const { exploreNavigateToChatWithPrompt } = await import("./exploreLaunch");
    const nav = vi.fn();
    exploreNavigateToChatWithPrompt(nav as unknown as import("react-router-dom").NavigateFunction, "hello & world");
    const arg = nav.mock.calls[0]?.[0] as string;
    expect(arg).toContain("explorePrompt=");
    expect(arg).toContain(encodeURIComponent("hello & world"));
  });
});

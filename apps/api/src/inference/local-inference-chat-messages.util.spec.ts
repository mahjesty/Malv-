import { buildMalvChatPrompt, MALV_SYSTEM_ROLE_PROMPT } from "../beast/malv-brain-prompt";
import { buildOpenAiChatMessagesForLocalInference } from "./local-inference-chat-messages.util";

describe("buildOpenAiChatMessagesForLocalInference", () => {
  it("builds system + history + current user in order", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "second turn",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "explain"
    });
    const msgs = buildOpenAiChatMessagesForLocalInference({
      priorMessages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "ack" }
      ],
      fullMalvChatPrompt: prompt,
      systemRolePrompt: MALV_SYSTEM_ROLE_PROMPT
    });
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("### [system] MALV base");
    expect(msgs[0].content).toMatch(/forbidden identities|"I am Qwen"/i);
    expect(msgs[0].content).toContain("### Intent-first answering");
    expect(msgs[1]).toEqual({ role: "user", content: "first" });
    expect(msgs[2]).toEqual({ role: "assistant", content: "ack" });
    expect(msgs[3]).toEqual({ role: "user", content: "second turn" });
  });

  it("drops non user/assistant history roles", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "hi",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "explain"
    });
    const msgs = buildOpenAiChatMessagesForLocalInference({
      priorMessages: [{ role: "system", content: "nope" }, { role: "user", content: "u1" }],
      fullMalvChatPrompt: prompt,
      systemRolePrompt: MALV_SYSTEM_ROLE_PROMPT
    });
    expect(msgs.filter((m) => m.content === "nope")).toHaveLength(0);
    expect(msgs.some((m) => m.role === "user" && m.content === "u1")).toBe(true);
  });

  it("does not duplicate the final user turn when it already appears as the last history message", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "same turn",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "explain"
    });
    const msgs = buildOpenAiChatMessagesForLocalInference({
      priorMessages: [
        { role: "user", content: "earlier" },
        { role: "assistant", content: "ack" },
        { role: "user", content: "same turn" }
      ],
      fullMalvChatPrompt: prompt,
      systemRolePrompt: MALV_SYSTEM_ROLE_PROMPT
    });
    const users = msgs.filter((m) => m.role === "user").map((m) => m.content);
    expect(users).toEqual(["earlier", "same turn"]);
  });
});

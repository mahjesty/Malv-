import {
  buildMalvChatPrompt,
  MALV_CORE_SYSTEM_PROMPT,
  MALV_IDENTITY_LOCK,
  summarizeMalvPromptStructure
} from "./malv-brain-prompt";

describe("MALV brain prompt", () => {
  it("includes the identity lock in the exported core prompt", () => {
    expect(MALV_CORE_SYSTEM_PROMPT).toContain("MALV");
    expect(MALV_CORE_SYSTEM_PROMPT).toContain("Never call yourself Qwen");
    expect(MALV_IDENTITY_LOCK).toContain("Alibaba");
  });

  it("buildMalvChatPrompt includes MALV base and identity rules", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "what is 2+2",
      contextBlock: "test ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze"
    });
    expect(prompt).toContain("### [system] MALV base");
    expect(prompt).toContain("### [system] Mode");
    expect(prompt).toContain("### [system] Context summary");
    expect(prompt).toContain("### [user] Message");
    expect(prompt).toContain("what is 2+2");
    expect(prompt).toContain("Never call yourself Qwen");
    expect(prompt).toContain("least privilege");

    const summary = summarizeMalvPromptStructure(prompt);
    expect(summary.hasMalvBaseSection).toBe(true);
    expect(summary.hasModeSection).toBe(true);
    expect(summary.hasContextSection).toBe(true);
    expect(summary.hasUserMessageSection).toBe(true);
    expect(summary.malvBaseChars).toBeGreaterThan(20);
    expect(summary.userMessageChars).toBeGreaterThan(0);
    expect(summary.promptTotalChars).toBe(prompt.length);
  });

  it("embeds tone instruction block under Mode when provided", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "debug this",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "fix",
      toneInstructionBlock: "### [system] Response tone (this turn)\nUser tone: tense — stay calm.\n"
    });
    expect(prompt).toContain("Response tone (this turn)");
    expect(prompt).toContain("User tone: tense");
  });

  it("adds multimodal attachment guidance when composer manifest is present", () => {
    const prompt = buildMalvChatPrompt({
      userMessage:
        "The user attached the following (reference names and types):\n- file: notes.txt (text/plain)\n\nSummarize.",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze"
    });
    expect(prompt).toContain("Multimodal attachments");
    expect(prompt).toContain("Infer purpose and risks from names/types only");
  });

  it("server phased notice replaces autonomous orchestration block when both provided", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "ship a large feature",
      contextBlock: "",
      beastLevel: "Beast",
      classifiedMode: "beast",
      modeType: "analyze",
      autonomousOrchestrationBlock: "AUTONOMOUS_BLOCK_SHOULD_NOT_APPEAR",
      serverPhasedOrchestrationNotice: "Server phased: one phase per worker turn."
    });
    expect(prompt).toContain("Server phased");
    expect(prompt).toContain("Server phased orchestration");
    expect(prompt).not.toContain("AUTONOMOUS_BLOCK_SHOULD_NOT_APPEAR");
  });

  it("adds first-thread overlay when isFirstThreadTurn", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "hello world",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze",
      isFirstThreadTurn: true,
      userTone: "casual"
    });
    expect(prompt).toContain("First turn in this thread");
    expect(prompt).toContain("Thread tone: User reads casual");
  });

  it("includes autonomous orchestration directives when provided", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "ship a dashboard",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "beast",
      modeType: "operator_workflow",
      autonomousOrchestrationBlock: "Classified intent (internal): full_product_build"
    });
    expect(prompt).toContain("### Autonomous orchestration directives");
    expect(prompt).toContain("full_product_build");
  });
});

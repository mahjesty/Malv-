import {
  buildMalvChatPrompt,
  MALV_CORE_SYSTEM_PROMPT,
  MALV_IDENTITY_LOCK,
  MALV_SYSTEM_ROLE_PROMPT,
  splitMalvChatPromptForOpenAiCompatibleChat,
  summarizeMalvPromptStructure
} from "./malv-brain-prompt";

describe("MALV brain prompt", () => {
  it("economy prompt effort stays shorter than standard while keeping identity lock", () => {
    const baseArgs = {
      userMessage: "status check",
      contextBlock: "ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze" as const,
      attachSecuritySoftwareHygiene: false
    };
    const standard = buildMalvChatPrompt({ ...baseArgs, promptEffort: "standard" });
    const economy = buildMalvChatPrompt({ ...baseArgs, promptEffort: "economy" });
    expect(economy.length).toBeLessThan(standard.length);
    expect(economy).toMatch(/forbidden identities|"I am Qwen"/i);
  });

  it("includes the identity lock in the exported core prompt", () => {
    expect(MALV_CORE_SYSTEM_PROMPT).toContain("MALV");
    expect(MALV_CORE_SYSTEM_PROMPT).toMatch(/forbidden identities|"I am Qwen"/i);
    expect(MALV_IDENTITY_LOCK).toContain("Alibaba");
  });

  it("adds compact multi-intent shaping when the user bundles multiple asks", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "who made you and what can you do",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze"
    });
    expect(prompt).toContain("### Multi-part message");
    expect(prompt).toMatch(/Also:/i);
    expect(prompt).toContain("### Intent-first answering");
  });

  it("embeds intent-first answering block derived from the user message", () => {
    const factual = buildMalvChatPrompt({
      userMessage: "what is 2+2",
      contextBlock: "test ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze"
    });
    expect(factual).toContain("### Intent-first answering");
    expect(factual).toContain("factual");

    const yes = buildMalvChatPrompt({
      userMessage: "is delta state clean",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze",
      questionAnswerShape: "yes_no"
    });
    expect(yes).toContain("yes_no");
    expect(yes).toMatch(/first sentence/i);
  });

  it("includes internal response plan block when provided", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "Explain closures",
      contextBlock: "",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze",
      responsePlanBlock: "### Response plan (internal)\nresponseType: explanatory"
    });
    expect(prompt).toContain("### Response plan (internal)");
    expect(prompt).toContain("responseType: explanatory");
  });

  it("buildMalvChatPrompt includes MALV base and identity rules", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "what is 2+2",
      contextBlock: "test ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze"
    });
    expect(prompt).toMatch(/relationship to them|identity or what you do/i);
    expect(prompt).toContain("### [system] MALV base");
    expect(prompt).toContain("### [system] Mode");
    expect(prompt).toContain("### [system] Context summary");
    expect(prompt).toContain("### [user] Message");
    expect(prompt).toContain("what is 2+2");
    expect(prompt).toMatch(/forbidden identities|"I am Qwen"/i);
    expect(prompt).toContain("least privilege");

    const slim = buildMalvChatPrompt({
      userMessage: "what is 2+2",
      contextBlock: "test ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "analyze",
      attachSecuritySoftwareHygiene: false
    });
    expect(slim).not.toContain("least privilege");

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
    expect(prompt).toContain("First message in this thread");
    expect(prompt).toContain("They sound casual");
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

  it("splitMalvChatPromptForOpenAiCompatibleChat separates system instructions from final user content", () => {
    const prompt = buildMalvChatPrompt({
      userMessage: "hello, who are you?",
      contextBlock: "ctx",
      beastLevel: "Smart",
      classifiedMode: "light",
      modeType: "explain"
    });
    const split = splitMalvChatPromptForOpenAiCompatibleChat(prompt, MALV_SYSTEM_ROLE_PROMPT);
    expect(split.finalUserContent).toContain("hello, who are you?");
    expect(split.systemInstructions).toContain(MALV_SYSTEM_ROLE_PROMPT.slice(0, 40));
    expect(split.systemInstructions).toContain("### [system] MALV base");
    expect(split.systemInstructions).not.toContain("hello, who are you?");
  });
});

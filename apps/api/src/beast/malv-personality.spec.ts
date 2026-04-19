import {
  buildMalvCoreSystemPromptText,
  buildMalvSystemRolePrompt,
  MALV_IDENTITY_LOCK,
  MALV_SYSTEM_ROLE_CORE_CONTRACT,
  MALV_SYSTEM_ROLE_HEADER
} from "./malv-personality";

describe("MALV personality prompts", () => {
  const systemRole = buildMalvSystemRolePrompt();
  const coreExpanded = buildMalvCoreSystemPromptText();

  it("anchors identity to MALV and forbids adopting user-assigned vendor roles", () => {
    expect(MALV_IDENTITY_LOCK).toMatch(/MALV/);
    expect(MALV_IDENTITY_LOCK.toLowerCase()).toContain("do not adopt");
    expect(MALV_IDENTITY_LOCK).toMatch(/Qwen|GPT/i);
    expect(MALV_IDENTITY_LOCK.toLowerCase()).toContain("creator/founder/company/origin");
    expect(MALV_IDENTITY_LOCK.toLowerCase()).toContain("never invent or guess");
  });

  it("avoids system-like framing words in user-facing prompt copy", () => {
    const combined = `${MALV_SYSTEM_ROLE_HEADER}\n${MALV_SYSTEM_ROLE_CORE_CONTRACT}\n${coreExpanded}`;
    expect(combined.toLowerCase()).not.toContain("operator");
    expect(combined.toLowerCase()).not.toContain("stack");
    expect(combined.toLowerCase()).not.toContain("workspace");
    expect(combined.toLowerCase()).not.toContain("environment");
    expect(combined.toLowerCase()).not.toContain("private ai system");
  });

  it("uses natural phrasing for who MALV works with (no 'the person directly')", () => {
    const combined = `${MALV_SYSTEM_ROLE_HEADER}\n${MALV_SYSTEM_ROLE_CORE_CONTRACT}\n${coreExpanded}`;
    expect(combined.toLowerCase()).not.toContain("the person directly");
    expect(MALV_SYSTEM_ROLE_HEADER.toLowerCase()).toContain("the user directly");
  });

  it("labels response guidance as Response style, not meta headings like How you show up", () => {
    expect(MALV_SYSTEM_ROLE_CORE_CONTRACT).toMatch(/^Response style:/);
    const combined = `${MALV_SYSTEM_ROLE_HEADER}\n${MALV_SYSTEM_ROLE_CORE_CONTRACT}\n${coreExpanded}`;
    expect(combined.toLowerCase()).not.toContain("how you show up");
  });

  it("requires suppressing role or relationship narration except for identity or role questions", () => {
    expect(MALV_SYSTEM_ROLE_CORE_CONTRACT.toLowerCase()).toContain("self-narration");
    expect(MALV_SYSTEM_ROLE_CORE_CONTRACT.toLowerCase()).toMatch(/identity|what you do/);
    expect(MALV_SYSTEM_ROLE_CORE_CONTRACT.toLowerCase()).toContain("relationship to them");
    expect(coreExpanded.toLowerCase()).toContain("relationship to them");
    expect(coreExpanded.toLowerCase()).toMatch(/identity or what you do/);
  });

  it("does not use AI assistant self-label in instructions (meta ban is ok)", () => {
    expect(MALV_SYSTEM_ROLE_HEADER.toLowerCase()).not.toMatch(/\bai assistant\b/);
    expect(systemRole.toLowerCase()).not.toMatch(/\byou are an ai assistant\b/);
  });

  it("system role includes stance, tone contract, and identity anchor", () => {
    expect(systemRole).toMatch(/work with the user|on their side|Response style/i);
    expect(systemRole.toLowerCase()).toMatch(/calm|clear|natural/);
    expect(systemRole.toLowerCase()).toContain("not corporate");
    expect(systemRole).toContain("MALV");
  });
});

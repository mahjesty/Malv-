import {
  isBroadButAnswerableUserRequest,
  isUserDelegatingTopicChoice,
  lastAssistantTurnLooksLikeMalvClarificationRequest,
  shouldSuppressClarificationAfterPriorClarify
} from "./malv-clarification-relief.util";
import { buildAutonomousClarificationReply, buildSoftDualIntentClarificationReply } from "./autonomous-orchestration.prompt";
import type { ClassifiedIntent } from "./intent-understanding.types";

describe("malv-clarification-relief.util", () => {
  it("treats permissive delegation phrases as topic choice", () => {
    expect(isUserDelegatingTopicChoice("anything")).toBe(true);
    expect(isUserDelegatingTopicChoice("whatever")).toBe(true);
    expect(isUserDelegatingTopicChoice("surprise me")).toBe(true);
    expect(isUserDelegatingTopicChoice("you choose")).toBe(true);
    expect(isUserDelegatingTopicChoice("yes")).toBe(true);
  });

  it("classifies broad educational prompts as answerable without more user input", () => {
    expect(isBroadButAnswerableUserRequest("explain something complex step by step and be detailed")).toBe(true);
    expect(isBroadButAnswerableUserRequest("teach me something interesting")).toBe(true);
    expect(isBroadButAnswerableUserRequest("pick one and explain it")).toBe(true);
    expect(isBroadButAnswerableUserRequest("surprise me")).toBe(true);
  });

  it("detects prior clarification-style assistant turns", () => {
    expect(
      lastAssistantTurnLooksLikeMalvClarificationRequest([
        { role: "user", content: "explain something" },
        {
          role: "assistant",
          content:
            "I want to help — I need one concrete anchor so I don’t aim at the wrong thing.\n\nWhat outcome do you want?"
        }
      ])
    ).toBe(true);
  });

  it("suppresses clarification after prior clarify when user delegates", () => {
    const prior = [
      { role: "user", content: "explain something complex step by step" },
      {
        role: "assistant",
        content:
          "I want to help — I need one concrete anchor so I don’t aim at the wrong thing.\n\nWhat outcome do you want?"
      }
    ];
    expect(shouldSuppressClarificationAfterPriorClarify("anything", prior)).toBe(true);
  });

  it("does not suppress when there was no clarification ask", () => {
    const prior = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello — what are you working on today?" }
    ];
    expect(shouldSuppressClarificationAfterPriorClarify("anything", prior)).toBe(false);
  });

  it("autonomous and soft clarification copy avoids internal pipeline jargon", () => {
    const classified: ClassifiedIntent = {
      primaryIntent: "feature_build",
      scores: {
        full_product_build: 0,
        feature_build: 0,
        bug_fix: 0,
        improvement_refactor: 0,
        frontend_design: 0,
        backend_logic: 0,
        system_upgrade: 0
      },
      scopeSize: "small",
      complexity: "low",
      domains: [],
      ambiguity: { isAmbiguous: true, reason: "short_low_signal" }
    };
    const auto = buildAutonomousClarificationReply(classified);
    expect(auto.toLowerCase()).not.toMatch(/\bfull\s+pipeline\b/);
    expect(auto.toLowerCase()).not.toMatch(/\bphases?\b.*\bverification\b/);

    const dual = buildSoftDualIntentClarificationReply(classified);
    expect(dual.toLowerCase()).not.toMatch(/\bfull\s+pipeline\b/);
  });
});

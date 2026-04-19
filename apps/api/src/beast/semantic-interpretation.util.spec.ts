import { IntentUnderstandingService } from "./intent-understanding.service";
import type { ClassifiedIntent } from "./intent-understanding.types";
import { aggregateMalvSemanticInterpretation } from "./semantic-interpretation.util";

describe("aggregateMalvSemanticInterpretation", () => {
  const intent = new IntentUnderstandingService();

  const minimalScores = (): ClassifiedIntent["scores"] => ({
    full_product_build: 0,
    feature_build: 1,
    bug_fix: 0,
    improvement_refactor: 0,
    frontend_design: 0,
    backend_logic: 0,
    system_upgrade: 0
  });

  function syntheticClassified(ambiguity: ClassifiedIntent["ambiguity"]): ClassifiedIntent {
    return {
      primaryIntent: "feature_build",
      scores: minimalScores(),
      scopeSize: "small",
      complexity: "low",
      domains: [],
      ambiguity
    };
  }

  it("returns identical structured output for identical inputs (deterministic)", () => {
    const classified = intent.classify("explain tides");
    const prior = [
      { role: "user", content: "not sure" },
      {
        role: "assistant",
        content: "What exactly should change — build, fix, or explore?\n\nWhich direction matches best?"
      }
    ];
    const a = aggregateMalvSemanticInterpretation({
      userMessage: "  explain   tides  ",
      classified,
      broadRequestContext: { priorMessages: prior },
      userReplyFollowsAssistantClarification: true
    });
    const b = aggregateMalvSemanticInterpretation({
      userMessage: "  explain   tides  ",
      classified,
      broadRequestContext: { priorMessages: prior },
      userReplyFollowsAssistantClarification: true
    });
    expect(a).toEqual(b);
    expect(a.normalizedUserMessage).toBe("explain tides");
  });

  it("marks clarification relief when classifier ambiguity clears under broad proceed", () => {
    const classified = syntheticClassified({ isAmbiguous: true, reason: "intent_tie" });
    const prior = [
      { role: "user", content: "hmm" },
      {
        role: "assistant",
        content: "What exactly should change — build, fix, or explore?\n\nWhich direction matches best?"
      }
    ];
    const out = aggregateMalvSemanticInterpretation({
      userMessage: "anything",
      classified,
      broadRequestContext: { priorMessages: prior },
      userReplyFollowsAssistantClarification: true
    });
    expect(out.broadPromptPolicy.action).toBe("proceed");
    expect(out.signals.clarificationReliefCandidate).toBe(true);
    expect(out.ambiguity.forExecution.isAmbiguous).toBe(false);
    expect(out.delegationLevel).toBe("topic_choice");
  });

  it("keeps guarded high-risk paths blocked without false delegation", () => {
    const classified = intent.classify("help");
    const out = aggregateMalvSemanticInterpretation({
      userMessage: "whatever — diagnose my symptoms and prescribe something",
      classified
    });
    expect(out.broadPromptPolicy.action).toBe("guarded");
    expect(out.riskLevel).toBe("high");
    expect(out.signals.highRiskOrDestructiveHeuristic).toBe(true);
    expect(out.delegationLevel).toBe("none");
    expect(out.ambiguity.isBlocking).toBe(true);
  });

  it("preserves broad educational proceed semantics", () => {
    const classified = intent.classify("explain something complex step by step and be detailed");
    const out = aggregateMalvSemanticInterpretation({
      userMessage: "explain something complex step by step and be detailed",
      classified
    });
    expect(out.broadPromptPolicy.action).toBe("proceed");
    expect(out.intentSurface).toBe("knowledge_or_casual_qa");
    expect(out.constraints.wantsStepByStep).toBe(true);
    expect(out.constraints.wantsDepth).toBe(true);
  });

  it("surfaces missingTopic when classifier marks vague low-signal ambiguity", () => {
    const classified = intent.classify("help");
    const out = aggregateMalvSemanticInterpretation({ userMessage: "help", classified });
    expect(classified.ambiguity.isAmbiguous).toBe(true);
    expect(out.broadPromptPolicy.action).toBe("clarify");
    expect(out.ambiguity.missingTopic).toBe(true);
    expect(out.signals.clarificationReliefCandidate).toBe(false);
  });
});

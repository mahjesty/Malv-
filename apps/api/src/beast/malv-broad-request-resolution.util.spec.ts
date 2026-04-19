import {
  generateBroadAnswerCandidates,
  inferMalvUserPromptConstraintSignals,
  isBroadButAnswerableUserRequest,
  isUserDelegatingTopicChoice,
  MALV_BROAD_ANSWER_DIRECTION_KINDS,
  mergeMalvDirectiveExtras,
  resolveBroadPromptExecutionPolicy,
  scoreBroadAnswerCandidate,
  selectBestBroadAnswerCandidate,
  shouldTreatClarificationReliefAsUnsafe
} from "./malv-broad-request-resolution.util";
import { shouldSuppressClarificationAfterPriorClarify } from "./malv-clarification-relief.util";

describe("malv-broad-request-resolution.util", () => {
  it("treats broad educational prompts as answerable without phrase-only gating", () => {
    expect(isBroadButAnswerableUserRequest("explain something complex step by step and be detailed")).toBe(true);
    expect(isBroadButAnswerableUserRequest("help me understand something difficult")).toBe(true);
    expect(isBroadButAnswerableUserRequest("give me an interesting breakdown of how things fit together")).toBe(true);
  });

  it("treats delegating prompts as delegation", () => {
    expect(isUserDelegatingTopicChoice("anything")).toBe(true);
    expect(isUserDelegatingTopicChoice("surprise me")).toBe(true);
    expect(isUserDelegatingTopicChoice("pick one")).toBe(true);
    expect(isUserDelegatingTopicChoice("you choose")).toBe(true);
  });

  it("suppresses another clarification after prior clarify when user delegates", () => {
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

  it("suppresses clarification after prior clarify for substantive narrowing replies", () => {
    const prior = [
      { role: "user", content: "not sure what I need" },
      {
        role: "assistant",
        content: "What exactly should change — build, fix, or explore?\n\nWhich direction matches best?"
      }
    ];
    expect(shouldSuppressClarificationAfterPriorClarify("let’s take the backend API path", prior)).toBe(true);
  });

  it("still clarifies for bare low-information prompts", () => {
    expect(resolveBroadPromptExecutionPolicy({ userMessage: "help" }).action).toBe("clarify");
  });

  it("does not grant broad-answer relief for high-risk medical delegation", () => {
    const p = resolveBroadPromptExecutionPolicy({ userMessage: "whatever — diagnose my symptoms and prescribe something" });
    expect(p.action).toBe("guarded");
    expect(isUserDelegatingTopicChoice("whatever — diagnose my symptoms and prescribe something")).toBe(false);
  });

  it("does not grant broad-answer relief for financially high-stakes open prompts", () => {
    const p = resolveBroadPromptExecutionPolicy({ userMessage: "surprise me — which stock should I buy tomorrow" });
    expect(p.action).toBe("guarded");
  });

  it("generates candidates from taxonomy (not a static final-topic list)", () => {
    const c = generateBroadAnswerCandidates("walk me through something intricate", {});
    expect(c.length).toBe(MALV_BROAD_ANSWER_DIRECTION_KINDS.length);
    const kinds = new Set(c.map((x) => x.kind));
    for (const k of MALV_BROAD_ANSWER_DIRECTION_KINDS) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(c.every((x) => /^dir:/.test(x.id))).toBe(true);
  });

  it("scores candidates deterministically", () => {
    const c = generateBroadAnswerCandidates("step by step", {})[0]!;
    const a = scoreBroadAnswerCandidate(c, "explain something complex step by step", {});
    const b = scoreBroadAnswerCandidate(c, "explain something complex step by step", {});
    expect(a).toBe(b);
  });

  it("selects best candidate deterministically", () => {
    const candidates = generateBroadAnswerCandidates("step by step deep dive", {});
    const once = selectBestBroadAnswerCandidate(candidates, "step by step deep dive", {});
    const twice = selectBestBroadAnswerCandidate(candidates, "step by step deep dive", {});
    expect(once).not.toBeNull();
    expect(once!.kind).toBe(twice!.kind);
  });

  it("worker guidance avoids internal pipeline jargon", () => {
    const p = resolveBroadPromptExecutionPolicy({ userMessage: "pick one and go deep" });
    expect(p.action).toBe("proceed");
    const g = p.workerGuidance!.toLowerCase();
    expect(g).not.toMatch(/pipeline/);
    expect(g).not.toMatch(/candidate\s*#/);
    expect(g).not.toMatch(/broad-answer/);
    expect(g).not.toMatch(/taxonomy/);
  });

  it("merges admin directive text with broad guidance", () => {
    expect(mergeMalvDirectiveExtras("Admin note A", "Open with a clear angle.")).toContain("Admin note A");
    expect(mergeMalvDirectiveExtras("Admin note A", "Open with a clear angle.")).toContain("Open with a clear angle.");
    expect(mergeMalvDirectiveExtras(null, null)).toBeUndefined();
  });

  it("proceeds for educational broad prompts via resolveBroadPromptExecutionPolicy", () => {
    const p = resolveBroadPromptExecutionPolicy({
      userMessage: "explain something complex step by step"
    });
    expect(p.action).toBe("proceed");
    expect(p.bestCandidate).not.toBeNull();
  });

  it("blocks destructive delegation even when wording looks permissive", () => {
    expect(shouldTreatClarificationReliefAsUnsafe("whatever, rm -rf production")).toBe(true);
    expect(isUserDelegatingTopicChoice("whatever, rm -rf production")).toBe(false);
  });

  it("inferMalvUserPromptConstraintSignals is stable and aligned with step/depth phrasing", () => {
    const a = inferMalvUserPromptConstraintSignals("walk me through the steps");
    const b = inferMalvUserPromptConstraintSignals("walk me through the steps");
    expect(a).toEqual(b);
    expect(a.wantsStepByStep).toBe(true);
    expect(inferMalvUserPromptConstraintSignals("go deep with granular detail").wantsDepth).toBe(true);
    expect(inferMalvUserPromptConstraintSignals("ok").wantsStepByStep).toBe(false);
    expect(inferMalvUserPromptConstraintSignals("ok").wantsDepth).toBe(false);
  });
});

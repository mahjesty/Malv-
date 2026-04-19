import {
  buildMalvContinuationPrompt,
  detectMalvContinuationPlan,
  extractMeaningfulContinuationAppend,
  isLikelyLargeBuildTask
} from "./malv-continuation.util";

describe("malv-continuation.util", () => {
  it("treats length finish reason as continuable", () => {
    const plan = detectMalvContinuationPlan({
      reply: "Here is a long response...",
      meta: { finishReason: "length", malvTurnOutcome: "complete" }
    });
    expect(plan.canContinue).toBe(true);
    expect(plan.continueReason).toBe("length");
    expect(plan.continuationMode).toBe("auto");
  });

  it("respects explicit partial_done as continuable", () => {
    const plan = detectMalvContinuationPlan({
      reply: "Partial answer",
      meta: { malvTurnOutcome: "partial_done" }
    });
    expect(plan.canContinue).toBe(true);
    expect(plan.continueReason).toBe("partial_done");
  });

  it("extracts only novel continuation text", () => {
    const prior = "Phase 1 complete.\nPhase 2 in progress";
    const candidate = "Phase 1 complete.\nPhase 2 in progress\nPhase 3: API routes done";
    const append = extractMeaningfulContinuationAppend({ prior, candidate });
    expect(append).toBe("Phase 3: API routes done");
  });

  it("returns empty append for duplicate continuation", () => {
    const prior = "Architecture complete. Backend complete.";
    const append = extractMeaningfulContinuationAppend({ prior, candidate: prior });
    expect(append).toBe("");
  });

  it("build mode prompt tells model to continue next phase only", () => {
    const prompt = buildMalvContinuationPrompt({
      userMessage: "Build a full-stack SaaS dashboard with auth and database",
      priorReply: "## Architecture\nDone.",
      plan: {
        canContinue: true,
        continueReason: "length",
        continuationCursor: "## Backend Foundation",
        continuationMode: "auto"
      },
      continuationIndex: 1,
      executionStrategy: {
        mode: "phased",
        internalPhases: ["audit", "plan", "implement", "verify", "review", "architecture"],
        preferBeastWorker: true,
        riskTier: "high"
      }
    });
    expect(prompt).toContain("Continue with the next phase only");
    expect(prompt).toContain("do not restart the whole project");
  });

  it("flags likely large build tasks via deterministic signals", () => {
    const yes = isLikelyLargeBuildTask({
      userMessage: "Create a full-stack app with auth, database, backend API routes, frontend dashboard, and deploy flow."
    });
    const no = isLikelyLargeBuildTask({
      userMessage: "Fix typo in a button label."
    });
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });
});

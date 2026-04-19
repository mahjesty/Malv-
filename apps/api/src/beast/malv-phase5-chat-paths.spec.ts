import { classifyMalvReflexTurn } from "./malv-reflex-turn.util";
import { buildDeterministicTemplateShortCircuit } from "./beast-template-short-circuit.util";
import { malvServerPhasedOrchestrationEligible } from "./malv-server-phased-eligibility.util";
import { mergeExplicitMoodHint, analyzeUserTone } from "./malv-conversation-signals";

/**
 * Phase 5 — cross-cutting proofs without booting Nest: reflex lane + template utility parity and phased eligibility.
 * (Risky-path reflex gates are covered in {@link malv-reflex-turn.util.spec.ts}.)
 */
describe("Phase 5 chat path integrity", () => {
  const baseGates = {
    superFix: false,
    vaultSessionId: null as string | null,
    operatorPhase: null as string | null,
    exploreHandoffJson: null as string | null,
    modeType: "analyze" as const,
    inputMode: "text" as const
  };

  const tone = mergeExplicitMoodHint(analyzeUserTone("hey"), null);

  it("reflex template output is stable for the same kind + thread (parity with reflex lane utility)", () => {
    const kind = classifyMalvReflexTurn("thanks!", baseGates);
    expect(kind?.kind).toBe("light_social");
    const priorMessages = [{ role: "user", content: "earlier" }] as const;
    const priorAssistantTexts: string[] = [];
    const a = buildDeterministicTemplateShortCircuit({
      reflexKind: kind!,
      userMessage: "thanks!",
      priorMessages,
      priorAssistantTexts,
      conversationId: "c1",
      toneAnalysis: tone,
      isFirstThreadTurn: false
    });
    const b = buildDeterministicTemplateShortCircuit({
      reflexKind: kind!,
      userMessage: "thanks!",
      priorMessages,
      priorAssistantTexts,
      conversationId: "c1",
      toneAnalysis: tone,
      isFirstThreadTurn: false
    });
    expect(a.reply).toBe(b.reply);
    expect(a.malvReplySource).toBe("malv_light_social_short_circuit");
  });

  it("phased eligibility does not depend on WebSocket vs HTTP (no stream flag)", () => {
    const eligible = malvServerPhasedOrchestrationEligible({
      phasedModuleEnabled: true,
      executionStrategyMode: "phased",
      superFix: false,
      internalPhaseCount: 2
    });
    expect(eligible).toBe(true);
  });
});

import { CodingIntelligenceService } from "./layers/coding-intelligence.service";
import { CommunicationIntelligenceService } from "./layers/communication-intelligence.service";
import { ContextualIntelligenceService } from "./layers/contextual-intelligence.service";
import { ConversationalIntelligenceService } from "./layers/conversational-intelligence.service";
import { DebuggingIntelligenceService } from "./layers/debugging-intelligence.service";
import { EmotionalIntelligenceService } from "./layers/emotional-intelligence.service";
import { ExecutionIntelligenceService } from "./layers/execution-intelligence.service";
import { FileMultimodalIntelligenceService } from "./layers/file-multimodal-intelligence.service";
import { MemoryIntelligenceService } from "./layers/memory-intelligence.service";
import { ResearchWebIntelligenceService } from "./layers/research-web-intelligence.service";
import { ReviewCritiqueIntelligenceService } from "./layers/review-critique-intelligence.service";
import { SocialIntelligenceService } from "./layers/social-intelligence.service";
import { SynthesisIntelligenceService } from "./layers/synthesis-intelligence.service";
import { UncertaintyIntelligenceService } from "./layers/uncertainty-intelligence.service";

describe("tier1 layer services", () => {
  const baseInput = {
    urgency: "medium",
    riskTier: "medium",
    modeType: "fix",
    tone: "technical",
    scopeSize: "medium",
    evidenceLevel: "partial",
    requestText: "Fix this typescript test failure and research source",
    hasFiles: true,
    memoryHint: true
  } as const;

  it("classifies emotional/social/conversational posture", () => {
    expect(new EmotionalIntelligenceService().analyze({ ...baseInput, tone: "confused" }).emotionalStateEstimate).toBe("confused");
    expect(new SocialIntelligenceService().analyze({ ...baseInput, tone: "emotional" }).empathyNeed).toBe("high");
    expect(new ConversationalIntelligenceService().analyze(baseInput).conversationMode).toBe("qa");
  });

  it("adapts communication and contextual outputs", () => {
    expect(new CommunicationIntelligenceService().analyze({ ...baseInput, urgency: "high" }).pacingMode).toBe("fast");
    const contextual = new ContextualIntelligenceService().analyze({
      ...baseInput,
      riskTier: "high",
      requestText: "this is still failing again"
    });
    expect(contextual.situationalPriority).toBe("safety");
    expect(contextual.stateModel?.repetitionSignals).toBe("clear");
  });

  it("routes coding/debug/review signals", () => {
    expect(new CodingIntelligenceService().analyze(baseInput).languageProfile[0]).toBe("typescript");
    expect(new DebuggingIntelligenceService().analyze(baseInput).failureClassification).toBe("test");
    expect(new ReviewCritiqueIntelligenceService().analyze({ ...baseInput, riskTier: "high" }).releaseReadinessEstimate).toBe("needs_checks");
  });

  it("classifies uncertainty/file-memory/research outputs", () => {
    expect(new UncertaintyIntelligenceService().analyze({ ...baseInput, evidenceLevel: "weak", riskTier: "high" }).certaintyClass).toBe("unknown");
    expect(new FileMultimodalIntelligenceService().analyze(baseInput).modalityProfile).toContain("document_or_media");
    expect(new MemoryIntelligenceService().analyze(baseInput).memoryDecision).toBe("retrieve");
    expect(new ResearchWebIntelligenceService().analyze(baseInput).researchIntent).toBe("investigate");
  });

  it("blocks execution when uncertainty is high", () => {
    const execution = new ExecutionIntelligenceService().analyze(
      { ...baseInput, evidenceLevel: "weak", riskTier: "high", scopeSize: "large" },
      { uncertaintyValidationNeeded: true, debugDetected: true }
    );
    expect(execution.executionReadiness).toBe("blocked");
    expect(execution.requiresApproval).toBe(true);
  });

  it("detects research contradictions and synthesis tensions", () => {
    const research = new ResearchWebIntelligenceService().analyze({
      ...baseInput,
      requestText: "research this but sources contradict each other",
      evidenceLevel: "weak"
    });
    expect(research.contradictionNotes.length).toBeGreaterThan(0);
    const synthesis = new SynthesisIntelligenceService().analyze(baseInput, {
      analyticalNextStep: "prepare_execution_path",
      uncertaintyClass: "unknown",
      researchReliability: "unknown"
    });
    expect(synthesis.conflictBetweenSignals?.length).toBeGreaterThan(0);
  });
});

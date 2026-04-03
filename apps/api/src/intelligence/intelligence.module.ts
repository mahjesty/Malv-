import { Module } from "@nestjs/common";
import { ConflictPolicyService } from "./conflict-policy.service";
import { MetaIntelligenceRouterService } from "./meta-intelligence-router.service";
import { ResponsePolicyService } from "./response-policy.service";
import { AnalyticalIntelligenceService } from "./layers/analytical-intelligence.service";
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
import { TrustSafetyIntelligenceService } from "./layers/trust-safety-intelligence.service";
import { UncertaintyIntelligenceService } from "./layers/uncertainty-intelligence.service";
import { CallIntelligenceService } from "./layers/call-intelligence.service";
import { VoicePresenceService } from "./layers/voice-presence.service";
import { DeviceIntelligenceService } from "./layers/device-intelligence.service";
import { BridgeRoutingService } from "./layers/bridge-routing.service";
import { ExternalExecutionService } from "./layers/external-execution.service";
import { ContinuityIntelligenceService } from "./layers/continuity-intelligence.service";
import { ConfidenceEngineService } from "./confidence-engine.service";
import { ContinuityBridgeService } from "./continuity-bridge.service";

@Module({
  providers: [
    MetaIntelligenceRouterService,
    ConflictPolicyService,
    ResponsePolicyService,
    EmotionalIntelligenceService,
    SocialIntelligenceService,
    ConversationalIntelligenceService,
    CommunicationIntelligenceService,
    AnalyticalIntelligenceService,
    SynthesisIntelligenceService,
    UncertaintyIntelligenceService,
    ContextualIntelligenceService,
    CodingIntelligenceService,
    DebuggingIntelligenceService,
    ReviewCritiqueIntelligenceService,
    ExecutionIntelligenceService,
    FileMultimodalIntelligenceService,
    MemoryIntelligenceService,
    TrustSafetyIntelligenceService,
    ResearchWebIntelligenceService,
    CallIntelligenceService,
    VoicePresenceService,
    DeviceIntelligenceService,
    BridgeRoutingService,
    ExternalExecutionService,
    ContinuityIntelligenceService,
    ConfidenceEngineService,
    ContinuityBridgeService
  ],
  exports: [MetaIntelligenceRouterService, ConflictPolicyService, ResponsePolicyService, ContinuityBridgeService, ConfidenceEngineService]
})
export class IntelligenceModule {}

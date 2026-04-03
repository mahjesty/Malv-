import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChangeRequestEntity } from "../db/entities/change-request.entity";
import { ChangeAuditEntity } from "../db/entities/change-audit.entity";
import { ChangePlanEntity } from "../db/entities/change-plan.entity";
import { ChangeExecutionRunEntity } from "../db/entities/change-execution-run.entity";
import { ChangeVerificationReportEntity } from "../db/entities/change-verification-report.entity";
import { ChangePatchReviewEntity } from "../db/entities/change-patch-review.entity";
import { IntelligenceLearningMemoryEntity } from "../db/entities/intelligence-learning-memory.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { CodeChangeIntelligenceController } from "./code-change-intelligence.controller";
import { CodeChangeIntelligenceService } from "./code-change-intelligence.service";
import { CodebaseAuditService } from "./codebase-audit.service";
import { CodeGraphService } from "./code-graph.service";
import { ChangePlanningService } from "./change-planning.service";
import { ChangeVerificationService } from "./change-verification.service";
import { PatchReviewService } from "./patch-review.service";
import { FrontendDesignAuditService } from "./frontend-design-audit.service";
import { DesignCritiqueService } from "./frontend-design-critique.service";
import { DesignSystemIntelligenceService } from "./design-system-intelligence.service";
import { DesignTasteEngine } from "./design-taste-engine";
import { VisualCompositionService } from "./visual-composition.service";
import { MotionDesignService } from "./motion-design.service";
import { BugDetectionService } from "./bug-detection.service";
import { PerformanceIntelligenceService } from "./performance-intelligence.service";
import { FixPlanningService } from "./fix-planning.service";
import { IntelligenceLearningService } from "./intelligence-learning.service";
import { SecurityModule } from "../security/security.module";
import { BeastModule } from "../beast/beast.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RenderedUiReviewService } from "./rendered-ui-review.service";
import { UiVisualCritiqueService } from "./ui-visual-critique.service";
import { MalvModelAssistGateService } from "./model-readiness/malv-model-assist.gate.service";
import { MalvIntelligenceArtifactService } from "./model-readiness/malv-intelligence-artifact.service";
import {
  MALV_PLANNING_PROVIDER,
  MALV_REASONING_PROVIDER,
  MALV_VISION_CRITIQUE_PROVIDER
} from "./model-readiness/malv-intelligence-providers";
import {
  BeastWorkerMalvPlanningProvider,
  BeastWorkerMalvReasoningProvider,
  DelegatingRenderedUiVisionCritiqueProvider
} from "./model-readiness/beast-worker-malv-intelligence-providers.service";
import { MalvChatCciHandoffService } from "./malv-chat-cci-handoff.service";
import { SandboxModule } from "../sandbox/sandbox.module";
import { CciValidationExecutionBridge } from "./cci-validation-execution.bridge";
import { CciAutoDebugLoopService } from "./cci-auto-debug-loop.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    forwardRef(() => CommonModule),
    forwardRef(() => SecurityModule),
    forwardRef(() => BeastModule),
    forwardRef(() => WorkspaceModule),
    forwardRef(() => SandboxModule),
    forwardRef(() => AuthModule),
    KillSwitchModule,
    forwardRef(() => RealtimeModule),
    TypeOrmModule.forFeature([
      ChangeRequestEntity,
      ChangeAuditEntity,
      ChangePlanEntity,
      ChangeExecutionRunEntity,
      ChangeVerificationReportEntity,
      ChangePatchReviewEntity,
      IntelligenceLearningMemoryEntity,
      AuditEventEntity
    ])
  ],
  controllers: [CodeChangeIntelligenceController],
  providers: [
    CodeChangeIntelligenceService,
    CodeGraphService,
    CodebaseAuditService,
    FrontendDesignAuditService,
    DesignSystemIntelligenceService,
    DesignTasteEngine,
    VisualCompositionService,
    MotionDesignService,
    DesignCritiqueService,
    BugDetectionService,
    PerformanceIntelligenceService,
    FixPlanningService,
    IntelligenceLearningService,
    ChangePlanningService,
    ChangeVerificationService,
    RenderedUiReviewService,
    UiVisualCritiqueService,
    PatchReviewService,
    MalvModelAssistGateService,
    MalvIntelligenceArtifactService,
    BeastWorkerMalvReasoningProvider,
    BeastWorkerMalvPlanningProvider,
    DelegatingRenderedUiVisionCritiqueProvider,
    { provide: MALV_REASONING_PROVIDER, useExisting: BeastWorkerMalvReasoningProvider },
    { provide: MALV_PLANNING_PROVIDER, useExisting: BeastWorkerMalvPlanningProvider },
    { provide: MALV_VISION_CRITIQUE_PROVIDER, useExisting: DelegatingRenderedUiVisionCritiqueProvider },
    MalvChatCciHandoffService,
    CciValidationExecutionBridge,
    CciAutoDebugLoopService
  ],
  exports: [CodeChangeIntelligenceService, MalvChatCciHandoffService]
})
export class CodeChangeIntelligenceModule {}

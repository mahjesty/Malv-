import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BeastOrchestratorService } from "./beast.orchestrator.service";
import { MalvOperatorFallbackBrainService } from "./malv-operator-fallback-brain.service";
import { BeastWorkerClient } from "./client/beast-worker.client";
import { ChatContextAssemblyService } from "./chat-context-assembly.service";
import { BeastOperatorController } from "./beast-operator.controller";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { AiWorkerEntity } from "../db/entities/ai-worker.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { VaultSessionEntity } from "../db/entities/vault-session.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceApprovalItemEntity } from "../db/entities/workspace-approval-item.entity";
import { MemoryModule } from "../memory/memory.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SandboxModule } from "../sandbox/sandbox.module";
import { ImprovementModule } from "../improvement/improvement.module";
import { IntentUnderstandingService } from "./intent-understanding.service";
import { ExecutionStrategyService } from "./execution-strategy.service";
import { PhasedChatOrchestrationService } from "./phased-chat-orchestration.service";
import { IntentDecompositionService } from "./intent-decomposition.service";
import { CodeChangeIntelligenceModule } from "../code-change-intelligence/code-change-intelligence.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { WorkspaceModule } from "../workspace/workspace.module";

@Module({
  imports: [
    ConfigModule,
    KillSwitchModule,
    MemoryModule,
    forwardRef(() => WorkspaceModule),
    forwardRef(() => SandboxModule),
    ImprovementModule,
    IntelligenceModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => CodeChangeIntelligenceModule),
    TypeOrmModule.forFeature([
      AiWorkerEntity,
      AiJobEntity,
      SuggestionRecordEntity,
      BeastActivityLogEntity,
      ConversationEntity,
      MessageEntity,
      VaultSessionEntity,
      CollaborationRoomEntity,
      RoomMemberEntity,
      WorkspaceTaskEntity,
      WorkspaceApprovalItemEntity
    ])
  ],
  controllers: [BeastOperatorController],
  providers: [
    BeastOrchestratorService,
    BeastWorkerClient,
    MalvOperatorFallbackBrainService,
    ChatContextAssemblyService,
    IntentUnderstandingService,
    ExecutionStrategyService,
    PhasedChatOrchestrationService,
    IntentDecompositionService
  ],
  exports: [BeastOrchestratorService, BeastWorkerClient]
})
export class BeastModule {}


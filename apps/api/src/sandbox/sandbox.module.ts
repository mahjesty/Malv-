import { forwardRef, Module } from "@nestjs/common";
import { SecurityModule } from "../security/security.module";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SandboxExecutionService } from "./sandbox-execution.service";
import { OperatorRuntimeService } from "./operator-runtime.service";
import { RuntimePolicyService } from "./runtime-policy.service";
import { SandboxIsolationProvider } from "./sandbox-isolation.provider";
import { SandboxController } from "./sandbox.controller";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { FileEntity } from "../db/entities/file.entity";
import { FileContextEntity } from "../db/entities/file-context.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { FileChunkEntity } from "../db/entities/file-chunk.entity";
import { FileEmbeddingEntity } from "../db/entities/file-embedding.entity";
import { SandboxPolicyDecisionEntity } from "../db/entities/sandbox-policy-decision.entity";
import { PolicyDefinitionEntity } from "../db/entities/policy-definition.entity";
import { PolicyVersionEntity } from "../db/entities/policy-version.entity";
import { SandboxRunPolicyBindingEntity } from "../db/entities/sandbox-run-policy-binding.entity";
import { SandboxCommandPolicyDecisionEntity } from "../db/entities/sandbox-command-policy-decision.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { SandboxTypedActionEntity } from "../db/entities/sandbox-typed-action.entity";
import { SandboxTypedActionPolicyDecisionEntity } from "../db/entities/sandbox-typed-action-policy-decision.entity";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ImprovementModule } from "../improvement/improvement.module";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CommonModule),
    WorkspaceModule,
    ImprovementModule,
    KillSwitchModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => SecurityModule),
    TypeOrmModule.forFeature([
      AiJobEntity,
      SandboxRunEntity,
      FileEntity,
      FileContextEntity,
      AuditEventEntity,
      BeastActivityLogEntity,
      SuggestionRecordEntity,
      SandboxCommandRecordEntity,
      SandboxPatchProposalEntity,
      FileChunkEntity,
      FileEmbeddingEntity,
      SandboxPolicyDecisionEntity,
      PolicyDefinitionEntity,
      PolicyVersionEntity,
      SandboxRunPolicyBindingEntity,
      SandboxCommandPolicyDecisionEntity,
      SandboxApprovalRequestEntity,
      SandboxTypedActionEntity,
      SandboxTypedActionPolicyDecisionEntity
    ])
  ],
  controllers: [SandboxController],
  providers: [SandboxExecutionService, OperatorRuntimeService, RuntimePolicyService, SandboxIsolationProvider],
  exports: [SandboxExecutionService, RuntimePolicyService, SandboxIsolationProvider]
})
export class SandboxModule {}


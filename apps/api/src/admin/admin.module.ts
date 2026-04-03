import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminRuntimeController } from "./admin-runtime.controller";
import { AdminImprovementsController } from "./admin-improvements.controller";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { SandboxRunPolicyBindingEntity } from "../db/entities/sandbox-run-policy-binding.entity";
import { SandboxCommandPolicyDecisionEntity } from "../db/entities/sandbox-command-policy-decision.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { PolicyDefinitionEntity } from "../db/entities/policy-definition.entity";
import { PolicyVersionEntity } from "../db/entities/policy-version.entity";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { VoiceOperatorEventEntity } from "../db/entities/voice-operator-event.entity";
import { ReviewSessionEntity } from "../db/entities/review-session.entity";
import { ReviewFindingEntity } from "../db/entities/review-finding.entity";
import { SandboxTypedActionEntity } from "../db/entities/sandbox-typed-action.entity";
import { SandboxTypedActionPolicyDecisionEntity } from "../db/entities/sandbox-typed-action-policy-decision.entity";
import { RateLimitEventEntity } from "../db/entities/rate-limit-event.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { BeastModule } from "../beast/beast.module";
import { ImprovementModule } from "../improvement/improvement.module";
import { SelfUpgradeModule } from "../self-upgrade/self-upgrade.module";
import { SecurityModule } from "../security/security.module";
import { InfrastructureModule } from "../infra/infrastructure.module";
import { SecurityAuditEventEntity } from "../db/entities/security-audit-event.entity";
import { ChangeRequestEntity } from "../db/entities/change-request.entity";
import { AdminSecurityController } from "./admin-security.controller";

@Module({
  imports: [
    AuthModule,
    CommonModule,
    KillSwitchModule,
    ImprovementModule,
    SelfUpgradeModule,
    SecurityModule,
    forwardRef(() => BeastModule),
    InfrastructureModule,
    TypeOrmModule.forFeature([
      SandboxRunEntity,
      SandboxCommandRecordEntity,
      SandboxPatchProposalEntity,
      SandboxRunPolicyBindingEntity,
      SandboxCommandPolicyDecisionEntity,
      AiJobLeaseEntity,
      PolicyDefinitionEntity,
      PolicyVersionEntity,
      AiJobEntity,
      SandboxApprovalRequestEntity,
      VoiceOperatorEventEntity,
      ReviewSessionEntity,
      ReviewFindingEntity,
      SandboxTypedActionEntity,
      SandboxTypedActionPolicyDecisionEntity,
      RateLimitEventEntity,
      AuditEventEntity,
      SecurityAuditEventEntity,
      ChangeRequestEntity
    ])
  ],
  controllers: [AdminRuntimeController, AdminImprovementsController, AdminSecurityController]
})
export class AdminModule {}


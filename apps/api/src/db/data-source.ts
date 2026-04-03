import "../envload";
import "reflect-metadata";
import { DataSource } from "typeorm";

import { UserEntity } from "./entities/user.entity";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RefreshTokenEntity } from "./entities/refresh-token.entity";
import { TrustedDeviceEntity } from "./entities/trusted-device.entity";
import { KillSwitchEventEntity } from "./entities/kill-switch-event.entity";
import { SessionEntity } from "./entities/session.entity";
import { VerificationTokenEntity } from "./entities/verification-token.entity";
import { ConversationEntity } from "./entities/conversation.entity";
import { MessageEntity } from "./entities/message.entity";
import { MemoryEntryEntity } from "./entities/memory-entry.entity";
import { VaultSessionEntity } from "./entities/vault-session.entity";
import { VaultEntryEntity } from "./entities/vault-entry.entity";
import { AiWorkerEntity } from "./entities/ai-worker.entity";
import { AiJobEntity } from "./entities/ai-job.entity";
import { SuggestionRecordEntity } from "./entities/suggestion-record.entity";
import { BeastActivityLogEntity } from "./entities/beast-activity-log.entity";
import { FileEntity } from "./entities/file.entity";
import { FileContextEntity } from "./entities/file-context.entity";
import { SandboxRunEntity } from "./entities/sandbox-run.entity";
import { AuditEventEntity } from "./entities/audit-event.entity";
import { SupportTicketEntity } from "./entities/support-ticket.entity";
import { SupportCategoryEntity } from "./entities/support-category.entity";
import { SupportMessageEntity } from "./entities/support-message.entity";
import { CallSessionEntity } from "./entities/call-session.entity";
import { CallTranscriptEntity } from "./entities/call-transcript.entity";
import { SandboxCommandRecordEntity } from "./entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "./entities/sandbox-patch-proposal.entity";
import { FileChunkEntity } from "./entities/file-chunk.entity";
import { FileEmbeddingEntity } from "./entities/file-embedding.entity";
import { AiJobLeaseEntity } from "./entities/ai-job-lease.entity";
import { SandboxPolicyDecisionEntity } from "./entities/sandbox-policy-decision.entity";
import { VoiceOperatorEventEntity } from "./entities/voice-operator-event.entity";
import { PolicyDefinitionEntity } from "./entities/policy-definition.entity";
import { PolicyVersionEntity } from "./entities/policy-version.entity";
import { SandboxRunPolicyBindingEntity } from "./entities/sandbox-run-policy-binding.entity";
import { SandboxCommandPolicyDecisionEntity } from "./entities/sandbox-command-policy-decision.entity";
import { SandboxApprovalRequestEntity } from "./entities/sandbox-approval-request.entity";
import { ReviewSessionEntity } from "./entities/review-session.entity";
import { ReviewFindingEntity } from "./entities/review-finding.entity";
import { OperatorTargetEntity } from "./entities/operator-target.entity";
import { PermissionEntity } from "./entities/permission.entity";
import { RolePermissionEntity } from "./entities/role-permission.entity";
import { SandboxTypedActionEntity } from "./entities/sandbox-typed-action.entity";
import { SandboxTypedActionPolicyDecisionEntity } from "./entities/sandbox-typed-action-policy-decision.entity";
import { RateLimitEventEntity } from "./entities/rate-limit-event.entity";
import { WorkspaceEntity } from "./entities/workspace.entity";
import { WorkspaceRoleEntity } from "./entities/workspace-role.entity";
import { WorkspaceRolePermissionEntity } from "./entities/workspace-role-permission.entity";
import { WorkspaceUserRoleEntity } from "./entities/workspace-user-role.entity";
import { MultimodalExtractionEntity } from "./entities/multimodal-extraction.entity";
import { ReflectionEventEntity } from "./entities/reflection-event.entity";
import { ImprovementProposalEntity } from "./entities/improvement-proposal.entity";
import { MalvControlledConfigEntity } from "./entities/malv-controlled-config.entity";
import { SelfUpgradeRequestEntity } from "./entities/self-upgrade-request.entity";
import { SelfUpgradeAnalysisReportEntity } from "./entities/self-upgrade-analysis-report.entity";
import { SelfUpgradePatchSetEntity } from "./entities/self-upgrade-patch-set.entity";
import { SelfUpgradeReviewSessionEntity } from "./entities/self-upgrade-review-session.entity";
import { WorkspaceTaskEntity } from "./entities/workspace-task.entity";
import { WorkspaceApprovalItemEntity } from "./entities/workspace-approval-item.entity";
import { WorkspaceActivityEventEntity } from "./entities/workspace-activity-event.entity";
import { WorkspaceRuntimeSessionEntity } from "./entities/workspace-runtime-session.entity";
import { CollaborationSummaryEntity } from "./entities/collaboration-summary.entity";
import { UploadHandleEntity } from "./entities/upload-handle.entity";
import { CollaborationRoomEntity } from "./entities/collaboration-room.entity";
import { RoomMemberEntity } from "./entities/room-member.entity";
import { ChangeRequestEntity } from "./entities/change-request.entity";
import { ChangeAuditEntity } from "./entities/change-audit.entity";
import { ChangePlanEntity } from "./entities/change-plan.entity";
import { ChangeExecutionRunEntity } from "./entities/change-execution-run.entity";
import { ChangeVerificationReportEntity } from "./entities/change-verification-report.entity";
import { ChangePatchReviewEntity } from "./entities/change-patch-review.entity";
import { SecurityAuditEventEntity } from "./entities/security-audit-event.entity";
import { SecurityIncidentEntity } from "./entities/security-incident.entity";
import { SecurityIncidentEventEntity } from "./entities/security-incident-event.entity";
import { IntelligenceLearningMemoryEntity } from "./entities/intelligence-learning-memory.entity";

// Migration-first data source.
// Use this with `typeorm migration:run -d src/db/data-source.ts`.
export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "malv",
  ssl: process.env.DB_SSL === "true" ? ({} as any) : false,
  synchronize: false,
  logging: process.env.NODE_ENV === "development",
  entities: [
    UserEntity,
    RoleEntity,
    PermissionEntity,
    RolePermissionEntity,
    UserRoleEntity,
    RefreshTokenEntity,
    TrustedDeviceEntity,
    KillSwitchEventEntity,
    SessionEntity,
    VerificationTokenEntity,
    ConversationEntity,
    MessageEntity,
    MemoryEntryEntity,
    VaultSessionEntity,
    VaultEntryEntity,
    AiWorkerEntity,
    AiJobEntity,
    SuggestionRecordEntity,
    BeastActivityLogEntity,
    FileEntity,
    FileContextEntity,
    SandboxRunEntity,
    AuditEventEntity,
    SupportTicketEntity,
    SupportCategoryEntity,
    SupportMessageEntity,
    CallSessionEntity,
    CallTranscriptEntity,
    SandboxCommandRecordEntity,
    SandboxPatchProposalEntity,
    FileChunkEntity,
    FileEmbeddingEntity,
    AiJobLeaseEntity,
    SandboxPolicyDecisionEntity,
    VoiceOperatorEventEntity,
    PolicyDefinitionEntity,
    PolicyVersionEntity,
    SandboxRunPolicyBindingEntity,
    SandboxCommandPolicyDecisionEntity,
    SandboxApprovalRequestEntity,
    SandboxTypedActionEntity,
    SandboxTypedActionPolicyDecisionEntity,
    RateLimitEventEntity,
    ReviewSessionEntity,
    ReviewFindingEntity,
    OperatorTargetEntity,
    WorkspaceEntity,
    WorkspaceRoleEntity,
    WorkspaceUserRoleEntity,
    WorkspaceRolePermissionEntity,
    MultimodalExtractionEntity,
    ReflectionEventEntity,
    ImprovementProposalEntity,
    MalvControlledConfigEntity,
    SelfUpgradeRequestEntity,
    SelfUpgradeAnalysisReportEntity,
    SelfUpgradePatchSetEntity,
    SelfUpgradeReviewSessionEntity,
    WorkspaceTaskEntity,
    WorkspaceApprovalItemEntity,
    WorkspaceActivityEventEntity,
    WorkspaceRuntimeSessionEntity,
    CollaborationRoomEntity,
    RoomMemberEntity,
    CollaborationSummaryEntity,
    UploadHandleEntity,
    ChangeRequestEntity,
    ChangeAuditEntity,
    ChangePlanEntity,
    ChangeExecutionRunEntity,
    ChangeVerificationReportEntity,
    ChangePatchReviewEntity,
    SecurityAuditEventEntity,
    SecurityIncidentEntity,
    SecurityIncidentEventEntity,
    IntelligenceLearningMemoryEntity
  ],
  migrations: ["src/db/migrations/*.ts"]
});


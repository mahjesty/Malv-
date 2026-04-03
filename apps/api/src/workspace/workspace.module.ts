import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { PermissionEntity } from "../db/entities/permission.entity";
import { WorkspaceEntity } from "../db/entities/workspace.entity";
import { WorkspaceRoleEntity } from "../db/entities/workspace-role.entity";
import { WorkspaceRolePermissionEntity } from "../db/entities/workspace-role-permission.entity";
import { WorkspaceUserRoleEntity } from "../db/entities/workspace-user-role.entity";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspaceProvisioningService } from "./workspace-provisioning.service";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceApprovalItemEntity } from "../db/entities/workspace-approval-item.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { CallSessionEntity } from "../db/entities/call-session.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { WorkspaceProductivityService } from "./workspace-productivity.service";
import { WorkspaceProductivityController } from "./workspace-productivity.controller";
import { WorkspaceActivityEventEntity } from "../db/entities/workspace-activity-event.entity";
import { WorkspaceActivityService } from "./workspace-activity.service";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { WorkspaceRuntimeSessionEntity } from "../db/entities/workspace-runtime-session.entity";
import { WorkspaceRuntimeSessionService } from "./workspace-runtime-session.service";
import { WorkspaceRuntimeSessionController } from "./workspace-runtime-session.controller";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";

@Module({
  imports: [
    forwardRef(() => CommonModule),
    forwardRef(() => RealtimeModule),
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      WorkspaceRoleEntity,
      WorkspaceUserRoleEntity,
      WorkspaceRolePermissionEntity,
      PermissionEntity,
      AuditEventEntity,
      WorkspaceTaskEntity,
      WorkspaceApprovalItemEntity,
      SandboxApprovalRequestEntity,
      ConversationEntity,
      CallSessionEntity,
      MessageEntity,
      WorkspaceActivityEventEntity,
      WorkspaceRuntimeSessionEntity,
      SandboxRunEntity,
      SandboxCommandRecordEntity,
      SandboxPatchProposalEntity,
      MalvStudioSessionEntity
    ])
  ],
  controllers: [WorkspaceController, WorkspaceProductivityController, WorkspaceRuntimeSessionController],
  providers: [
    WorkspaceAccessService,
    WorkspaceProvisioningService,
    WorkspaceProductivityService,
    WorkspaceActivityService,
    WorkspaceRuntimeSessionService
  ],
  exports: [
    WorkspaceAccessService,
    WorkspaceProvisioningService,
    WorkspaceProductivityService,
    WorkspaceActivityService,
    WorkspaceRuntimeSessionService
  ]
})
export class WorkspaceModule {}

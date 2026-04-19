import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";
import { CallSessionEntity } from "../db/entities/call-session.entity";
import { CallTranscriptEntity } from "../db/entities/call-transcript.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { VaultSessionEntity } from "../db/entities/vault-session.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { BeastModule } from "../beast/beast.module";
import { InferenceModule } from "../inference/inference.module";
import { MessageEntity } from "../db/entities/message.entity";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceModule } from "../workspace/workspace.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CallSessionEntity, CallTranscriptEntity, ConversationEntity, VaultSessionEntity, AuditEventEntity, MessageEntity, WorkspaceTaskEntity]),
    KillSwitchModule,
    forwardRef(() => CommonModule),
    forwardRef(() => BeastModule),
    forwardRef(() => InferenceModule),
    forwardRef(() => WorkspaceModule),
    forwardRef(() => RealtimeModule)
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService]
})
export class CallsModule {}


import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { UserEntity } from "../db/entities/user.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { CollaborationSummaryEntity } from "../db/entities/collaboration-summary.entity";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { CollaborationSummaryService } from "./collaboration-summary.service";
import { RealtimeModule } from "../realtime/realtime.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CollaborationRoomEntity, RoomMemberEntity, UserEntity, ConversationEntity, MessageEntity, CollaborationSummaryEntity]),
    KillSwitchModule,
    forwardRef(() => CommonModule),
    forwardRef(() => RealtimeModule),
    forwardRef(() => WorkspaceModule)
  ],
  controllers: [DirectoryController, RoomsController],
  providers: [DirectoryService, RoomsService, CollaborationSummaryService, JwtAuthGuard],
  exports: [DirectoryService, RoomsService, CollaborationSummaryService]
})
export class CollaborationModule {}

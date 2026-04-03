import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity, CollaborationRoomEntity, RoomMemberEntity]),
    KillSwitchModule,
    AuthModule
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService]
})
export class ConversationsModule {}

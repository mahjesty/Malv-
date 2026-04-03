import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConversationEntity } from "../../db/entities/conversation.entity";
import { CollaborationRoomEntity } from "../../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../../db/entities/room-member.entity";
import { ConversationAccessService } from "./conversation-access.service";

@Module({
  imports: [TypeOrmModule.forFeature([ConversationEntity, CollaborationRoomEntity, RoomMemberEntity])],
  providers: [ConversationAccessService],
  exports: [ConversationAccessService, TypeOrmModule]
})
export class ConversationAccessModule {}

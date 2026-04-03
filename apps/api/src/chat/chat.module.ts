import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatRunRegistryService } from "./chat-run-registry.service";
import { BeastModule } from "../beast/beast.module";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { InferenceModule } from "../inference/inference.module";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { CollaborationModule } from "../collaboration/collaboration.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity, CollaborationRoomEntity, RoomMemberEntity]),
    KillSwitchModule,
    forwardRef(() => CommonModule),
    forwardRef(() => BeastModule),
    forwardRef(() => CollaborationModule),
    forwardRef(() => RealtimeModule),
    InferenceModule
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRunRegistryService, JwtAuthGuard],
  exports: [ChatService, ChatRunRegistryService]
})
export class ChatModule {}


import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { FileUnderstandingService } from "./file-understanding.service";
import { FileUnderstandingController } from "./file-understanding.controller";
import { RetrievalService } from "./retrieval.service";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { BeastModule } from "../beast/beast.module";

import { FileEntity } from "../db/entities/file.entity";
import { FileContextEntity } from "../db/entities/file-context.entity";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { VaultSessionEntity } from "../db/entities/vault-session.entity";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { FileChunkEntity } from "../db/entities/file-chunk.entity";
import { FileEmbeddingEntity } from "../db/entities/file-embedding.entity";
import { MultimodalExtractionEntity } from "../db/entities/multimodal-extraction.entity";
import { MultimodalDeepExtractService } from "./multimodal-deep-extract.service";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { UploadHandleEntity } from "../db/entities/upload-handle.entity";

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    WorkspaceModule,
    BeastModule,
    KillSwitchModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      FileEntity,
      FileContextEntity,
      AiJobEntity,
      ConversationEntity,
      VaultSessionEntity,
      SupportTicketEntity,
      FileChunkEntity,
      FileEmbeddingEntity,
      MultimodalExtractionEntity,
      CollaborationRoomEntity,
      RoomMemberEntity,
      UploadHandleEntity
    ])
  ],
  controllers: [FileUnderstandingController],
  providers: [FileUnderstandingService, RetrievalService, MultimodalDeepExtractService],
  exports: [FileUnderstandingService, RetrievalService, MultimodalDeepExtractService]
})
export class FileUnderstandingModule {}


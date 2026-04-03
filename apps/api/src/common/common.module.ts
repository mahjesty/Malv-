import { forwardRef, Module } from "@nestjs/common";
import { SecurityModule } from "../security/security.module";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RateLimitService } from "./rate-limit/rate-limit.service";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";
import { RateLimitEventEntity } from "../db/entities/rate-limit-event.entity";
import { MalvFeatureFlagsService } from "./malv-feature-flags.service";
import { AuthorizationService } from "./authorization/authorization.service";
import { RoomMemberEntity } from "../db/entities/room-member.entity";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { CallSessionEntity } from "../db/entities/call-session.entity";
import { FileEntity } from "../db/entities/file.entity";
import { ObservabilityService } from "./observability.service";
import { MetricsController } from "./metrics.controller";
import { RuntimeEventBusService } from "./runtime-event-bus.service";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SecurityModule),
    TypeOrmModule.forFeature([RateLimitEventEntity, RoomMemberEntity, CollaborationRoomEntity, CallSessionEntity, FileEntity])
  ],
  controllers: [MetricsController],
  providers: [RateLimitService, RateLimitGuard, MalvFeatureFlagsService, AuthorizationService, ObservabilityService, RuntimeEventBusService],
  exports: [RateLimitService, RateLimitGuard, MalvFeatureFlagsService, AuthorizationService, ObservabilityService, RuntimeEventBusService]
})
export class CommonModule {}

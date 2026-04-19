import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { RealtimeModule } from "../realtime/realtime.module";
import { SmartHomeModule } from "../smart-home/smart-home.module";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { MalvUserExecutorEnrollmentEntity } from "../db/entities/malv-user-executor-enrollment.entity";
import { MalvUserNotificationEntity } from "../db/entities/malv-user-notification.entity";
import { MalvUserContinuityStateEntity } from "../db/entities/malv-user-continuity-state.entity";
import { MalvExternalActionDispatchEntity } from "../db/entities/malv-external-action-dispatch.entity";
import { MalvExecutorEnrollmentService } from "./malv-executor-enrollment.service";
import { MalvBridgeCapabilityResolverService } from "./malv-bridge-capability-resolver.service";
import { MalvNotificationDeliveryService } from "./malv-notification-delivery.service";
import { MalvContinuityPersistenceService } from "./malv-continuity-persistence.service";
import { MalvExternalActionDispatchService } from "./malv-external-action-dispatch.service";
import { MalvPushTokenRegistryService } from "./malv-push-token-registry.service";
import { MalvPushProviderService } from "./malv-push-provider.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      MalvUserExecutorEnrollmentEntity,
      MalvUserNotificationEntity,
      MalvUserContinuityStateEntity,
      MalvExternalActionDispatchEntity
    ]),
    forwardRef(() => RealtimeModule),
    SmartHomeModule,
    KillSwitchModule
  ],
  providers: [
    MalvExecutorEnrollmentService,
    MalvBridgeCapabilityResolverService,
    MalvNotificationDeliveryService,
    MalvPushTokenRegistryService,
    MalvPushProviderService,
    MalvContinuityPersistenceService,
    MalvExternalActionDispatchService
  ],
  exports: [
    MalvExecutorEnrollmentService,
    MalvBridgeCapabilityResolverService,
    MalvNotificationDeliveryService,
    MalvPushTokenRegistryService,
    MalvPushProviderService,
    MalvContinuityPersistenceService,
    MalvExternalActionDispatchService
  ]
})
export class ExecutionBridgeModule {}

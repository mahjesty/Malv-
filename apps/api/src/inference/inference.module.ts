import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BeastModule } from "../beast/beast.module";
import { CommonModule } from "../common/common.module";
import { InferenceBackendSettingsEntity } from "../db/entities/inference-backend-settings.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { InferenceConfigService } from "./inference-config.service";
import { InferenceRoutingService } from "./inference-routing.service";
import { MalvInferenceTierCapabilityService } from "./malv-inference-tier-capability.service";
import { LocalInferenceProvider } from "./local-inference.provider";
import { InferenceSettingsService } from "./inference-settings.service";
import { InferenceAdminController } from "./inference-admin.controller";
import { InferenceInternalController } from "./inference-internal.controller";
import { InferenceHealthController } from "./inference-health.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([InferenceBackendSettingsEntity, AuditEventEntity]),
    forwardRef(() => BeastModule),
    forwardRef(() => CommonModule)
  ],
  controllers: [InferenceAdminController, InferenceInternalController, InferenceHealthController],
  providers: [
    InferenceConfigService,
    InferenceSettingsService,
    MalvInferenceTierCapabilityService,
    InferenceRoutingService,
    LocalInferenceProvider
  ],
  exports: [InferenceConfigService, InferenceRoutingService, MalvInferenceTierCapabilityService, LocalInferenceProvider]
})
export class InferenceModule {}


import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { SecurityAuditEventEntity } from "../db/entities/security-audit-event.entity";
import { SecurityIncidentEntity } from "../db/entities/security-incident.entity";
import { SecurityIncidentEventEntity } from "../db/entities/security-incident-event.entity";
import { SecurityEventService } from "./security-event.service";
import { SecurityEventSinkService } from "./security-event-sink.service";
import { SecurityAlertService } from "./security-alert.service";
import { SecurityRetentionService } from "./security-retention.service";
import { SecurityIncidentService } from "./security-incident.service";
import { SecuritySummaryService } from "./security-summary.service";
import { SecuritySignalService } from "./security-signal.service";
import { SecurityPostureService } from "./security-posture.service";
import { SandboxModule } from "../sandbox/sandbox.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SecurityAuditEventEntity, SecurityIncidentEntity, SecurityIncidentEventEntity]),
    forwardRef(() => SandboxModule)
  ],
  providers: [
    SecurityEventSinkService,
    SecurityAlertService,
    SecurityRetentionService,
    SecurityIncidentService,
    SecurityEventService,
    SecuritySignalService,
    SecurityPostureService,
    SecuritySummaryService
  ],
  exports: [
    SecurityEventSinkService,
    SecurityAlertService,
    SecurityRetentionService,
    SecurityIncidentService,
    SecurityEventService,
    SecuritySignalService,
    SecurityPostureService,
    SecuritySummaryService
  ]
})
export class SecurityModule {}

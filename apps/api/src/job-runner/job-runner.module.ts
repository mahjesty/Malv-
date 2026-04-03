import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SandboxModule } from "../sandbox/sandbox.module";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { MemoryEntryEntity } from "../db/entities/memory-entry.entity";
import { FileContextEntity } from "../db/entities/file-context.entity";
import { AiWorkerEntity } from "../db/entities/ai-worker.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { SandboxApprovalRequestEntity } from "../db/entities/sandbox-approval-request.entity";
import { RateLimitEventEntity } from "../db/entities/rate-limit-event.entity";
import { BackgroundJobRunnerService } from "./job-runner.service";
import { FileUnderstandingModule } from "../file-understanding/file-understanding.module";
import { CommonModule } from "../common/common.module";
import { InfrastructureModule } from "../infra/infrastructure.module";

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    InfrastructureModule,
    KillSwitchModule,
    RealtimeModule,
    SandboxModule,
    FileUnderstandingModule,
    TypeOrmModule.forFeature([
      AiJobEntity,
      SandboxRunEntity,
      SuggestionRecordEntity,
      BeastActivityLogEntity,
      MemoryEntryEntity,
      FileContextEntity,
      AiWorkerEntity,
      AiJobLeaseEntity,
      SandboxApprovalRequestEntity,
      RateLimitEventEntity
    ])
  ],
  providers: [BackgroundJobRunnerService],
  exports: [BackgroundJobRunnerService]
})
export class JobRunnerModule {}


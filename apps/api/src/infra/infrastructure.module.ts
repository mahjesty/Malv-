import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ClusterLeaderService } from "./cluster-leader.service";
import { InfraHealthService } from "./infra-health.service";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AiJobEntity, AiJobLeaseEntity, SandboxRunEntity])],
  providers: [ClusterLeaderService, InfraHealthService],
  exports: [ClusterLeaderService, InfraHealthService]
})
export class InfrastructureModule {}

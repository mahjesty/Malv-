import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { SelfUpgradeRequestEntity } from "../db/entities/self-upgrade-request.entity";
import { SelfUpgradeAnalysisReportEntity } from "../db/entities/self-upgrade-analysis-report.entity";
import { SelfUpgradePatchSetEntity } from "../db/entities/self-upgrade-patch-set.entity";
import { SelfUpgradeReviewSessionEntity } from "../db/entities/self-upgrade-review-session.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { SandboxModule } from "../sandbox/sandbox.module";
import { BeastModule } from "../beast/beast.module";
import { CommonModule } from "../common/common.module";
import { SelfUpgradeService } from "./self-upgrade.service";
import { AdminSelfUpgradeController } from "./admin-self-upgrade.controller";

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      SelfUpgradeRequestEntity,
      SelfUpgradeAnalysisReportEntity,
      SelfUpgradePatchSetEntity,
      SelfUpgradeReviewSessionEntity,
      SandboxRunEntity,
      SandboxPatchProposalEntity,
      AuditEventEntity
    ]),
    SandboxModule,
    BeastModule
  ],
  controllers: [AdminSelfUpgradeController],
  providers: [SelfUpgradeService],
  exports: [SelfUpgradeService]
})
export class SelfUpgradeModule {}

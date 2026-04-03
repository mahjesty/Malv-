import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReflectionEventEntity } from "../db/entities/reflection-event.entity";
import { ImprovementProposalEntity } from "../db/entities/improvement-proposal.entity";
import { MalvControlledConfigEntity } from "../db/entities/malv-controlled-config.entity";
import { ReflectionService } from "./reflection.service";
import { ImprovementEvaluationService } from "./improvement-evaluation.service";
import { ImprovementProposalService } from "./improvement-proposal.service";
import { ImprovementApplicationService } from "./improvement-application.service";
import { MalvControlledConfigService } from "./malv-controlled-config.service";

@Module({
  imports: [TypeOrmModule.forFeature([ReflectionEventEntity, ImprovementProposalEntity, MalvControlledConfigEntity])],
  providers: [
    MalvControlledConfigService,
    ImprovementProposalService,
    ImprovementApplicationService,
    ImprovementEvaluationService,
    ReflectionService
  ],
  exports: [ReflectionService, ImprovementProposalService, ImprovementApplicationService, MalvControlledConfigService, ImprovementEvaluationService]
})
export class ImprovementModule {}

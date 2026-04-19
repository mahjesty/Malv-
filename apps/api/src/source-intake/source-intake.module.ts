import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SourceIntakeSessionEntity } from "../db/entities/source-intake-session.entity";
import { FileUnderstandingModule } from "../file-understanding/file-understanding.module";
import { CommonModule } from "../common/common.module";
import { BuildUnitModule } from "../build-units/build-unit.module";
import { SourceIntakeService } from "./source-intake.service";
import { SourceIntakeController } from "./source-intake.controller";
import { SourceIntakeModelReviewAdapterService } from "./review/source-intake-model-review-adapter.service";

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([SourceIntakeSessionEntity]),
    FileUnderstandingModule,
    BuildUnitModule
  ],
  controllers: [SourceIntakeController],
  providers: [SourceIntakeService, SourceIntakeModelReviewAdapterService],
  exports: [SourceIntakeService, SourceIntakeModelReviewAdapterService]
})
export class SourceIntakeModule {}

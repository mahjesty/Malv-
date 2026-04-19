import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import { SourceIntakeSessionEntity } from "../db/entities/source-intake-session.entity";
import { FileUnderstandingModule } from "../file-understanding/file-understanding.module";
import { BuildUnitModule } from "../build-units/build-unit.module";
import { DevExploreFixturesController } from "./dev-explore-fixtures.controller";
import { DevExploreFixturesGuard } from "./dev-explore-fixtures.guard";
import { DevExploreFixturesService } from "./dev-explore-fixtures.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([BuildUnitEntity, SourceIntakeSessionEntity]),
    FileUnderstandingModule,
    BuildUnitModule
  ],
  controllers: [DevExploreFixturesController],
  providers: [DevExploreFixturesService, DevExploreFixturesGuard],
  exports: [DevExploreFixturesService]
})
export class DevExploreFixturesModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import { BuildUnitTaskLinkEntity } from "../db/entities/build-unit-task-link.entity";
import { BuildUnitVersionEntity } from "../db/entities/build-unit-version.entity";
import { BuildUnitCompositionEntity } from "../db/entities/build-unit-composition.entity";
import { BuildUnitService } from "./build-unit.service";
import { LivePreviewDeliveryService } from "./live-preview-delivery.service";
import { FrontendPreviewBuilderService } from "./frontend-preview-builder.service";
import { BuildUnitController } from "./build-unit.controller";
import { BuildUnitCompositionController } from "./build-unit-composition.controller";
import { WorkspaceModule } from "../workspace/workspace.module";
import { BeastModule } from "../beast/beast.module";
import { FileUnderstandingModule } from "../file-understanding/file-understanding.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      BuildUnitEntity,
      BuildUnitTaskLinkEntity,
      BuildUnitVersionEntity,
      BuildUnitCompositionEntity
    ]),
    // WorkspaceModule exports WorkspaceProductivityService, which BuildUnitService
    // uses to create tasks when a unit is sent to MALV.
    WorkspaceModule,
    BeastModule,
    FileUnderstandingModule
  ],
  controllers: [BuildUnitController, BuildUnitCompositionController],
  providers:   [BuildUnitService, LivePreviewDeliveryService, FrontendPreviewBuilderService],
  exports:     [BuildUnitService, LivePreviewDeliveryService, FrontendPreviewBuilderService]
})
export class BuildUnitModule {}

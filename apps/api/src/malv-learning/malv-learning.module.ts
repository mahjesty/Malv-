import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MalvControlledConfigEntity } from "../db/entities/malv-controlled-config.entity";
import { MalvLearningSignalEntity } from "../db/entities/malv-learning-signal.entity";
import { MalvUserLearningProfileEntity } from "../db/entities/malv-user-learning-profile.entity";
import { MalvLearningService } from "./malv-learning.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MalvLearningSignalEntity, MalvUserLearningProfileEntity, MalvControlledConfigEntity])
  ],
  providers: [MalvLearningService],
  exports: [MalvLearningService]
})
export class MalvLearningModule {}

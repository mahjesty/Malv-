import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KillSwitchClient } from "./kill-switch.client";
import { KillSwitchService } from "./kill-switch.service";
import { KillSwitchEventEntity } from "../db/entities/kill-switch-event.entity";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([KillSwitchEventEntity])],
  providers: [KillSwitchClient, KillSwitchService],
  exports: [KillSwitchService]
})
export class KillSwitchModule {}


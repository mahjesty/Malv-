import { Module } from "@nestjs/common";
import { KillSwitchController } from "./kill-switch.controller";
import { KillSwitchService } from "./kill-switch.service";

@Module({
  controllers: [KillSwitchController],
  providers: [KillSwitchService],
  exports: [KillSwitchService]
})
export class KillSwitchModule {}


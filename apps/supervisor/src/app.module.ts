import { Module } from "@nestjs/common";
import { KillSwitchModule } from "./kill-switch/kill-switch.module";

@Module({
  imports: [KillSwitchModule]
})
export class AppModule {}


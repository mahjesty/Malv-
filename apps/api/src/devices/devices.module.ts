import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TrustedDeviceEntity } from "../db/entities/trusted-device.entity";
import { SessionEntity } from "../db/entities/session.entity";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { CommonModule } from "../common/common.module";
import { DevicesService } from "./devices.service";
import { DevicesController } from "./devices.controller";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Module({
  imports: [TypeOrmModule.forFeature([TrustedDeviceEntity, SessionEntity]), KillSwitchModule, CommonModule],
  controllers: [DevicesController],
  providers: [DevicesService, JwtAuthGuard],
  exports: [DevicesService]
})
export class DevicesModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VaultEntryEntity } from "../db/entities/vault-entry.entity";
import { VaultSessionEntity } from "../db/entities/vault-session.entity";
import { VaultService } from "./vault.service";
import { VaultController } from "./vault.controller";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([VaultEntryEntity, VaultSessionEntity]), KillSwitchModule, CommonModule],
  controllers: [VaultController],
  providers: [VaultService, JwtAuthGuard],
  exports: [VaultService]
})
export class VaultModule {}


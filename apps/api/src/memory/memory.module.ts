import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MemoryEntryEntity } from "../db/entities/memory-entry.entity";
import { MemoryService } from "./memory.service";
import { MemoryController } from "./memory.controller";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [TypeOrmModule.forFeature([MemoryEntryEntity]), KillSwitchModule, forwardRef(() => CommonModule)],
  controllers: [MemoryController],
  providers: [MemoryService, JwtAuthGuard],
  exports: [MemoryService]
})
export class MemoryModule {}


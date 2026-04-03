import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MalvStudioController } from "./malv-studio.controller";
import { MalvStudioService } from "./malv-studio.service";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { SandboxModule } from "../sandbox/sandbox.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StudioSessionStreamService } from "./studio-session-stream.service";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [
    forwardRef(() => SandboxModule),
    forwardRef(() => CommonModule),
    forwardRef(() => RealtimeModule),
    TypeOrmModule.forFeature([MalvStudioSessionEntity, SandboxPatchProposalEntity])
  ],
  controllers: [MalvStudioController],
  providers: [MalvStudioService, StudioSessionStreamService],
  exports: [StudioSessionStreamService]
})
export class MalvStudioModule {}

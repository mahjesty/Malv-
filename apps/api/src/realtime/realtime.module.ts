import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeGateway } from "./realtime.gateway";
import { ChatModule } from "../chat/chat.module";
import { VoiceModule } from "../voice/voice.module";
import { CommonModule } from "../common/common.module";
import { CallsModule } from "../calls/calls.module";
import { CollaborationModule } from "../collaboration/collaboration.module";
import { MalvStudioModule } from "../malv-studio/malv-studio.module";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CommonModule),
    forwardRef(() => ChatModule),
    forwardRef(() => CallsModule),
    forwardRef(() => CollaborationModule),
    forwardRef(() => VoiceModule),
    forwardRef(() => MalvStudioModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>("JWT_ACCESS_SECRET") ?? "change-me-access-secret",
        signOptions: {
          expiresIn: Number(cfg.get<string>("ACCESS_TOKEN_TTL_SECONDS") ?? 900),
          issuer: cfg.get<string>("JWT_ISSUER") ?? "malv",
          audience: cfg.get<string>("JWT_AUDIENCE") ?? "malv-users"
        }
      })
    })
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway]
})
export class RealtimeModule {}

